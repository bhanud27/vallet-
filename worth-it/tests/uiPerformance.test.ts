import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pollDisplayPrice, formatProductPrice } from "../src/lib/productPrice";
import type { Poll } from "../src/lib/types";
const require = createRequire(import.meta.url);
const { createProductImporter } = require("../server/product-import.cjs");
test("details and price arrive before gallery downloads and the full stage reuses the page", async () => {
  const sharp = require("sharp");
  const image = await sharp({
    create: { width: 600, height: 800, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  let pages = 0,
    images = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const url = "https://store.example/item";
  const importer = createProductImporter({
    log: () => {},
    policy: async () => {},
    fetchFile: async (target: string) => {
      if (target === url) {
        pages++;
        return {
          url: new URL(target),
          type: "text/html",
          body: Buffer.from(
            '<script type="application/ld+json">{"@type":"Product","name":"Fixture shirt","image":"/front.jpg","offers":{"price":"499.50","priceCurrency":"INR"}}</script>',
          ),
        };
      }
      images++;
      await gate;
      return { url: new URL(target), type: "image/png", body: image };
    },
  });
  const details = await importer(url, false, true);
  assert.equal(details.price, 499.5);
  assert.equal(details.imagesPending, true);
  assert.equal(images, 0);
  const full = importer(url);
  release();
  const completed = await full;
  assert.equal(pages, 1);
  assert.equal(images, 1);
  assert.equal(completed.images.length, 1);
  assert.equal(completed.price, 499.5);
});
test("poll price badge keeps decimals and does not invent a missing currency", () => {
  const base = {
    priceInr: 0,
    productDetails: { price: 499.5, currency: "INR" },
  } as Poll;
  assert.deepEqual(pollDisplayPrice(base), {
    price: 499.5,
    currency: "INR",
    label: "Store",
  });
  assert.match(formatProductPrice(499.5, "INR"), /499\.50/);
  assert.match(formatProductPrice(499.5, null), /currency unknown/);
  assert.equal(pollDisplayPrice({ ...base, productDetails: undefined }), null);
  assert.deepEqual(
    pollDisplayPrice({ ...base, productDetails: undefined, priceInr: 299 }),
    { price: 299, currency: "INR", label: "Asking" },
  );
});
