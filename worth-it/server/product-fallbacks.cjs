const { Buffer } = require("node:buffer");
// Trusted server-side extension point. No vendor, paid endpoint or credentials enabled by default.
const { resolve } = require("node:path");
const { configuredSerpApi } = require("./product-serpapi.cjs");
function createFallbacks(config = {}) {
  const providers = [...(config.providers || [])].sort(
    (a, b) =>
      (a.priority || 0) - (b.priority || 0) || (a.cost || 0) - (b.cost || 0),
  );
  const usage = new Map();
  return async ({ url, retailer, signal, restricted, browser }) => {
    const failures = providers.length
      ? []
      : [{ code: "PROVIDER_NOT_CONFIGURED" }];
    for (const p of providers) {
      if (signal.aborted) break;
      if (
        !p.name ||
        typeof p.extract !== "function" ||
        !p.supports?.(retailer, url)
      )
        continue;
      const current = usage.get(p.name) || {
        count: 0,
        until: Date.now() + 60000,
      };
      if (current.until <= Date.now()) {
        current.count = 0;
        current.until = Date.now() + 60000;
      }
      if (current.count >= Math.min(60, p.requestsPerMinute || 6)) {
        failures.push({ provider: p.name, code: "PROVIDER_RATE_LIMITED" });
        continue;
      }
      current.count++;
      usage.set(p.name, current);
      const deadline = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.min(p.timeout || 5000, 8000)),
      ]);
      try {
        // The trusted connector maps its documented API response to a Product JSON-LD document.
        // It must bind the document to this URL and obey its vendor's license.
        const result = await Promise.race([
          p.extract({ url, retailer, signal: deadline }),
          new Promise((_, reject) =>
            deadline.addEventListener("abort", () => reject(deadline.reason), {
              once: true,
            }),
          ),
        ]);
        if (
          typeof result?.html === "string" &&
          Buffer.byteLength(result.html) <= 5 * 1024 * 1024 &&
          result.url === url
        )
          return { ...result, method: "authorized_provider", failures };
        failures.push({
          provider: p.name,
          code: result == null ? "PROVIDER_NO_EXACT_MATCH" : "PROVIDER_ERROR",
        });
      } catch {
        failures.push({ provider: p.name, code: "PROVIDER_ERROR" });
      }
    }
    // Never use rendering to evade a denied page or robots policy.
    if (!restricted && browser) {
      try {
        const result = await browser(url, signal);
        if (result) return { ...result, method: "rendered_page", failures };
      } catch {
        failures.push({ code: "BROWSER_UNAVAILABLE" });
      }
    }
    if (!failures.length) failures.push({ code: "PROVIDER_UNAVAILABLE" });
    return { failures };
  };
}
function configuredProviders() {
  const path = process.env.PRODUCT_PROVIDER_MODULE;
  const serpapi = configuredSerpApi();
  if (!path) return serpapi ? [serpapi] : [];
  if (!require("node:path").isAbsolute(path))
    throw new Error(
      "PRODUCT_PROVIDER_MODULE must be an absolute trusted server module path",
    );
  const providers = require(resolve(path));
  if (!Array.isArray(providers))
    throw new Error("Provider module must export an array");
  return serpapi ? [...providers, serpapi] : providers;
}
module.exports = { createFallbacks, configuredProviders };
