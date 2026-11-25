const { retailerPlatform, retailerPageUrl } = require("./retailer-images.cjs");

function productUrlKey(value) {
  const url = new URL(retailerPageUrl(value));
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(gclid|fbclid|msclkid|srsltid)$/i.test(key))
      url.searchParams.delete(key);
  url.searchParams.sort();
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}

const productPaths = {
  myntra: /\/(\d+)\/buy$/,
  ajio: /\/p\/([a-z0-9_-]+)$/i,
  meesho: /\/p\/([a-z0-9]+)$/i,
  amazon: /\/(?:dp|gp\/product)\/([A-Z0-9]{10})$/i,
  flipkart: /\/p\/(itm[a-z0-9]+)$/i,
  hm: /^\/([^/]+)\/productpage\.([a-z0-9]+)\.html$/i,
  zara: /^\/([^/]+\/[^/]+)\/[^/]*-p(\d+)\.html$/i,
};

function retailerProductIdentity(value) {
  const url = new URL(productUrlKey(value));
  const retailer = retailerPlatform(url.href);
  const match = productPaths[retailer]?.exec(url.pathname);
  if (!match) return null;
  const [, ...path] = match;
  const id = path.pop();
  const locale = path[0];
  return { retailer, url, id, locale };
}

// Origin, locale and all selection parameters are part of the identity.
function retailerProductKey(value) {
  const match = retailerProductIdentity(value);
  return match
    ? JSON.stringify([
        match.retailer,
        match.url.origin,
        match.locale,
        match.id,
        match.url.search,
      ])
    : null;
}

function sameProductUrl(a, b) {
  if (productUrlKey(a) === productUrlKey(b)) return true;
  const id = retailerProductKey(a);
  return id !== null && id === retailerProductKey(b);
}

module.exports = {
  productUrlKey,
  retailerProductIdentity,
  retailerProductKey,
  sameProductUrl,
};
