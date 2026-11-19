const { Buffer } = require('node:buffer');
const { createHash } = require('node:crypto');
const { lookup } = require('node:dns').promises;
const { createServer } = require('node:http');
const { request } = require('node:https');
const { BlockList } = require('node:net');
const { createBrotliDecompress, createGunzip, createInflate } = require('node:zlib');

const endpoint = '/api/product-preview';
const maxPage = 5 * 1024 * 1024;
const maxImage = 2 * 1024 * 1024;
const maxGalleryImages = 24;
const maxGalleryBytes = 16 * 1024 * 1024;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const decompress = new Map([['gzip', createGunzip], ['br', createBrotliDecompress], ['deflate', createInflate]]);
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
]) blocked.addSubnet(address, prefix);

class PreviewError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

function publicUrl(input, base) {
  if (typeof input !== 'string' || input.length > 4096) throw new PreviewError('Enter a valid HTTPS product link.', 400);
  let url;
  try { url = new URL(input, base); }
  catch { throw new PreviewError('Enter a valid HTTPS product link.', 400); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') ||
      /^[\d.]+$/.test(url.hostname) || /\.(local|internal|localhost|home|lan)\.?$/i.test(url.hostname)) {
    throw new PreviewError('Use a public HTTPS product link.', 400);
  }
  url.hash = '';
  return url;
}

function withAbort(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

async function requestPublic(url, signal, accept) {
  const addresses = await withAbort(lookup(url.hostname, { family: 4, all: true }), signal);
  if (!addresses.length || addresses.some(({ address }) => blocked.check(address))) {
    throw new PreviewError('Use a public HTTPS product link.', 400);
  }
  // Keep the retailer hostname for TLS but use only the address that was just checked.
  const { address } = addresses[0];
  return new Promise((resolve, reject) => {
    const outgoing = request(url, {
      agent: false,
      family: 4,
      autoSelectFamily: false,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
      signal,
      headers: { accept, 'accept-language': 'en-IN,en;q=0.9', 'user-agent': 'WorthItProductPreview/1.0' },
    }, resolve);
    outgoing.on('error', reject);
    outgoing.end();
  });
}

async function readLimited(stream, limit) {
  const parts = [];
  let size = 0;
  for await (const part of stream) {
    size += part.length;
    if (size > limit) throw new PreviewError('The store response was too large to import.');
    parts.push(part);
  }
  return Buffer.concat(parts, size);
}

async function fetchPublic(input, signal, includePage) {
  let url = publicUrl(input);
  for (let redirects = 0; redirects <= 4; redirects++) {
    const res = await requestPublic(url, signal, includePage ? 'text/html, application/xhtml+xml, image/*;q=0.8' : 'image/jpeg, image/png, image/webp');
    if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
      res.destroy();
      url = publicUrl(res.headers.location, url);
      continue;
    }
    const type = String(res.headers['content-type'] ?? '').split(';')[0].toLowerCase();
    const isPage = includePage && ['text/html', 'application/xhtml+xml'].includes(type);
    if (res.statusCode !== 200 || (!isPage && !imageTypes.has(type))) {
      res.destroy();
      throw new PreviewError('The store did not provide a preview for this link.');
    }
    const codec = decompress.get(res.headers['content-encoding']);
    const decoded = codec ? res.pipe(codec()) : res;
    if (decoded !== res) res.on('error', (error) => decoded.destroy(error));
    try {
      return { url, type, body: await readLimited(decoded, isPage ? maxPage : maxImage) };
    } finally {
      res.destroy();
    }
  }
  throw new PreviewError('This store link redirected too many times.');
}

function textContent(node) {
  return node.childNodes?.map((child) => child.value ?? '').join('') ?? '';
}

function findProduct(value) {
  const pending = [value];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    const kinds = [].concat(node['@type'] ?? []);
    if (kinds.some((kind) => typeof kind === 'string' && /(^|\/)Product$/i.test(kind))) return node;
    for (const child of Object.values(node)) if (child && typeof child === 'object') pending.push(child);
  }
  return undefined;
}

const clean = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

function priceInRupees(amount, currency) {
  if (String(currency).toUpperCase() !== 'INR') return null;
  const raw = String(amount ?? '').replace(/[₹,\s]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const whole = Math.round(Number(raw));
  return whole > 0 && whole <= 10_000_000 ? whole : null;
}

function amazonGallery(script) {
  const initial = /['"]colorImages['"]\s*:\s*\{\s*['"]initial['"]\s*:\s*\[/.exec(script);
  if (!initial) return [];
  const start = initial.index + initial[0].length - 1;
  let quoted = false;
  let depth = 1;
  for (let index = start + 1; index < script.length; index++) {
    const char = script[index];
    if (quoted && char === '\\') { index++; continue; }
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === '[') depth++;
    if (char === ']' && --depth === 0) {
      try { return JSON.parse(script.slice(start, index + 1)).map((image) => image?.hiRes || image?.large); }
      catch { return []; }
    }
  }
  return [];
}

function largestImage(attrs) {
  if (attrs['data-old-hires'] || attrs['data-zoom-image']) return attrs['data-old-hires'] || attrs['data-zoom-image'];
  try {
    const variants = Object.entries(JSON.parse(attrs['data-a-dynamic-image'] || '{}'));
    if (variants.length) return variants.sort(([, a], [, b]) => Number(b?.[0]) - Number(a?.[0]))[0][0];
  } catch { /* Fall back to the gallery image URL. */ }
  const sizes = (attrs['data-srcset'] || attrs.srcset || '').split(',').map((entry) => entry.trim().split(/\s+/));
  const largest = sizes.sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0))[0]?.[0];
  return largest || attrs['data-src'] || attrs.src;
}

function imageKey(value) {
  const url = new URL(value);
  if (url.hostname.endsWith('.media-amazon.com')) url.pathname = url.pathname.replace(/\._[^/]+_\.(jpg|png|webp)$/i, '.$1');
  return url.href;
}

async function extractProduct(html, base) {
  const { parse } = await import('parse5');
  const stack = [{ node: parse(html), gallery: false }];
  const metadata = new Map();
  const pictures = [];
  const productPictures = [];
  const isAmazon = /(^|\.)amazon\.[a-z.]+$/i.test(new URL(base).hostname);
  let product;
  let title = '';

  while (stack.length) {
    const current = stack.pop();
    const { node } = current;
    const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
    const gallery = current.gallery || /(?:product[-_ ]+(?:gallery|images|media)|\baltImages\b|\bimageBlock\b)/i.test(`${attrs.id || ''} ${attrs.class || ''}`);
    if (node.childNodes) {
      for (let index = node.childNodes.length - 1; index >= 0; index--) stack.push({ node: node.childNodes[index], gallery });
    }
    if (node.tagName === 'meta') {
      const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
      if (!attrs.content) continue;
      if (['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'image'].includes(key)) pictures.push(attrs.content);
      if (!metadata.has(key)) metadata.set(key, attrs.content);
    } else if (node.tagName === 'script' && attrs.type === 'application/ld+json' && !product) {
      try { product = findProduct(JSON.parse(textContent(node))); } catch { /* A malformed metadata block does not prevent using Open Graph. */ }
    } else if (node.tagName === 'script' && isAmazon) {
      for (const picture of amazonGallery(textContent(node))) productPictures.push(picture);
    } else if (node.tagName === 'title') {
      title = textContent(node);
    } else if (node.tagName === 'img' && (gallery || attrs.itemprop === 'image' || attrs.id === 'landingImage')) {
      pictures.push(largestImage(attrs));
    }
  }

  const candidates = [].concat(product?.image ?? []).map((image) => typeof image === 'string' ? image : image?.url || image?.contentUrl);
  const images = new Map();
  for (const image of [...candidates, ...productPictures, ...pictures]) {
    if (!image) continue;
    try {
      const href = publicUrl(image, base).href;
      const key = imageKey(href);
      if (!images.has(key)) images.set(key, href);
    } catch { /* Ignore unsupported image URLs. */ }
  }
  const offers = Array.isArray(product?.offers) ? product.offers : [product?.offers];
  const price = offers.map((offer) => priceInRupees(offer?.price ?? offer?.priceSpecification?.price, offer?.priceCurrency ?? offer?.priceSpecification?.priceCurrency))
    .find((amount) => amount !== null) ?? priceInRupees(metadata.get('product:price:amount') ?? metadata.get('price'),
    metadata.get('product:price:currency') ?? metadata.get('pricecurrency'));

  return { name: (clean(product?.name) || clean(metadata.get('og:title')) || clean(title)).slice(0, 80), price, images: [...images.values()] };
}

function imageData(result) {
  const { body, type } = result;
  const jpeg = type === 'image/jpeg' && body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  const png = type === 'image/png' && body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const webp = type === 'image/webp' && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP';
  if (body.length > maxImage || (!jpeg && !png && !webp)) throw new PreviewError('The store image was unavailable.');
  return { mimeType: type, base64: body.toString('base64') };
}

async function importProduct(input) {
  const signal = AbortSignal.timeout(25_000);
  const result = await fetchPublic(input, signal, true);
  if (imageTypes.has(result.type)) return { name: '', price: null, images: [imageData(result)] };
  const preview = await extractProduct(result.body.toString('utf8'), result.url);
  const candidates = preview.images.slice(0, 48);
  const available = [];
  const fingerprints = new Set();
  let size = 0;
  let limited = candidates.length < preview.images.length;
  for (let start = 0; start < candidates.length && !signal.aborted; start += 6) {
    const fetched = await Promise.allSettled(candidates.slice(start, start + 6).map((url) => fetchPublic(url, signal, false)));
    for (const response of fetched) {
      if (response.status === 'rejected') continue;
      const file = response.value;
      const fingerprint = createHash('sha256').update(file.body).digest('hex');
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      if (available.length === maxGalleryImages || size + file.body.length > maxGalleryBytes) { limited = true; continue; }
      try { available.push(imageData(file)); size += file.body.length; } catch { /* Ignore invalid images. */ }
    }
    if (available.length === maxGalleryImages) { limited ||= start + 6 < candidates.length; break; }
  }
  if (!available.length) throw new PreviewError('No product images were available from this store.');
  return { name: preview.name, price: preview.price, images: available, limited: limited || signal.aborted };
}

const recent = new Map();
let inFlight = 0;

function allowedRequest(req) {
  const origin = req.headers.origin;
  if (!origin || origin === process.env.PRODUCT_IMPORT_ORIGIN) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function respond(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function productImportMiddleware(req, res, next) {
  if (req.url?.split('?')[0] !== endpoint) return next();
  if (!allowedRequest(req)) return respond(res, 403, { error: 'This preview server does not accept requests from this site.' });
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (req.method !== 'POST') return respond(res, 405, { error: 'Use POST to import product links.' });
  if (String(req.headers['content-type']).split(';')[0] !== 'application/json') return respond(res, 415, { error: 'Expected a JSON product link.' });

  const now = Date.now();
  for (const [address, window] of recent) if (window.until <= now) recent.delete(address);
  const address = req.socket.remoteAddress;
  const window = recent.get(address) ?? { count: 0, until: now + 60_000 };
  if (inFlight >= 4 || window.count >= 12) return respond(res, 429, { error: 'Too many previews. Try again in a moment.' });
  recent.set(address, { ...window, count: window.count + 1 });
  inFlight++;

  void (async () => {
    try {
      let payload;
      try { payload = JSON.parse((await readLimited(req, 8192)).toString('utf8')); }
      catch { throw new PreviewError('Enter a valid HTTPS product link.', 400); }
      respond(res, 200, await importProduct(payload?.url));
    } catch (error) {
      const message = error instanceof PreviewError ? error.message : 'Could not load a preview from this store.';
      if (!res.destroyed) respond(res, error instanceof PreviewError ? error.status : 422, { error: message });
    } finally {
      inFlight--;
    }
  })();
}

module.exports = { productImportMiddleware, extractProduct, importProduct };

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  const server = createServer({ requestTimeout: 30_000 }, (req, res) =>
    productImportMiddleware(req, res, () => respond(res, 404, { error: 'Not found.' })));
  server.listen(port, '0.0.0.0', () => console.log(`Product previews listening on port ${port}`));
}
