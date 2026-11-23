const {
  sameProductUrl,
  retailerProductKey,
  productUrlKey,
} = require("./product-identity.cjs");
const { amount } = require("./product-model.cjs");
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
  const product = data?.product_result;
  if (!Array.isArray(product?.pricing)) return null;
  for (const offer of product.pricing) {
    try {
      const merchant = new URL(offer.link);
      if (
        merchant.protocol !== "https:" ||
        merchant.username ||
        merchant.password ||
        merchant.port ||
        !sameProductUrl(requested, merchant.href)
      )
        continue;
      const title = [offer.title, product.title].find(
        (value) => typeof value === "string" && value.trim(),
      );
      const image = approvedImage(offer.thumbnail, imageHosts);
      if (!title && !image) continue;
      const price = amount(offer.extracted_price);
      const currency = /^[A-Z]{3}$/.test(offer.currency ?? "")
        ? offer.currency
        : typeof offer.price === "string" && /^\s*(?:₹|INR\b)/.test(offer.price)
          ? "INR"
          : undefined;
      const original = amount(offer.extracted_original_price);
      return {
        "@context": "https://schema.org",
        "@type": "Product",
        url: requested,
        name: title?.trim().slice(0, 80),
        image,
        ...(price && currency
          ? {
              offers: {
                "@type": "Offer",
                price,
                priceCurrency: currency,
                url: merchant.href,
                ...(original > price
                  ? {
                      priceSpecification: {
                        "@type": "UnitPriceSpecification",
                        priceType: "https://schema.org/StrikethroughPrice",
                        price: original,
                        priceCurrency: currency,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      };
    } catch {
      // A malformed or mismatched merchant URL cannot verify the offer.
    }
  }
  return null;
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
        retailerProductKey(url) !== null &&
        ![...requested.searchParams.keys()].some((key) =>
          /token|password|auth|session|signature|credential|email/i.test(key),
        )
      );
    },
    async extract({ url, signal }) {
      const endpoint = new URL("https://serpapi.com/search.json");
      endpoint.search = new URLSearchParams({
        engine: "google",
        q: productUrlKey(url),
        gl: env.PRODUCT_SERPAPI_COUNTRY || "in",
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
