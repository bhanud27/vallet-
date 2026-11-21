const { extractIntelligence, failureCode } = require("./product-model.cjs");
const {
  createFallbacks,
  configuredProviders,
} = require("./product-fallbacks.cjs");
const { createBrowserFallback } = require("./product-browser.cjs");
const { requestIdentity } = require("./product-auth.cjs");
const { createRetailerPolicy } = require("./retailer-policy.cjs");
const {
  imageResolution,
  retailerPlatform,
  permittedPageRedirect,
  retailerPageUrl,
  imageIdentity,
  jsonAssignment,
  retailerProduct,
  retailerImages,
} = require("./retailer-images.cjs");
const { Buffer } = require("node:buffer");
const { createHash } = require("node:crypto");
const { lookup } = require("node:dns").promises;
const { createServer } = require("node:http");
const { request, Agent } = require("node:https");
const publicAgent = new Agent({
  keepAlive: true,
  maxSockets: 12,
  maxFreeSockets: 2,
  timeout: 9000,
});
const { BlockList } = require("node:net");
const {
  createBrotliDecompress,
  createGunzip,
  createInflate,
} = require("node:zlib");

const endpoint = "/api/product-preview";
const maxPage = 5 * 1024 * 1024;
const maxImage = 8 * 1024 * 1024;
const maxGalleryImages = 24;
const maxGalleryBytes = 20 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const decompress = new Map([
  ["gzip", createGunzip],
  ["br", createBrotliDecompress],
  ["deflate", createInflate],
]);
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
])
  blocked.addSubnet(address, prefix);

class PreviewError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

function publicUrl(input, base) {
  if (typeof input !== "string" || input.length > 4096)
    throw new PreviewError("Enter a valid HTTPS product link.", 400);
  let url;
  try {
    url = new URL(input, base);
  } catch {
    throw new PreviewError("Enter a valid HTTPS product link.", 400);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".") ||
    /^[\d.]+$/.test(url.hostname) ||
    /\.(local|internal|localhost|home|lan)\.?$/i.test(url.hostname)
  ) {
    throw new PreviewError("Use a public HTTPS product link.", 400);
  }
  url.hash = "";
  return url;
}

function withAbort(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", cancel));
  });
}

async function requestPublic(url, signal, accept, options = {}) {
  const addresses = await withAbort(
    (options.resolve || lookup)(url.hostname, { family: 4, all: true }),
    signal,
  );
  if (
    !addresses.length ||
    addresses.some(({ address }) => blocked.check(address))
  ) {
    throw new PreviewError("Use a public HTTPS product link.", 400);
  }
  // Keep the retailer hostname for TLS but use only the address that was just checked.
  const { address } = addresses[0];
  return new Promise((resolve, reject) => {
    const outgoing = (options.transport || request)(
      url,
      {
        agent: options.transport ? false : publicAgent,
        family: 4,
        autoSelectFamily: false,
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        signal,
        headers: {
          accept,
          "accept-language": "en-IN,en;q=0.9",
          "user-agent": "WorthItProductPreview/1.0",
        },
      },
      resolve,
    );
    outgoing.on("error", reject);
    outgoing.end();
  });
}

async function readLimited(stream, limit) {
  const parts = [];
  let size = 0;
  for await (const part of stream) {
    size += part.length;
    if (size > limit)
      throw new PreviewError("The store response was too large to import.");
    parts.push(part);
  }
  return Buffer.concat(parts, size);
}

async function fetchPublic(input, signal, includePage, options = {}) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(9000)]);
  let url = publicUrl(retailerPageUrl(publicUrl(input).href));
  const initial = url.href;
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (!options.text && options.beforeRequest)
      await options.beforeRequest(url.href, signal);
    const res = await requestPublic(
      url,
      signal,
      options.text
        ? "text/plain"
        : includePage
          ? "text/html, application/xhtml+xml, image/*;q=0.8"
          : "image/jpeg, image/png, image/webp",
      options,
    );
    if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
      res.destroy();
      const target = publicUrl(
        retailerPageUrl(publicUrl(res.headers.location, url).href),
      );
      if (
        (includePage && !permittedPageRedirect(initial, target.href)) ||
        (options.text && target.origin !== new URL(initial).origin)
      )
        throw new PreviewError(
          "The store redirected away from its product website. Use its full product link or enter details manually.",
        );
      url = target;
      continue;
    }
    const contentType = String(res.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const type = contentType === "image/jpg" ? "image/jpeg" : contentType;
    const isText = options.text && ["text/plain", "text/html"].includes(type);
    const isPage =
      includePage &&
      (["text/html", "application/xhtml+xml"].includes(type) ||
        (options.resource &&
          [
            "application/javascript",
            "text/javascript",
            "application/json",
            "text/css",
          ].includes(type)));
    const genericImage = !type || type === "application/octet-stream";
    if (
      res.statusCode !== 200 ||
      (options.text
        ? !isText
        : !isPage && !imageTypes.has(type) && !genericImage)
    ) {
      res.destroy();
      const error = new PreviewError(
        [401, 403, 429].includes(res.statusCode)
          ? "This store requires opening its product page in a browser. Use the full website product link or add photos manually."
          : "The store did not provide a preview for this link.",
      );
      if (res.statusCode === 200) error.code = "UNSUPPORTED_URL";
      error.remoteStatus = res.statusCode;
      error.retryAfter = res.headers["retry-after"];
      throw error;
    }
    const codec = decompress.get(res.headers["content-encoding"]);
    const decoded = codec ? res.pipe(codec()) : res;
    if (decoded !== res) res.on("error", (error) => decoded.destroy(error));
    try {
      const body = await readLimited(
        decoded,
        isText ? 512 * 1024 : isPage ? maxPage : maxImage,
      );
      const actualType = isPage || isText ? type : detectImageMime(body);
      if (
        !actualType ||
        (!isPage && !isText && !genericImage && actualType !== type)
      ) {
        throw new PreviewError("The store image was unavailable.");
      }
      return { url, type: actualType, body };
    } finally {
      res.destroy();
    }
  }
  throw new PreviewError("This store link redirected too many times.");
}

function textContent(node) {
  return node.childNodes?.map((child) => child.value ?? "").join("") ?? "";
}

function findProduct(value, base) {
  const candidates = [];
  const pending = [value];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    const kinds = [].concat(node["@type"] ?? []);
    if (
      kinds.some(
        (kind) =>
          typeof kind === "string" &&
          /(^|\/)(Product|ProductGroup|IndividualProduct)$/i.test(kind),
      )
    ) {
      candidates.push(node);
      continue;
    }
    const children = Object.values(node).filter(
      (child) => child && typeof child === "object",
    );
    for (let index = children.length - 1; index >= 0; index--)
      pending.push(children[index]);
  }
  return (
    candidates.find((node) => isPageProduct(node, base)) ??
    candidates.find(
      (node) => !node.url && !node["@id"] && !node.mainEntityOfPage,
    )
  );
}

function isPageProduct(node, base) {
  try {
    const url = new URL(
      node.url || node["@id"] || node.mainEntityOfPage?.["@id"],
      base,
    );
    const page = new URL(base);
    return (
      url.origin === page.origin &&
      url.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

const clean = (value) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

function productAmount(amount) {
  const raw = String(amount ?? "").replace(/[₹,$€£\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const value = Number(raw);
  return value > 0 && value <= 10000000 ? value : null;
}
const valueName = (value) =>
  Array.isArray(value)
    ? value.map(valueName).filter(Boolean).join(" > ")
    : clean(
        typeof value === "object" && value
          ? value.name || value.label || value.typeName || value.value
          : value,
      );
const currencyCode = (value) =>
  /^[A-Z]{3}$/.test(String(value ?? "").toUpperCase())
    ? String(value).toUpperCase()
    : null;

function amazonGallery(script) {
  const initial =
    /['"]colorImages['"]\s*:\s*\{\s*['"]initial['"]\s*:\s*\[/.exec(script);
  if (!initial) return [];
  const start = initial.index + initial[0].length - 1;
  let quoted = false;
  let depth = 1;
  for (let index = start + 1; index < script.length; index++) {
    const char = script[index];
    if (quoted && char === "\\") {
      index++;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === "[") depth++;
    if (char === "]" && --depth === 0) {
      try {
        return JSON.parse(script.slice(start, index + 1)).map(
          (image) => image?.hiRes || image?.large,
        );
      } catch {
        return [];
      }
    }
  }
  return [];
}

function largestImage(attrs) {
  const original =
    attrs["data-old-hires"] ||
    attrs["data-zoom-image"] ||
    attrs["data-large_image"] ||
    attrs["data-master"] ||
    attrs["data-zoom-src"] ||
    attrs["data-full-size-image-url"];
  if (original) return original;
  try {
    const variants = Object.entries(
      JSON.parse(attrs["data-a-dynamic-image"] || "{}"),
    );
    if (variants.length)
      return variants.sort(
        ([, a], [, b]) => Number(b?.[0]) - Number(a?.[0]),
      )[0][0];
  } catch {
    /* Fall back to the gallery image URL. */
  }
  const sizes = (attrs["data-srcset"] || attrs.srcset || "")
    .split(",")
    .map((entry) => entry.trim().split(/\s+/));
  const largest = sizes.sort(
    (a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0),
  )[0]?.[0];
  return (
    largest ||
    attrs["data-src"] ||
    attrs["data-original"] ||
    attrs["data-lazy-src"] ||
    attrs["data-image-url"] ||
    attrs.src
  );
}

function imageReferences(values) {
  return []
    .concat(values ?? [])
    .flatMap((value) =>
      typeof value === "string"
        ? [value]
        : [
            value?.contentUrl ||
              value?.src ||
              value?.url ||
              value?.preview_image?.src ||
              value?.preview_image?.url ||
              value?.["@id"],
          ].filter(Boolean),
    );
}

function embeddedProduct(attrs, node) {
  const signature = `${attrs.id || ""} ${attrs.class || ""}`;
  const source =
    attrs["data-product-json"] ||
    attrs["data-product"] ||
    (attrs.type === "application/json" && /product/i.test(signature)
      ? textContent(node)
      : "");
  if (!source || source.length > maxPage) return undefined;
  try {
    const parsed = JSON.parse(source);
    const product = parsed?.product ?? parsed;
    return product &&
      typeof product.title === "string" &&
      (Array.isArray(product.images) || Array.isArray(product.media))
      ? product
      : undefined;
  } catch {
    return undefined;
  }
}

async function extractProduct(html, base) {
  const { parse } = await import("parse5");
  const stack = [{ node: parse(html), gallery: false }];
  const metadata = new Map();
  const pictures = [];
  const productPictures = [];
  const isAmazon = /(^|\.)amazon\.[a-z.]+$/i.test(new URL(base).hostname);
  let product;
  let storefrontProduct;
  let retailerData;
  let title = "";

  while (stack.length) {
    const current = stack.pop();
    const { node } = current;
    const attrs = Object.fromEntries(
      (node.attrs ?? []).map(({ name, value }) => [name, value]),
    );
    const signature = `${attrs.id || ""} ${attrs.class || ""} ${attrs["data-testid"] || ""}`;
    const gallery =
      current.gallery ||
      /(?:product[-_ ]*(?:gallery|images|media|carousel)|\baltImages\b|\bimageBlock\b)/i.test(
        signature,
      );
    if (node.childNodes) {
      for (let index = node.childNodes.length - 1; index >= 0; index--)
        stack.push({ node: node.childNodes[index], gallery });
    }
    if (node.tagName === "meta") {
      const key = (
        attrs.property ||
        attrs.name ||
        attrs.itemprop ||
        ""
      ).toLowerCase();
      if (!attrs.content) continue;
      if (
        [
          "og:image",
          "og:image:url",
          "og:image:secure_url",
          "twitter:image",
          "twitter:image:src",
          "image",
        ].includes(key)
      )
        pictures.push(attrs.content);
      if (!metadata.has(key)) metadata.set(key, attrs.content);
    } else if (
      node.tagName === "script" &&
      attrs.type === "application/ld+json"
    ) {
      try {
        const candidate = findProduct(JSON.parse(textContent(node)), base);
        if (
          candidate &&
          (!product ||
            (!isPageProduct(product, base) && isPageProduct(candidate, base)))
        )
          product = candidate;
      } catch {
        /* Continue with the other metadata on the page. */
      }
    } else if (node.tagName === "script") {
      const script = textContent(node);
      if (isAmazon)
        for (const picture of amazonGallery(script))
          productPictures.push(picture);
      let state;
      if (attrs.type === "application/json" || attrs.id === "__NEXT_DATA__") {
        try {
          state = JSON.parse(script);
        } catch {}
      }
      state ??= jsonAssignment(script, [
        "__myx",
        "__PRELOADED_STATE__",
        "__INITIAL_STATE__",
      ]);
      retailerData ??= state && retailerProduct(state, base);
    } else if (node.tagName === "title") {
      title = textContent(node);
    } else if (node.tagName === "link") {
      if (
        attrs.href &&
        (attrs.rel === "image_src" || attrs.itemprop === "image")
      )
        pictures.push(attrs.href);
    } else if (
      (node.tagName === "img" || node.tagName === "source") &&
      (gallery || attrs.itemprop === "image" || attrs.id === "landingImage")
    ) {
      pictures.push(largestImage(attrs));
    } else if (attrs.itemprop && attrs.content) {
      const key = attrs.itemprop.toLowerCase();
      if (!metadata.has(key)) metadata.set(key, attrs.content);
    }
    storefrontProduct ??= embeddedProduct(attrs, node);
  }

  const variant = Array.isArray(product?.hasVariant)
    ? (product.hasVariant.find((item) => isPageProduct(item, base)) ??
      product.hasVariant[0])
    : undefined;
  const candidates = [
    ...retailerImages(retailerData),
    ...imageReferences(product?.image ?? variant?.image),
    ...imageReferences(storefrontProduct?.images),
    ...imageReferences(storefrontProduct?.media),
  ];
  const images = new Map();
  // Amazon's gallery supplies high-resolution variants of images also listed in metadata.
  for (const image of [...productPictures, ...candidates, ...pictures]) {
    if (!image) continue;
    try {
      const href = publicUrl(image, base).href;
      const key = imageIdentity(href);
      if (
        !images.has(key) ||
        imageResolution(href) > imageResolution(images.get(key))
      )
        images.set(key, href);
    } catch {
      /* Ignore unsupported image URLs. */
    }
  }
  const offers = [].concat(product?.offers ?? variant?.offers ?? []);
  const offer = offers.find(
    (item) =>
      productAmount(
        item?.price ?? item?.lowPrice ?? item?.priceSpecification?.price,
      ) !== null,
  );
  const metaCurrency =
    metadata.get("product:price:currency") ??
    metadata.get("og:price:currency") ??
    metadata.get("pricecurrency");
  const storePrice =
    retailerData?.price?.discounted ??
    retailerData?.price?.value ??
    retailerData?.price?.sellingPrice ??
    retailerData?.discountedPrice ??
    retailerData?.price;
  const price =
    productAmount(storePrice) ??
    productAmount(
      offer?.price ?? offer?.lowPrice ?? offer?.priceSpecification?.price,
    ) ??
    productAmount(
      metadata.get("product:price:amount") ??
        metadata.get("og:price:amount") ??
        metadata.get("price"),
    );
  const currency = currencyCode(
    (productAmount(storePrice) !== null
      ? (retailerData?.price?.currencyIso ??
        retailerData?.price?.currency ??
        retailerData?.currency)
      : undefined) ??
      offer?.priceCurrency ??
      offer?.priceSpecification?.priceCurrency ??
      metaCurrency,
  );
  const name =
    clean(
      retailerData?.name || retailerData?.title || retailerData?.productName,
    ) ||
    clean(product?.name) ||
    clean(storefrontProduct?.title) ||
    clean(metadata.get("og:title")) ||
    clean(metadata.get("twitter:title")) ||
    clean(metadata.get("name")) ||
    (images.size || price ? clean(title) : "");
  const descriptionText = [
    retailerData?.description,
    retailerData?.productDescription,
    retailerData?.productDetails,
    product?.description,
    storefrontProduct?.description,
    metadata.get("og:description"),
    metadata.get("description"),
  ].find((value) => typeof value === "string" && value.trim());
  const fragment =
    typeof descriptionText === "string" ? parse(descriptionText) : null;
  const pending = fragment ? [fragment] : [],
    descriptionParts = [];
  while (pending.length) {
    const n = pending.pop();
    if (["script", "style"].includes(n.tagName)) continue;
    if (n.nodeName === "#text") descriptionParts.push(n.value);
    for (const child of [...(n.childNodes || [])].reverse())
      pending.push(child);
  }
  const description = clean(descriptionParts.join(" ")).slice(0, 2000);
  const brand = valueName(
    retailerData?.brand ??
      retailerData?.brandName ??
      product?.brand ??
      storefrontProduct?.vendor ??
      metadata.get("product:brand"),
  ).slice(0, 120);
  const category = valueName(
    retailerData?.articleType ??
      retailerData?.categoryName ??
      retailerData?.category ??
      retailerData?.productCategory ??
      retailerData?.categories ??
      product?.category ??
      storefrontProduct?.type ??
      metadata.get("product:category"),
  ).slice(0, 160);
  if (
    !product &&
    !retailerData &&
    !storefrontProduct &&
    /access denied|captcha|verify (?:you|your)|robot check|just a moment|security check|page not found/i.test(
      title + " " + name,
    )
  )
    throw new PreviewError(
      "This store did not make the product page accessible. Add details and photos manually.",
    );
  const safeImages = [...images.values()].filter(
    (image) =>
      !/(?:^|[\/_-])(?:placeholder|no[-_]?image|image[-_]?not[-_]?found|spacer|sprite|logo|transparent)(?:[\/_.-]|$)/i.test(
        new URL(image).pathname,
      ),
  );
  return {
    name: name.slice(0, 80),
    price,
    currency,
    description,
    brand,
    category,
    productUrl: retailerPageUrl(base),
    platform: retailerPlatform(base),
    images: safeImages,
  };
}

function detectImageMime(body) {
  if (
    body.length > 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  )
    return "image/jpeg";
  if (body.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "image/png";
  if (
    body.toString("ascii", 0, 4) === "RIFF" &&
    body.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

function imageData({ body, type }) {
  return { mimeType: type, base64: body.toString("base64") };
}

async function usableImage(file) {
  try {
    const sharp = require("sharp");
    const metadata = await sharp(file.body, {
      limitInputPixels: 12000000,
    }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      Math.min(metadata.width, metadata.height) < 150 ||
      Math.max(metadata.width, metadata.height) < 300
    )
      return null;
    const bytes = await sharp(file.body, {
      limitInputPixels: 12000000,
      animated: false,
    })
      .rotate()
      .resize({
        width: 1600,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88 })
      .toBuffer();
    return imageData({ body: bytes, type: "image/jpeg" });
  } catch {
    return null;
  }
}

function createProductImporter(options = {}) {
  const rawFetch = options.fetchFile || fetchPublic;
  const fetchFile = async (...args) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await rawFetch(...args);
      } catch (error) {
        if (
          attempt ||
          !(
            [429, 500, 502, 503, 504].includes(error.remoteStatus) ||
            ["ECONNRESET", "EAI_AGAIN", "ETIMEDOUT"].includes(error.code)
          )
        )
          throw error;
        const retry = error.retryAfter;
        const delay = retry
          ? /^\d+$/.test(retry)
            ? Number(retry) * 1000
            : Math.max(0, Date.parse(retry) - Date.now())
          : 180 + Math.random() * 150;
        if (!Number.isFinite(delay) || delay > 1200) throw error;
        const { setTimeout } = require("node:timers/promises");
        await setTimeout(delay, undefined, { signal: args[1] });
      }
    }
  };
  const policy = options.policy || createRetailerPolicy(fetchFile),
    cache = new Map(),
    pending = new Map();
  const aliases = new Map(),
    retailerWork = new Map();
  const fallbacks = createFallbacks({
    providers: options.providers || configuredProviders(),
  });
  const browser = createBrowserFallback({
    fetchFile,
    policy,
    allowedHosts:
      options.browserHosts ||
      (process.env.PRODUCT_BROWSER_HOSTS || "").split(",").filter(Boolean),
  });
  const priceTTL = Math.min(
    3600000,
    Math.max(
      1,
      Number(options.ttl || process.env.PRODUCT_PRICE_TTL_MS) || 300000,
    ),
  );
  const identityTTL = Math.min(
    86400000,
    Math.max(
      priceTTL,
      Number(options.identityTTL || process.env.PRODUCT_IDENTITY_TTL_MS) ||
        3600000,
    ),
  );
  const negativeTTL = Math.min(
    300000,
    Math.max(
      1,
      Number(options.negativeTTL || process.env.PRODUCT_NEGATIVE_TTL_MS) ||
        30000,
    ),
  );
  const copyHosts =
    options.imageCopyHosts ||
    (process.env.PRODUCT_IMAGE_COPY_HOSTS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const copyRestricted =
    copyHosts.length > 0 || process.env.NODE_ENV === "production";
  const log = options.log || ((entry) => console.info(JSON.stringify(entry)));
  let cachedBytes = 0;
  const metadataCache = new Map(),
    metadataPending = new Map();
  async function readMetadata(input) {
    input = publicUrl(input).href;
    const signal = AbortSignal.timeout(
      Math.min(
        20000,
        Math.max(
          1,
          Number(options.timeout || process.env.PRODUCT_EXTRACT_TIMEOUT_MS) ||
            20000,
        ),
      ),
    );
    let result,
      restrictedProvider = false;
    try {
      await policy(retailerPageUrl(input), signal);
      result = await fetchFile(input, signal, true, { beforeRequest: policy });
      if (result.url.href !== retailerPageUrl(input))
        await policy(result.url.href, signal);
    } catch (error) {
      const extra = await fallbacks({
        url: input,
        retailer: retailerPlatform(input),
        signal,
        restricted: true,
      });
      if (extra.html) {
        result = {
          url: new URL(input),
          type: "text/html",
          body: Buffer.from(extra.html),
        };
        restrictedProvider = true;
      } else {
        if (new URL(input).hostname === "ajioapps.onelink.me")
          throw Object.assign(
            new PreviewError(
              "The AJIO share link could not be resolved publicly. Try its full ajio.com product link, or add original photos manually.",
            ),
            { code: failureCode(error) },
          );
        throw error;
      }
    }
    if (imageTypes.has(result.type)) {
      const canCopy =
        !copyRestricted || copyHosts.includes(result.url.hostname);
      const image = canCopy ? await usableImage(result) : null;
      const intelligence = await extractIntelligence(
        "",
        result.url.href,
        { name: "", images: [result.url.href] },
        publicUrl,
      );
      const info = intelligence.product.images[0];
      if (info) {
        info.status = image ? "validated" : "failed";
        if (!image)
          info.code = canCopy
            ? "IMAGE_UNSUPPORTED_OR_TOO_SMALL"
            : "IMAGE_COPY_NOT_AUTHORIZED";
      }
      return {
        ready: {
          ...intelligence,
          name: "",
          price: null,
          currency: null,
          description: "",
          brand: "",
          category: "",
          productUrl: result.url.href,
          platform: retailerPlatform(result.url.href),
          images: image ? [image] : [],
          warning: image
            ? undefined
            : "This image is too small or unsupported. Add an original product photo instead.",
        },
      };
    }
    const platform = retailerPlatform(result.url.href);
    if (
      (platform === "myntra" && !/\/\d+\/buy\/?$/.test(result.url.pathname)) ||
      (platform === "ajio" && !/\/p\/[^/]+\/?$/.test(result.url.pathname))
    )
      throw new PreviewError(
        "This link did not return a product page. Use the full product link, or add details and photos manually.",
      );
    let html = result.body.toString("utf8");
    let preview;
    try {
      preview = await extractProduct(html, result.url);
    } catch (error) {
      error.code = "ACCESS_RESTRICTED";
      throw error;
    }
    let intelligence = await extractIntelligence(
      html,
      result.url.href,
      preview,
      publicUrl,
    );
    if (restrictedProvider) {
      intelligence.extraction.provider = true;
      intelligence.extraction.method = "authorized_provider";
      for (const v of Object.values(intelligence.extraction.provenance))
        if (v.source) v.source = "authorized_provider";
    }
    const incomplete =
      !intelligence.product.title ||
      !intelligence.product.images.length ||
      intelligence.product.price.current == null;
    if (incomplete && !restrictedProvider) {
      const extra = await fallbacks({
        url: result.url.href,
        retailer: platform,
        signal,
        restricted: false,
        browser,
      });
      intelligence.extraction.fallback_failures = extra.failures;
      if (extra.html) {
        const extraLegacy = await extractProduct(extra.html, result.url);
        const additional = await extractIntelligence(
          extra.html,
          result.url.href,
          extraLegacy,
          publicUrl,
        );
        // Fill missing fields only. Source data is never silently replaced by a fallback.
        for (const [key, value] of Object.entries(additional.product)) {
          if (
            intelligence.product[key] == null ||
            (Array.isArray(intelligence.product[key]) &&
              !intelligence.product[key].length)
          )
            intelligence.product[key] = value;
        }
        for (const key of ["current", "original", "currency"])
          if (intelligence.product.price[key] == null)
            intelligence.product.price[key] = additional.product.price[key];
        const price = intelligence.product.price;
        if (
          price.current != null &&
          price.original != null &&
          price.original >= price.current
        ) {
          price.discount_amount = +(price.original - price.current).toFixed(2);
          price.discount_percentage = Math.round(
            ((price.original - price.current) / price.original) * 100,
          );
        }
        intelligence.extraction.provider =
          extra.method === "authorized_provider";
        intelligence.extraction.browser = extra.method === "rendered_page";
        for (const [key, value] of Object.entries(
          additional.extraction.provenance,
        ))
          if (
            intelligence.extraction.provenance[key]?.state === "missing" &&
            value.source
          )
            intelligence.extraction.provenance[key] = {
              ...value,
              source: extra.method,
            };
        intelligence.extraction.method += "+" + extra.method;
      }
    }
    const model = intelligence.product;
    preview = {
      ...preview,
      name: model.title || "",
      price: model.price.current,
      currency: model.price.currency,
      description: model.description || "",
      brand: model.brand || "",
      category: model.category || "",
      images: model.images.map((i) => i.url),
    };
    if (
      !preview.images.length &&
      !preview.name &&
      preview.price === null &&
      !preview.description &&
      !preview.brand &&
      !preview.category
    )
      throw Object.assign(
        new PreviewError(
          "No product information was accessible for this link. Add details and photos manually.",
        ),
        { code: "METADATA_NOT_FOUND" },
      );
    return { preview, intelligence };
  }
  async function loadProduct(input, detailsOnly = false) {
    let metadata;
    const cachedMetadata = metadataCache.get(input);
    if (cachedMetadata?.until > Date.now())
      metadata = structuredClone(cachedMetadata.value);
    else {
      let task = metadataPending.get(input);
      if (!task) {
        task = readMetadata(input);
        metadataPending.set(input, task);
      }
      try {
        metadata = structuredClone(await task);
        if (Buffer.byteLength(JSON.stringify(metadata)) <= 512 * 1024) {
          while (metadataCache.size >= 16)
            metadataCache.delete(metadataCache.keys().next().value);
          metadataCache.set(input, {
            value: structuredClone(metadata),
            until: Date.now() + priceTTL,
          });
        }
      } finally {
        if (metadataPending.get(input) === task) metadataPending.delete(input);
      }
    }
    if (metadata.ready) return metadata.ready;
    const { preview, intelligence } = metadata;
    const model = intelligence.product;
    if (detailsOnly)
      return {
        ...preview,
        ...intelligence,
        images: [],
        imagesPending: preview.images.length > 0,
        originalPrice: model.price.original,
        discountPercentage: model.price.discount_percentage,
      };
    const signal = AbortSignal.timeout(
      Math.min(8000, Math.max(1, Number(options.imageTimeout) || 8000)),
    );
    const candidates = preview.images.slice(0, 48);
    const available = [];
    const fingerprints = new Set();
    let size = 0;
    let lowQuality = false;
    let limited = candidates.length < preview.images.length;
    for (
      let start = 0;
      start < candidates.length && !signal.aborted;
      start += 3
    ) {
      const fetched = await Promise.allSettled(
        candidates.slice(start, start + 3).map(async (url) => {
          if (copyRestricted && !copyHosts.includes(new URL(url).hostname))
            throw Object.assign(
              new Error("Image copying is not enabled for this source."),
              { code: "IMAGE_COPY_NOT_AUTHORIZED" },
            );
          return fetchFile(url, signal, false, { beforeRequest: policy });
        }),
      );
      for (let index = 0; index < fetched.length; index++) {
        const response = fetched[index],
          info = model.images[start + index];
        if (response.status === "rejected") {
          info.status = "failed";
          info.code =
            response.reason?.code === "IMAGE_COPY_NOT_AUTHORIZED"
              ? "IMAGE_COPY_NOT_AUTHORIZED"
              : [401, 403].includes(response.reason?.remoteStatus)
                ? "IMAGE_ACCESS_DENIED"
                : failureCode(response.reason || {});
          continue;
        }
        const file = response.value;
        const fingerprint = createHash("sha256")
          .update(file.body)
          .digest("hex");
        if (fingerprints.has(fingerprint)) {
          info.status = "duplicate";
          continue;
        }
        fingerprints.add(fingerprint);
        if (
          available.length === maxGalleryImages ||
          size + file.body.length > maxGalleryBytes
        ) {
          info.status = "not_checked";
          info.code = "IMAGE_BUDGET_EXCEEDED";
          limited = true;
          continue;
        }
        const image = await usableImage(file);
        if (!image) {
          info.status = "failed";
          info.code = "IMAGE_UNSUPPORTED_OR_TOO_SMALL";
          lowQuality = true;
          continue;
        }
        const dimensions = await require("sharp")(
          Buffer.from(image.base64, "base64"),
        ).metadata();
        Object.assign(info, {
          status: "validated",
          width: dimensions.width,
          height: dimensions.height,
          delivery: "sanitized_inline",
        });
        available.push(image);
        size += file.body.length;
      }
      if (available.length === maxGalleryImages) {
        limited ||= start + 3 < candidates.length;
        break;
      }
    }
    const { images: _remoteImages, ...details } = preview;
    return {
      ...details,
      ...intelligence,
      images: available,
      originalPrice: model.price.original,
      discountPercentage: model.price.discount_percentage,
      limited: limited || signal.aborted,
      warning: lowQuality
        ? "Some store images were too small or unsupported and were skipped. You can add original photos manually."
        : !available.length
          ? "No usable product photos were available. Add your own photos, or continue with the product link."
          : signal.aborted
            ? "Some images took too long. Available details were kept."
            : undefined,
    };
  }

  return async function importProduct(
    input,
    refresh = false,
    detailsOnly = false,
  ) {
    const originalInput = publicUrl(input).href;
    const clientValue = (value) => {
      const result = structuredClone(value);
      if (result.source) result.source.original_url = originalInput;
      return result;
    };
    const requestedKey = retailerPageUrl(originalInput),
      now = Date.now();
    const pageKey = aliases.get(requestedKey) || requestedKey;
    const key = pageKey + (detailsOnly ? "#metadata" : "");
    if (refresh) {
      metadataCache.delete(pageKey);
      for (const oldKey of [pageKey, pageKey + "#metadata"]) {
        const old = cache.get(oldKey);
        if (old) {
          cachedBytes -= old.bytes;
          cache.delete(oldKey);
        }
      }
    }
    const retailer = retailerPlatform(pageKey),
      started = Date.now();
    const hit = cache.get(key);
    if (!refresh && hit && hit.until > now) {
      if (hit.error) throw hit.error;
      const value = structuredClone(hit.value);
      if (value.extraction && value.code !== "STALE_CACHE")
        value.extraction.cache = "hit";
      log({
        event: "product_extraction",
        retailer,
        status: value.status,
        cache: "hit",
        duration_ms: Date.now() - started,
      });
      return clientValue(value);
    }
    if (hit) {
      cachedBytes -= hit.bytes;
      cache.delete(key);
    }
    if (pending.has(key)) return clientValue(await pending.get(key));
    if (pending.size >= 4 || (retailerWork.get(retailer) || 0) >= 2)
      throw new PreviewError("Too many previews. Try again in a moment.", 429);
    retailerWork.set(retailer, (retailerWork.get(retailer) || 0) + 1);
    const task = loadProduct(pageKey, detailsOnly);
    pending.set(key, task);
    try {
      const value = await task;
      if (value.extraction)
        value.extraction.price_expires_at = new Date(
          Date.now() + priceTTL,
        ).toISOString();
      if (value.product) {
        const missing = value.extraction.missing_fields.filter(
          (k) => k !== "images",
        );
        if (!value.product.images.some((i) => i.status === "validated"))
          missing.push("images");
        const actual = value.product;
        const primary = actual.images.find((i) => i.status === "validated");
        for (const i of actual.images) i.is_primary = i === primary;
        actual.main_image = primary?.url || null;
        actual.validated_image_count = actual.images.filter(
          (i) => i.status === "validated",
        ).length;
        const isMissing = (k) =>
          k === "images"
            ? !actual.images.some((i) => i.status === "validated")
            : k === "price.current"
              ? actual.price.current == null
              : k === "price.currency"
                ? actual.price.currency == null
                : k === "retailer_rating"
                  ? !actual.retailer_rating
                  : k === "availability"
                    ? actual.availability === "unknown"
                    : actual[k] == null;
        value.extraction.missing_fields = [
          "title",
          "brand",
          "description",
          "category",
          "price.current",
          "price.currency",
          "images",
          "retailer_rating",
          "availability",
        ].filter(isMissing);
        missing.splice(0, missing.length, ...value.extraction.missing_fields);
        value.extraction.coverage = { present: 9 - missing.length, total: 9 };
        value.status = missing.length ? "partial" : "success";
        value.code = missing.length ? "PARTIAL_EXTRACTION" : null;
        const canonical = retailerPageUrl(
          publicUrl(value.source.canonical_url).href,
        );
        if (aliases.size >= 128) aliases.delete(aliases.keys().next().value);
        aliases.set(canonical, pageKey);
      }
      log({
        event: "product_extraction",
        retailer,
        status: value.status || "partial",
        method: value.extraction?.method,
        duration_ms: Date.now() - started,
        cache: "miss",
        images_found: value.product?.images.length || 0,
        images_validated: value.images.length,
        missing: value.extraction?.missing_fields,
        provider: !!value.extraction?.provider,
        browser: !!value.extraction?.browser,
      });
      const bytes = Buffer.byteLength(JSON.stringify(value));
      if (bytes <= 24 * 1024 * 1024) {
        while (cache.size >= 24 || cachedBytes + bytes > 48 * 1024 * 1024) {
          const first = cache.keys().next().value;
          if (first === undefined) break;
          cachedBytes -= cache.get(first).bytes;
          cache.delete(first);
        }
        cache.set(key, {
          value,
          bytes,
          until: Date.now() + priceTTL,
          identityUntil: Date.now() + identityTTL,
        });
        cachedBytes += bytes;
      }
      return clientValue(value);
    } catch (error) {
      const code = failureCode(error);
      error = Object.assign(
        error instanceof PreviewError
          ? new PreviewError(error.message, error.status)
          : new Error(error.message),
        { code, name: error.name, remoteStatus: error.remoteStatus },
      );
      log({
        event: "product_extraction",
        retailer,
        status: error.code === "ACCESS_RESTRICTED" ? "restricted" : "failed",
        code: error.code,
        http_failure: error.remoteStatus || null,
        duration_ms: Date.now() - started,
        cache: "miss",
      });
      // Retain stable identity/images on transient refresh errors, but never display an expired price as current.
      if (
        !refresh &&
        hit?.value &&
        hit.identityUntil > Date.now() &&
        !["ACCESS_RESTRICTED", "INVALID_URL", "PRODUCT_NOT_FOUND"].includes(
          error.code,
        )
      ) {
        const value = structuredClone(hit.value);
        value.price = null;
        value.originalPrice = null;
        value.discountPercentage = null;
        value.warning =
          "Store refresh failed. Saved details are stale; verify the current price on the store.";
        value.status = "partial";
        value.code = "STALE_CACHE";
        if (value.product) {
          value.product.price.current = null;
          value.product.price.original = null;
          value.product.price.discount_amount = null;
          value.product.price.discount_percentage = null;
          value.product.price.state = "stale";
          value.product.availability = "unknown";
          value.product.offers = [];
          value.product.variants = value.product.variants.map((v) => ({
            ...v,
            price: null,
            availability: "unknown",
          }));
          value.extraction.cache = "stale";
          for (const p of Object.values(value.extraction.provenance))
            p.state = "stale";
        }
        const bytes = Buffer.byteLength(JSON.stringify(value));
        while (cache.size >= 24 || cachedBytes + bytes > 48 * 1024 * 1024) {
          const first = cache.keys().next().value;
          if (first === undefined) break;
          cachedBytes -= cache.get(first).bytes;
          cache.delete(first);
        }
        cache.set(key, {
          value,
          bytes,
          until: Date.now() + negativeTTL,
          identityUntil: hit.identityUntil,
        });
        cachedBytes += bytes;
        return clientValue(value);
      }
      if (error.status !== 400) {
        if (cache.size >= 24) {
          const first = cache.keys().next().value;
          cachedBytes -= cache.get(first).bytes;
          cache.delete(first);
        }
        cache.set(key, { error, bytes: 0, until: Date.now() + negativeTTL });
      }
      throw error;
    } finally {
      pending.delete(key);
      retailerWork.set(
        retailer,
        Math.max(0, (retailerWork.get(retailer) || 1) - 1),
      );
    }
  };
}
const importProduct = createProductImporter();

const recent = new Map();
let inFlight = 0;

function allowedRequest(req) {
  const origin = req.headers.origin;
  if (!origin || origin === process.env.PRODUCT_IMPORT_ORIGIN) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function respond(res, status, payload) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function productImportMiddleware(req, res, next) {
  if (req.url?.split("?")[0] !== endpoint) return next();
  if (!allowedRequest(req))
    return respond(res, 403, {
      error: "This preview server does not accept requests from this site.",
    });
  if (req.headers.origin) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }
  if (req.method !== "POST")
    return respond(res, 405, { error: "Use POST to import product links." });
  if (String(req.headers["content-type"]).split(";")[0] !== "application/json")
    return respond(res, 415, { error: "Expected a JSON product link." });

  const now = Date.now();
  for (const [address, window] of recent)
    if (window.until <= now) recent.delete(address);
  const address = req.socket.remoteAddress;
  const window = recent.get(address) ?? { count: 0, until: now + 60_000 };
  const authenticatedHost =
    process.env.NODE_ENV === "production" ||
    process.env.PRODUCT_IMPORT_REQUIRE_AUTH === "true";
  if (inFlight >= 4 || window.count >= (authenticatedHost ? 120 : 12))
    return respond(res, 429, {
      error: "Too many previews. Try again in a moment.",
    });
  recent.set(address, { ...window, count: window.count + 1 });
  inFlight++;

  const caller = new AbortController();
  res.once("close", () => {
    if (!res.writableEnded) caller.abort();
  });
  void (async () => {
    try {
      const identity = await requestIdentity(req);
      if (identity !== address) {
        const user = recent.get(identity) || { count: 0, until: now + 60000 };
        if (user.count >= 12)
          throw new PreviewError(
            "Too many previews. Try again in a moment.",
            429,
          );
        recent.set(identity, { ...user, count: user.count + 1 });
      }
      let payload;
      try {
        payload = JSON.parse(
          (
            await withAbort(readLimited(req, 8192), AbortSignal.timeout(5000))
          ).toString("utf8"),
        );
      } catch {
        throw new PreviewError("Enter a valid HTTPS product link.", 400);
      }
      respond(
        res,
        200,
        await withAbort(
          importProduct(
            payload?.url,
            payload?.refresh === true,
            payload?.detailsOnly === true,
          ),
          caller.signal,
        ),
      );
    } catch (error) {
      const message =
        error instanceof PreviewError || error?.code === "RETAILER_POLICY"
          ? error.message
          : error?.name === "AbortError" || error?.name === "TimeoutError"
            ? "The store took too long to respond. Try its full product link, or add original photos manually."
            : "Could not load a preview from this store.";
      if (!res.destroyed)
        respond(
          res,
          [400, 401, 403, 422, 429, 503].includes(error.status)
            ? error.status
            : 422,
          {
            error: [401, 503].includes(error.status) ? error.message : message,
            schema_version: 2,
            status:
              failureCode(error) === "ACCESS_RESTRICTED"
                ? "restricted"
                : failureCode(error) === "UNSUPPORTED_URL"
                  ? "unsupported"
                  : "failed",
            code: failureCode(error),
            extracted_at: new Date().toISOString(),
          },
        );
    } finally {
      inFlight--;
    }
  })();
}

module.exports = {
  productImportMiddleware,
  extractProduct,
  importProduct,
  fetchPublic,
  createProductImporter,
  publicUrl,
  usableImage,
  PreviewError,
};

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  const server = createServer({ requestTimeout: 30_000 }, (req, res) =>
    productImportMiddleware(req, res, () =>
      respond(res, 404, { error: "Not found." }),
    ),
  );
  server.listen(port, "0.0.0.0", () =>
    console.log(`Product previews listening on port ${port}`),
  );
}
