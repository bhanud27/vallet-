import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  productDetails,
  resolveProductFields,
  productPollCategory,
} from "../src/lib/productDetails";
const require = createRequire(import.meta.url),
  sharp = require("sharp");
const {
  extractProduct,
  createProductImporter,
  fetchPublic,
  publicUrl,
  usableImage,
} = require("../server/product-import.cjs");
const { robotsAllowed } = require("../server/retailer-policy.cjs");
const {
  retailerPlatform,
  retailerPageUrl,
} = require("../server/retailer-images.cjs");
const page = "https://www.myntra.com/tshirts/brand/shirt/123/buy";
const html = `<script type="application/ld+json">{"@type":"Product","url":"${page}","name":"Cotton shirt","description":"A <b>cotton</b> shirt<script>ignored()</script>","brand":{"@type":"Brand","name":"Brand"},"category":"T-shirts","image":["https://assets.myntassets.com/assets/images/shirt.jpg"],"offers":{"price":"799.50","priceCurrency":"INR"}}</script>`;
function transportFor(responses: any[]) {
  let calls = 0;
  const pins: string[] = [];
  return {
    get calls() {
      return calls;
    },
    pins,
    transport(_url: any, options: any, callback: any) {
      options.lookup("checked.example", {}, (_error: any, address: string) =>
        pins.push(address),
      );
      const req: any = new EventEmitter();
      req.end = () => {
        const next = responses[calls++];
        if (!next) throw new Error("Unexpected request");
        const res: any = Readable.from([
          Buffer.from(next.body ?? "<title>Product</title>"),
        ]);
        res.statusCode = next.status ?? 200;
        res.headers = next.headers ?? { "content-type": "text/html" };
        callback(res);
      };
      return req;
    },
  };
}
test("normalizes all accessible fields from structured metadata without executing scripts", async () => {
  const p = await extractProduct(
    html.replace("<script>ignored()</script>", " safe text"),
    page,
  );
  assert.equal(p.name, "Cotton shirt");
  assert.equal(p.price, 799.5);
  assert.equal(p.currency, "INR");
  assert.equal(p.brand, "Brand");
  assert.equal(p.category, "T-shirts");
  assert.equal(p.description, "A cotton shirt safe text");
  assert.equal(p.platform, "myntra");
  assert.equal(p.productUrl, page);
});
test("AJIO embedded details are product-specific; missing currencies remain unknown", async () => {
  const p = await extractProduct(
    '<script>window.__INITIAL_STATE__={"productDetails":{"code":"123_white","name":"Linen shirt","description":"Cool linen","brandName":"Brand","categoryName":"Shirts","price":{"value":999,"currencyIso":"INR"},"images":[{"url":"https://assets.ajio.com/medias/root/-473Wx593H-shirt.jpg"}]}};</script>',
    "https://www.ajio.com/shirt/p/123_white",
  );
  assert.equal(p.brand, "Brand");
  assert.equal(p.category, "Shirts");
  assert.equal(p.description, "Cool linen");
  assert.equal(p.currency, "INR");
  const unknown = await extractProduct(
    '<script type="application/ld+json">{"@type":"Product","name":"Bag","offers":{"price":"29.95"}}</script>',
    "https://store.example/bag",
  );
  assert.equal(unknown.price, 29.95);
  assert.equal(unknown.currency, null);
  assert.equal(unknown.brand, "");
});
test("retailer detection resists lookalike hosts and only strips tracking queries", () => {
  assert.equal(retailerPlatform(page), "myntra");
  assert.equal(
    retailerPlatform("https://myntra.com.attacker.example/item"),
    "other",
  );
  assert.equal(
    retailerPageUrl(page + "?utm_source=share&size=M"),
    page + "?size=M",
  );
});
test("robots rules honor specific agents, longest matching paths, empty rules and query exclusions", () => {
  assert.equal(
    robotsAllowed(
      "User-agent: *\nDisallow: /api/\nAllow: /api/public/",
      "/api/private",
    ),
    false,
  );
  assert.equal(
    robotsAllowed(
      "User-agent: *\nDisallow: /api/\nAllow: /api/public/",
      "/api/public/item",
    ),
    true,
  );
  assert.equal(
    robotsAllowed("User-agent: OtherBot\nDisallow: /", "/item"),
    true,
  );
  assert.equal(
    robotsAllowed(
      "User-agent: *\nDisallow: /\nUser-agent: WorthItProductPreview\nAllow: /",
      "/item",
    ),
    true,
  );
  assert.equal(
    robotsAllowed(
      "User-agent: *\nDisallow: \nUser-agent: OtherBot\nDisallow: /",
      "/item",
    ),
    true,
  );
  assert.equal(
    robotsAllowed("User-agent: *\nDisallow: /*utm_", "/shirt?utm_source=bad"),
    false,
  );
});
test("rejects unsafe URLs and mixed/private DNS before opening a socket", async () => {
  for (const url of [
    "http://example.com/a",
    "https://127.0.0.1/a",
    "https://user:pass@example.com/a",
    "https://example.com:444/a",
    "https://metadata.internal/a",
    "https://[::ffff:127.0.0.1]/",
  ])
    assert.throws(() => publicUrl(url));
  let sockets = 0;
  for (const addresses of [
    [{ address: "127.0.0.1" }],
    [{ address: "93.184.216.34" }, { address: "169.254.169.254" }],
  ])
    await assert.rejects(
      fetchPublic(
        "https://store.example/item",
        AbortSignal.timeout(1000),
        true,
        {
          resolve: async () => addresses,
          transport: () => {
            sockets++;
          },
        },
      ),
      /public HTTPS/,
    );
  assert.equal(sockets, 0);
});
test("pins the validated DNS address and revalidates redirects without following retailer escapes", async () => {
  const fake = transportFor([{}]);
  let lookups = 0;
  await fetchPublic(
    "https://store.example/item",
    AbortSignal.timeout(1000),
    true,
    {
      resolve: async () => {
        lookups++;
        return [{ address: lookups === 1 ? "93.184.216.34" : "127.0.0.1" }];
      },
      transport: fake.transport,
    },
  );
  assert.deepEqual(fake.pins, ["93.184.216.34"]);
  assert.equal(lookups, 1);
  const redirect = transportFor([
    { status: 302, headers: { location: "https://store.example/next" } },
  ]);
  await assert.rejects(
    fetchPublic("https://store.example/item", AbortSignal.timeout(1000), true, {
      resolve: async () => [
        { address: redirect.calls ? "10.0.0.1" : "93.184.216.34" },
      ],
      transport: redirect.transport,
    }),
    /public HTTPS/,
  );
  assert.equal(redirect.calls, 1);
  const escape = transportFor([
    { status: 302, headers: { location: "https://attacker.example/login" } },
  ]);
  await assert.rejects(
    fetchPublic(page, AbortSignal.timeout(1000), true, {
      resolve: async () => [{ address: "93.184.216.34" }],
      transport: escape.transport,
    }),
    /redirected away/,
  );
  assert.equal(escape.calls, 1);
});
test("redirect loops, unsupported responses, blocked stores and oversized pages stop safely", async () => {
  const loop = transportFor(
    Array.from({ length: 5 }, () => ({
      status: 302,
      headers: { location: "https://store.example/loop" },
    })),
  );
  await assert.rejects(
    fetchPublic("https://store.example/item", AbortSignal.timeout(1000), true, {
      resolve: async () => [{ address: "93.184.216.34" }],
      transport: loop.transport,
    }),
    /too many/,
  );
  for (const item of [
    { status: 403 },
    { headers: { "content-type": "application/javascript" } },
    { body: "x".repeat(5 * 1024 * 1024 + 1) },
  ]) {
    const f = transportFor([item]);
    await assert.rejects(
      fetchPublic(
        "https://store.example/item",
        AbortSignal.timeout(1000),
        true,
        {
          resolve: async () => [{ address: "93.184.216.34" }],
          transport: f.transport,
        },
      ),
    );
  }
});
test("image downloads are decoded, resized, stripped and deduplicated; repeated imports coalesce", async () => {
  const bytes = await sharp({
    create: { width: 600, height: 800, channels: 3, background: "#cdef88" },
  })
    .png()
    .toBuffer();
  let pages = 0,
    images = 0;
  const importer = createProductImporter({
    policy: async () => {},
    fetchFile: async (url: string) => {
      if (url === page) {
        pages++;
        return {
          url: new URL(url),
          type: "text/html",
          body: Buffer.from(html.replace("<script>ignored()</script>", "safe")),
        };
      }
      images++;
      return { url: new URL(url), type: "image/png", body: bytes };
    },
  });
  const [first, second] = await Promise.all([importer(page), importer(page)]);
  assert.equal(pages, 1);
  assert.equal(images, 1);
  assert.equal(first.images.length, 1);
  assert.equal(first.images[0].mimeType, "image/jpeg");
  assert.equal(second.price, 799.5);
  await importer(page);
  assert.equal(pages, 1);
  const metadata = await sharp(
    Buffer.from(first.images[0].base64, "base64"),
  ).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(
    await usableImage({ body: bytes.subarray(0, 40), type: "image/png" }),
    null,
  );
});
test("failed images preserve metadata, placeholders are skipped and blocked pages are never invented", async () => {
  let downloads = 0;
  const importer = createProductImporter({
    policy: async () => {},
    fetchFile: async (url: string) => {
      if (url === page)
        return {
          url: new URL(url),
          type: "text/html",
          body: Buffer.from(
            html.replace("<script>ignored()</script>", "safe") +
              '<meta property="og:image" content="/placeholder.jpg">',
          ),
        };
      downloads++;
      throw new Error("blocked image");
    },
  });
  const p = await importer(page);
  assert.equal(p.name, "Cotton shirt");
  assert.equal(p.brand, "Brand");
  assert.deepEqual(p.images, []);
  assert.match(p.warning, /No usable/);
  assert.equal(downloads, 1);
  await assert.rejects(
    extractProduct(
      '<title>Access Denied</title><meta property="og:image" content="/logo.jpg">',
      page,
    ),
    /not make the product page accessible/,
  );
});
test("manual field edits and intentional clears win over late fetched values", () => {
  const late = {
    brand: "Fetched brand",
    description: "Fetched description",
    currency: "USD",
    price: 29.95,
  };
  assert.deepEqual(
    resolveProductFields(late, { brand: "My brand", description: "" }),
    {
      brand: "My brand",
      description: "",
      category: "",
      currency: "USD",
      price: "29.95",
    },
  );
  assert.equal(productPollCategory("Men > T-shirts"), "fashion");
  assert.equal(productPollCategory("Unclassified"), undefined);
  assert.deepEqual(productDetails(resolveProductFields(late)), late);
  assert.throws(
    () => productDetails({ ...resolveProductFields(), currency: "money" }),
    /three-letter/,
  );
  assert.throws(
    () => productDetails({ ...resolveProductFields(), price: "0" }),
    /valid store price/,
  );
});

test("import deadlines abort slow pages and negative cache avoids repeated blocked requests", async () => {
  let calls = 0;
  const importer = createProductImporter({
    timeout: 30,
    policy: async () => {},
    fetchFile: async (_url: string, signal: AbortSignal) => {
      calls++;
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    },
  });
  const keepAlive = setTimeout(() => {}, 200);
  try {
    await assert.rejects(importer(page));
    await assert.rejects(importer(page));
    assert.equal(calls, 1);
  } finally {
    clearTimeout(keepAlive);
  }
});
test("an explicit retry can refresh a failed import and robots denials never reach product pages", async () => {
  let allowed = false,
    calls = 0;
  const importer = createProductImporter({
    policy: async () => {
      if (!allowed) throw new Error("policy denied");
    },
    fetchFile: async (url: string) => {
      calls++;
      return {
        url: new URL(url),
        type: "text/html",
        body: Buffer.from(
          '<meta property="og:title" content="Public product">',
        ),
      };
    },
  });
  await assert.rejects(importer(page), /policy denied/);
  assert.equal(calls, 0);
  allowed = true;
  const result = await importer(page, true);
  assert.equal(result.name, "Public product");
  assert.equal(calls, 1);
});

test("a redirect target disallowed by retailer policy is rejected before it is requested", async () => {
  const fake = transportFor([
    { status: 302, headers: { location: "https://store.example/api/private" } },
  ]);
  await assert.rejects(
    fetchPublic("https://store.example/item", AbortSignal.timeout(1000), true, {
      resolve: async () => [{ address: "93.184.216.34" }],
      transport: fake.transport,
      beforeRequest: async (url: string) => {
        if (new URL(url).pathname.startsWith("/api/"))
          throw new Error("robots denied");
      },
    }),
    /robots denied/,
  );
  assert.equal(fake.calls, 1);
});

test("AJIO metadata keeps the largest supplied photo when responsive URLs refer to the same product image", async () => {
  const value = await extractProduct(
    '<script type="application/ld+json">{"@type":"Product","name":"Shirt","image":["https://assets.ajio.com/medias/root/-473Wx593H-shirt.jpg","https://assets.ajio.com/medias/root/-1117Wx1400H-shirt.jpg"]}</script>',
    "https://www.ajio.com/shirt/p/123",
  );
  assert.equal(
    value.images[0],
    "https://assets.ajio.com/medias/root/-1117Wx1400H-shirt.jpg",
  );
});

test("robots policies are cached per origin while exclusions remain path-specific", async () => {
  const { createRetailerPolicy } = require("../server/retailer-policy.cjs");
  let calls = 0;
  const policy = createRetailerPolicy(async () => {
    calls++;
    return {
      type: "text/plain",
      body: Buffer.from("User-agent: *\nDisallow: /api/\nAllow: /"),
    };
  });
  await policy("https://store.example/item", AbortSignal.timeout(1000));
  await policy("https://store.example/another", AbortSignal.timeout(1000));
  await assert.rejects(
    policy("https://store.example/api/private", AbortSignal.timeout(1000)),
    /does not allow/,
  );
  assert.equal(calls, 1);
});

test("unavailable retailer redirects and pages with no product metadata produce a manual fallback", async () => {
  const redirected = createProductImporter({
    policy: async () => {},
    fetchFile: async () => ({
      url: new URL("https://www.myntra.com/"),
      type: "text/html",
      body: Buffer.from(
        '<meta property="og:title" content="Welcome to the store">',
      ),
    }),
  });
  await assert.rejects(redirected(page), /did not return a product page/);
  const empty = createProductImporter({
    policy: async () => {},
    fetchFile: async () => ({
      url: new URL("https://store.example/item"),
      type: "text/html",
      body: Buffer.from("<html><body>No product data</body></html>"),
    }),
  });
  await assert.rejects(
    empty("https://store.example/item"),
    /No product information was accessible/,
  );
});
