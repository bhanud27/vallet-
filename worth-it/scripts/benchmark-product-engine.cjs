// Deterministic local pipeline timing, not a live-retailer latency claim.
const { performance } = require("node:perf_hooks");
const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const path = require("node:path");
const { createProductImporter } = require("../server/product-import.cjs");
async function main() {
  const sharp = require("sharp");
  const image = await sharp({
    create: { width: 900, height: 1200, channels: 3, background: "#ddd" },
  })
    .jpeg()
    .toBuffer();
  const url = "https://benchmark.fixture.example/item";
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify({
      "@type": "Product",
      name: "Synthetic benchmark item",
      image: ["/front.jpg", "/back.jpg"],
      offers: { price: 999, priceCurrency: "INR" },
    }) +
    "</script>";
  let pages = 0,
    photos = 0;
  const importer = createProductImporter({
    log: () => {},
    policy: async () => {},
    fetchFile: async (target) => {
      const page = target === url;
      page ? pages++ : photos++;
      return {
        url: new URL(target),
        type: page ? "text/html" : "image/jpeg",
        body: page ? Buffer.from(html) : image,
      };
    },
  });
  const cold = [],
    warm = [];
  for (let i = 0; i < 12; i++) {
    let t = performance.now();
    await importer(url, true);
    cold.push(performance.now() - t);
    t = performance.now();
    await importer(url);
    warm.push(performance.now() - t);
  }
  const stats = (a) => {
    a.sort((a, b) => a - b);
    return {
      p50_ms: +a[Math.floor(a.length * 0.5)].toFixed(2),
      p95_ms:
        +a[Math.min(a.length - 1, Math.floor(a.length * 0.95))].toFixed(2),
    };
  };
  const result = {
    kind: "synthetic_offline_fixture",
    samples: 12,
    includes_network_latency: false,
    fresh: stats(cold),
    cached: stats(warm),
    page_requests: pages,
    image_requests: photos,
  };
  fs.writeFileSync(
    path.join(__dirname, "../.expo/product-engine-benchmark.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
