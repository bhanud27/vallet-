function imageResolution(input) {
  const url = new URL(input);
  const size =
    /-(\d+)W(?:x(\d+)H)?-/.exec(url.pathname) ||
    /\._(?:[A-Z_]*)(?:SL|SX|SY|US)(\d+)_/i.exec(url.pathname) ||
    /\bw_(\d+)/.exec(url.pathname) ||
    /^\/image\/(\d+)\/(\d+)\//.exec(url.pathname);
  return size ? Number(size[1]) : Number.MAX_SAFE_INTEGER;
}
function retailerPlatform(input) {
  return require("./product-adapters.cjs").identify(input);
}
function permittedPageRedirect(from, to) {
  const platform = retailerPlatform(from);
  return platform === "other" || retailerPlatform(to) === platform;
}
const imageHosts = {
  amazon: (host) =>
    /(^|\.)(media-amazon\.com|ssl-images-amazon\.com)$/.test(host),
  flipkart: (host) => /(^|\.)flixcart\.com$/.test(host),
  myntra: (host) => /(^|\.)myntassets\.com$/.test(host),
  ajio: (host) => /(^|\.)ajio\.com$/.test(host),
};
function originalImage(input) {
  // Preserve signed/transform URLs exactly. Prefer larger URLs only when delivered by the source.
  return new URL(input).href;
}
function imageIdentity(input) {
  const url = new URL(input);
  // Only group Amazon's explicit resolutions when every query parameter matches.
  // This selects a discovered larger source; it never creates an outbound URL.
  if (imageHosts.amazon(url.hostname))
    url.pathname = url.pathname.replace(/\._[^/]+_\.(jpe?g|png|webp)$/i, ".$1");
  if (imageHosts.ajio(url.hostname))
    url.pathname = url.pathname.replace(/\/-\d+W(?:x\d+H)?-/g, "/-SIZE-");
  if (imageHosts.myntra(url.hostname))
    url.pathname = url.pathname.replace(
      /^\/[^/]+\/(?=(?:v1\/)?assets\/images\/)/,
      "/",
    );
  if (imageHosts.flipkart(url.hostname))
    url.pathname = url.pathname.replace(/^(\/image\/)\d+\/\d+\//, "$1SIZE/");
  return url.href;
}

function jsonAssignment(script, names) {
  for (const name of names) {
    const match = new RegExp("(?:window\\.)?" + name + "\\s*=\\s*").exec(
      script,
    );
    if (!match) continue;
    const start = match.index + match[0].length;
    if (script[start] !== "{" && script[start] !== "[") continue;
    const open = script[start],
      close = open === "{" ? "}" : "]";
    let depth = 0,
      quoted = false;
    for (let i = start; i < script.length; i++) {
      const c = script[i];
      if (quoted && c === "\\") {
        i++;
        continue;
      }
      if (c === '"') quoted = !quoted;
      if (quoted) continue;
      if (c === open) depth++;
      if (c === close && !--depth) {
        try {
          return JSON.parse(script.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
}
function retailerProduct(value, base) {
  const path = new URL(base).pathname;
  const id =
    /\/(\d+)\/buy\/?$/i.exec(path)?.[1] ||
    /\/p\/([a-z0-9_-]+)\/?$/i.exec(path)?.[1];
  const candidates = [];
  const pending = [{ value, depth: 0, key: "" }];
  let visited = 0;
  while (pending.length && visited++ < 30000) {
    const current = pending.pop(),
      node = current.value;
    if (!node || typeof node !== "object" || current.depth > 30) continue;
    const productId = String(
      node.styleId ||
        node.productId ||
        node.productCode ||
        node.code ||
        node.id ||
        "",
    );
    if (
      (id && productId === id) ||
      /^(pdpData|productDetails|productData|productDetail|product)$/i.test(
        current.key,
      )
    ) {
      if (typeof (node.name || node.title || node.productName) === "string")
        candidates.push({ node, exact: !!id && productId === id });
    }
    for (const [key, child] of Object.entries(node))
      if (
        child &&
        typeof child === "object" &&
        !/recommend|similar|suggest|related/i.test(key)
      )
        pending.push({ value: child, depth: current.depth + 1, key });
  }
  return candidates.find((item) => item.exact)?.node || candidates[0]?.node;
}
function retailerImages(product) {
  const sources = [
    product?.images,
    product?.media,
    product?.galleryImages,
    product?.imageData,
    product?.imageUrls,
    product?.product_images,
    product?.catalogImages,
    product?.image,
  ];
  const result = [],
    pending = sources.filter(Boolean);
  let visited = 0;
  while (pending.length && visited++ < 10000) {
    const item = pending.shift();
    if (typeof item === "string") {
      if (/^(https?:)?\/\//i.test(item) || item.startsWith("/"))
        result.push(item);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    if (Array.isArray(item)) {
      pending.push(...item);
      continue;
    }
    for (const [key, value] of Object.entries(item))
      if (
        /^(url|src|imageURL|imageUrl|image_url|image|original|zoom|bigImageURL|highResImage|images|albums|assets|sources|sizes|gallery)$/i.test(
          key,
        )
      )
        pending.push(value);
  }
  return result;
}

// Resolve only public website targets explicitly supplied by the retailer's share link.
function retailerPageUrl(input) {
  const url = new URL(input);
  if (
    /^(www\.)?myntra\.com$/.test(url.hostname) &&
    url.pathname.startsWith("/mailers/")
  )
    url.pathname = url.pathname.slice("/mailers".length);
  if (/^(?:(?:www\.)?ajio\.com|ajioapps\.onelink\.me)$/.test(url.hostname)) {
    for (const key of ["deep_link_value", "af_web_dp"]) {
      try {
        const target = new URL(url.searchParams.get(key));
        if (
          target.protocol === "https:" &&
          /^(www\.)?ajio\.com$/.test(target.hostname) &&
          /\/p\/[a-z0-9_-]+\/?$/i.test(target.pathname) &&
          !target.username &&
          !target.password &&
          !target.port
        ) {
          target.hash = "";
          return retailerPageUrlWithoutTracking(target);
        }
      } catch {}
    }
  }
  return retailerPageUrlWithoutTracking(url);
}

function retailerPageUrlWithoutTracking(url) {
  // Drop tracking only; retain actual product/variant parameters.
  if (retailerPlatform(url.href) !== "other")
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|gclid$|fbclid$|uclid$|shared$|referrer_uid$)/i.test(key))
        url.searchParams.delete(key);
  return url.href;
}

module.exports = {
  imageResolution,
  retailerPlatform,
  permittedPageRedirect,
  retailerPageUrl,
  originalImage,
  imageIdentity,
  jsonAssignment,
  retailerProduct,
  retailerImages,
};
