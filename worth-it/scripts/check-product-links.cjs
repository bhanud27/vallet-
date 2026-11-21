// Explicit, read-only live verification; never runs in the offline test suite.
const { importProduct } = require("../server/product-import.cjs");
async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) throw new Error("Pass one or more public product URLs.");
  for (const url of urls) {
    const started = Date.now();
    try {
      const p = await importProduct(url);
      console.log(
        JSON.stringify({
          url,
          status: p.status || "partial",
          code: p.code || null,
          method: p.extraction?.method,
          imageDiagnostics: p.product?.images.map((i) => ({
            status: i.status,
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
          status: "unavailable",
          milliseconds: Date.now() - started,
          error: error.message,
          code: error.code || "EXTRACTION_FAILED",
        }),
      );
    }
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
