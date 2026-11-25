const {
  sameProductUrl,
  retailerProductIdentity,
} = require("./product-identity.cjs");
const { Buffer } = require("node:buffer");

function approvedImage(value, hosts) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      hosts.includes(url.hostname)
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function exactOffer(data, requested, imageHosts = []) {
  if (!retailerProductIdentity(requested)) return null;
  const product = data?.product_result;
  const organic = Array.isArray(data?.organic_results) ? data.organic_results : [];
  const offers = Array.isArray(product?.pricing) ? product.pricing : [];
  const candidates = [
    ...offers.map((offer) => ({
      link: offer?.link,
      title: offer?.title || product.title,
      thumbnail: offer?.thumbnail,
    })),
    ...organic,
  ];
  let title;
  const images = new Set();
  for (const candidate of candidates) {
    try {
      const merchant = new URL(candidate.link);
      if (
        merchant.protocol !== "https:" ||
        merchant.username ||
        merchant.password ||
        merchant.port ||
        !sameProductUrl(requested, merchant.href)
      )
        continue;
      if (!title && typeof candidate.title === "string")
        title = candidate.title.trim().slice(0, 80);
      const image = approvedImage(candidate.thumbnail, imageHosts);
      if (image) images.add(image);
    } catch {
      // A malformed or mismatched merchant URL cannot verify the offer.
    }
  }
  if (!title && !images.size) return null;
  // Google search has no merchant offer observation time, even on a fresh search.
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    url: requested,
    name: title || undefined,
    image: images.size === 1 ? images.values().next().value : images.size ? [...images] : undefined,
  };
}

function searchMarket({ retailer, locale, url }, defaultMarket) {
  if (retailer === "zara") return locale.split("/")[0].toLowerCase();
  if (retailer === "hm") return /[_-]([a-z]{2})$/i.exec(locale)?.[1]?.toLowerCase() || defaultMarket;
  if (retailer === "amazon") return url.hostname.endsWith(".in") ? "in" : "us";
  return defaultMarket;
}

function configuredSerpApi(env = process.env, request = fetch) {
  if (env.PRODUCT_SERPAPI_ENABLED !== "true" || !env.SERPAPI_API_KEY?.trim())
    return null;
  const imageHosts = (env.PRODUCT_IMAGE_COPY_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  return {
    name: "serpapi",
    priority: 50,
    requestsPerMinute: 6,
    timeout: 6500,
    supports: (_, url) => {
      const requested = new URL(url);
      return (
        requested.protocol === "https:" &&
        !requested.username &&
        !requested.password &&
        !requested.port &&
        retailerProductIdentity(url) !== null &&
        ![...requested.searchParams.keys()].some((key) =>
          /token|password|auth|session|signature|credential|email/i.test(key),
        )
      );
    },
    async extract({ url, signal }) {
      const identity = retailerProductIdentity(url);
      if (!identity) return null;
      const { retailer, id, locale, url: page } = identity;
      const variant = retailer === "zara" && page.searchParams.get("v1");
      const terms = [retailer, id, `site:${page.hostname}${locale ? "/" + locale + "/" : ""}`];
      if (/^\d+$/.test(variant)) terms.push(variant);
      const endpoint = new URL("https://serpapi.com/search.json");
      endpoint.search = new URLSearchParams({
        engine: "google",
        q: terms.join(" "),
        gl: searchMarket(identity, env.PRODUCT_SERPAPI_COUNTRY || "in"),
        hl: "en",
        api_key: env.SERPAPI_API_KEY,
      });
      const response = await request(endpoint.href, {
        redirect: "error",
        signal,
      });
      if (!response.ok) throw new Error("Provider request failed.");
      const reader = response.body.getReader();
      let size = 0;
      const chunks = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024 * 1024)
            throw new Error("Provider response exceeded its size limit.");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const product = exactOffer(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        url,
        imageHosts,
      );
      if (!product) return null;
      const json = JSON.stringify(product).replace(/</g, "\\u003c");
      return {
        url,
        product,
        html: '<script type="application/ld+json">' + json + "</script>",
      };
    },
  };
}

module.exports = { configuredSerpApi, exactOffer };
