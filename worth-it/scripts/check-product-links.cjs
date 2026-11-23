// Explicit, read-only live verification; never runs in the offline test suite.
const { configuredSerpApi } = require("../server/product-serpapi.cjs");
const { retailerPlatform } = require("../server/retailer-images.cjs");
const { importProduct, publicUrl } = require("../server/product-import.cjs");
const { failureCode } = require("../server/product-model.cjs");
async function main() {
  const args = process.argv.slice(2);
  const rich = args.includes("--rich");
  const providerOnly = args.includes("--provider");
  const urls = args.filter((arg) => !["--rich", "--provider"].includes(arg));
  const provider = providerOnly ? configuredSerpApi() : null;
  if (!urls.length) throw new Error("Pass one or more public product URLs.");
  for (const url of urls) {
    const started = Date.now();
    let retailer;
    try {
      retailer = retailerPlatform(publicUrl(url).href);
      if (providerOnly) {
        const result =
          provider?.supports(retailer, url) &&
          (await provider.extract({
            url,
            retailer,
            signal: AbortSignal.timeout(8000),
          }));
        console.log(
          JSON.stringify({
            url,
            code: !provider
              ? "PROVIDER_NOT_CONFIGURED"
              : result
                ? "PROVIDER_EXACT_MATCH"
                : "PROVIDER_NO_EXACT_MATCH",
            title: result?.product?.name,
            approvedImageCandidate: result?.product?.image,
            price: result?.product?.offers?.price,
            currency: result?.product?.offers?.priceCurrency,
            milliseconds: Date.now() - started,
          }),
        );
        continue;
      }
      const p = await importProduct(
        url,
        false,
        false,
        rich ? "rich" : undefined,
      );
      console.log(
        JSON.stringify({
          url,
          status: p.status || "partial",
          code: p.code || null,
          method: p.extraction?.method,
          resolvedUrl: p.source?.resolved_url,
          primaryImage: p.product?.main_image,
          providerFailures: p.extraction?.fallback_failures,
          imageDiagnostics: p.product?.images.map((i) => ({
            url: i.url,
            status: i.status,
            stage: i.stage,
            reason: i.reason,
            httpStatus: i.remote_status,
            code: i.code || null,
            width: i.width || null,
            height: i.height || null,
          })),
          variants: p.product?.variants.length || 0,
          milliseconds: Date.now() - started,
          platform: p.platform,
          productUrl: p.productUrl,
          name: p.name,
          price: p.price,
          currency: p.currency,
          brand: p.brand,
          category: p.category,
          descriptionLength: p.description.length,
          images: p.images.length,
          warning: p.warning ?? null,
        }),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          url,
          status:
            error.code === "ACCESS_RESTRICTED" ? "restricted" : "unavailable",
          stage:
            error.stage ?? (error.status === 400 ? "validation" : undefined),
          reason: error.reason,
          httpStatus: error.remoteStatus,
          platform: retailer,
          providerFailures: error.providerFailures,
          milliseconds: Date.now() - started,
          error: error.message,
          code: failureCode(error),
        }),
      );
    }
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
