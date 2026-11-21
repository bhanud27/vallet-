import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { detectProductUrl } from "../src/lib/validation";

const { extractProduct } = createRequire(import.meta.url)(
  "../server/product-import.cjs",
) as {
  extractProduct(
    html: string,
    url: string,
  ): Promise<{ name: string; price: number | null; images: string[] }>;
};

test("detects a retailer link in shared text and keeps the variant query", () => {
  assert.equal(
    detectProductUrl(
      "Look at this product! http://shop.example/item?variant=2#info.",
    ),
    "https://shop.example/item?variant=2",
  );
  assert.equal(
    detectProductUrl("shop.example/product"),
    "https://shop.example/product",
  );
  assert.equal(
    detectProductUrl("Look at this https://shop.internal/product"),
    null,
  );
});

test("chooses the product on the page and imports structured high-resolution images", async () => {
  const result = await extractProduct(
    `
    <script type="application/ld+json">{
      "@graph":[
        {"@type":"Product","name":"Other","url":"/other","image":"/other.jpg"},
        {"@type":"ProductGroup","name":"Headphones","url":"/headphones",
         "hasVariant":[{"@type":"Product","url":"/headphones","image":[{"contentUrl":"/front.webp"}],
         "offers":{"price":"2499","priceCurrency":"INR"}}]}
      ]
    }</script>
    <div class="ProductGallery"><picture><source srcset="/side-small.jpg 480w, /side-large.jpg 1600w"></picture></div>
  `,
    "https://shop.example/headphones",
  );
  assert.deepEqual(result, {
    name: "Headphones",
    price: 2499,
    images: [
      "https://shop.example/front.webp",
      "https://shop.example/side-large.jpg",
    ],
    currency: "INR",
    description: "",
    brand: "",
    category: "",
    productUrl: "https://shop.example/headphones",
    platform: "other",
  });
});

test("imports storefront JSON and prefers WooCommerce zoom images", async () => {
  const result = await extractProduct(
    `
    <script type="application/json" id="ProductJson">{"title":"Everyday backpack","images":["//cdn.example/front.jpg"]}</script>
    <div class="woocommerce-product-gallery"><img src="/thumb.jpg" data-large_image="/detail.jpg"></div>
    <meta property="og:image" content="/detail.jpg">
    <meta property="product:price:amount" content="100">
    <meta property="product:price:currency" content="USD">
  `,
    "https://store.example/backpack",
  );
  assert.deepEqual(result, {
    name: "Everyday backpack",
    price: 100,
    currency: "USD",
    description: "",
    brand: "",
    category: "",
    productUrl: "https://store.example/backpack",
    platform: "other",
    images: [
      "https://cdn.example/front.jpg",
      "https://store.example/detail.jpg",
    ],
  });
});

test("keeps product details when there are no downloadable photos", async () => {
  const result = await extractProduct(
    `
    <meta property="og:title" content="Store listing">
    <meta itemprop="price" content="499"><meta itemprop="priceCurrency" content="INR">
  `,
    "https://store.example/item",
  );
  assert.deepEqual(result, {
    name: "Store listing",
    price: 499,
    images: [],
    currency: "INR",
    description: "",
    brand: "",
    category: "",
    productUrl: "https://store.example/item",
    platform: "other",
  });
});

test("keeps the high-resolution store image when metadata lists the same thumbnail", async () => {
  const result = await extractProduct(
    `
    <script type="application/ld+json">{"@type":"Product","name":"Backpack",
      "image":"https://m.media-amazon.com/images/I/pack._SX425_.jpg"}</script>
    <script>const gallery = {"colorImages":{"initial":[
      {"hiRes":"https://m.media-amazon.com/images/I/pack._SL1600_.jpg"}]}};</script>
  `,
    "https://www.amazon.in/dp/example",
  );
  assert.deepEqual(result.images, [
    "https://m.media-amazon.com/images/I/pack._SL1600_.jpg",
  ]);
});

const { originalImage, retailerPageUrl, jsonAssignment } = createRequire(
  import.meta.url,
)("../server/retailer-images.cjs");
test("preserves retailer CDN paths and signed transformation queries without inventing sizes", () => {
  for (const url of [
    "https://m.media-amazon.com/images/I/shirt._AC_US40_.jpg",
    "https://rukminim2.flixcart.com/image/128/128/item.jpg?q=40",
    "https://assets.myntassets.com/h_200,q_50,w_150/v1/assets/images/shirt.jpg?token=signed",
    "https://assets.ajio.com/medias/root/-473Wx593H-shirt.jpg?width=473&token=keep",
    "https://media-amazon.com.attacker.example/image._SX40_.jpg",
  ])
    assert.equal(originalImage(url), url);
});

test("resolves the AJIO product embedded in the supplied share redirect and normalizes Myntra mailers", () => {
  const product =
    "https://www.ajio.com/just-cavalli-men-printed-cuban-collar-short-sleeves-shirt/p/700704207_white";
  assert.equal(
    retailerPageUrl(
      "https://www.ajio.com/?deep_link_value=" + encodeURIComponent(product),
    ),
    product,
  );
  assert.equal(
    retailerPageUrl(
      "https://www.myntra.com/mailers/tshirts/brand/item/42841923/buy",
    ),
    "https://www.myntra.com/tshirts/brand/item/42841923/buy",
  );
  const malicious =
    "https://www.ajio.com/?deep_link_value=" +
    encodeURIComponent("https://127.0.0.1/p/secret");
  assert.equal(retailerPageUrl(malicious), malicious);
});
test("extracts Myntra and AJIO embedded product state without executing scripts", async () => {
  const myntra = await extractProduct(
    '<script>window.__myx = {"pdpData":{"id":42841923,"name":"Polo shirt","price":{"discounted":799},"images":[{"src":"https://assets.myntassets.com/w_150/assets/images/shirt.jpg"}]}}; throw new Error("not executed");</script>',
    "https://www.myntra.com/tshirts/brand/item/42841923/buy",
  );
  assert.equal(myntra.name, "Polo shirt");
  assert.equal(myntra.price, 799);
  assert.equal(myntra.images.length, 1);
  const ajio = await extractProduct(
    '<script id="__NEXT_DATA__" type="application/json">{"props":{"productDetails":{"code":"700704207_white","name":"Printed shirt","price":{"value":999},"images":[{"url":"https://assets.ajio.com/medias/root/-473Wx593H-shirt.jpg"}]}}}</script>',
    "https://www.ajio.com/shirt/p/700704207_white",
  );
  assert.equal(ajio.name, "Printed shirt");
  assert.equal(ajio.price, 999);
  assert.equal(
    jsonAssignment("window.__myx = doSomethingDangerous();", ["__myx"]),
    undefined,
  );
});
