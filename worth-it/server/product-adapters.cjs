// Adapters inspect delivered public state only; never call private retailer APIs.
const {
  jsonAssignment,
  retailerProduct,
  retailerImages,
} = require("./retailer-images.cjs");
const domains = {
  myntra: ["myntra.com"],
  ajio: ["ajio.com", "ajioapps.onelink.me"],
  meesho: ["meesho.com"],
  amazon: ["amazon.in", "amazon.com", "amzn.in", "amzn.to"],
  flipkart: ["flipkart.com", "fkrt.it"],
  nykaa: ["nykaa.com", "nykaafashion.com"],
  tatacliq: ["tatacliq.com", "tatacliqfashion.com", "tatacliqluxury.com"],
  croma: ["croma.com"],
  reliancedigital: ["reliancedigital.in"],
  hm: ["hm.com"],
  zara: ["zara.com"],
  decathlon: ["decathlon.in"],
  snapdeal: ["snapdeal.com"],
};
const hostMatches = (host, domain) =>
  host === domain || host.endsWith("." + domain);
function identify(input) {
  const host = new URL(input).hostname.toLowerCase();
  return (
    Object.keys(domains).find((k) =>
      domains[k].some((d) => hostMatches(host, d)),
    ) || "other"
  );
}
const registry = new Map();
function registerAdapter(name, adapter) {
  if (!name || typeof adapter?.extract !== "function")
    throw new Error("Invalid product adapter");
  registry.set(name, adapter);
}
// Product selection is scoped to page IDs/product keys and excludes recommendations.
function stateProduct(state, url) {
  const selected = retailerProduct(state, url);
  if (selected) return selected;
  const pending = [{ value: state, depth: 0 }];
  let count = 0;
  while (pending.length && count++ < 15000) {
    const { value, depth } = pending.shift();
    if (!value || typeof value !== "object" || depth > 24) continue;
    for (const [key, node] of Object.entries(value)) {
      if (/recommend|related|similar|suggest|listings|searchResults/i.test(key))
        continue;
      if (
        /^(product|productInfo|product_details|catalog|catalogDetails|productDetails|pdpData|productData)$/i.test(
          key,
        ) &&
        node &&
        typeof node === "object" &&
        typeof (node.name || node.title || node.productName) === "string"
      )
        return node;
      if (node && typeof node === "object")
        pending.push({ value: node, depth: depth + 1 });
    }
  }
}
function deliveredState(scripts, url) {
  for (const { text, type, id } of scripts) {
    let state;
    if (
      type === "application/json" ||
      /__NEXT_DATA__|ProductJson/i.test(id || "")
    ) {
      try {
        state = JSON.parse(text);
      } catch {
        /* Not JSON; never evaluate. */
      }
    }
    state ??= jsonAssignment(text, [
      "__myx",
      "__PRELOADED_STATE__",
      "__INITIAL_STATE__",
      "__APOLLO_STATE__",
    ]);
    const product =
      state &&
      (stateProduct(state, url) ||
        (typeof state?.title === "string" && Array.isArray(state.images)
          ? state
          : undefined));
    if (product) return product;
  }
}
for (const name of [
  "myntra",
  "ajio",
  "meesho",
  "amazon",
  "flipkart",
  "other",
]) {
  registerAdapter(name, {
    extract: ({ scripts, url }) => deliveredState(scripts, url),
  });
}
function extractAdapter(context) {
  const retailer = identify(context.url);
  return {
    retailer,
    data: (registry.get(retailer) || registry.get("other")).extract(context),
  };
}
module.exports = {
  identify,
  domains,
  registerAdapter,
  extractAdapter,
  hostMatches,
  retailerImages,
};
