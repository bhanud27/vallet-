import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
const require = createRequire(import.meta.url);
const {
  extractProduct,
  publicUrl,
  createProductImporter,
} = require("../server/product-import.cjs");
const {
  extractIntelligence,
  failureCode,
  amount,
} = require("../server/product-model.cjs");
const { identify, domains } = require("../server/product-adapters.cjs");
const { createFallbacks } = require("../server/product-fallbacks.cjs");
const { createBrowserFallback } = require("../server/product-browser.cjs");
const { requestIdentity } = require("../server/product-auth.cjs");
const fixture = (name: string) =>
  readFileSync(
    new URL("./fixtures/products/" + name + ".html", import.meta.url),
    "utf8",
  );
async function extract(html: string, url: string) {
  return extractIntelligence(
    html,
    url,
    await extractProduct(html, url),
    publicUrl,
  );
}
const productDoc = (price = 499, extra = {}) =>
  '<script type="application/ld+json">' +
  JSON.stringify({
    "@type": "Product",
    name: "Fixture item",
    brand: "Fixture",
    offers: { price, priceCurrency: "INR" },
    ...extra,
  }) +
  "</script>";
const noLog = () => {};
test("retailer registry matches every declared domain without matching lookalikes", () => {
  for (const [retailer, hosts] of Object.entries(domains) as [
    string,
    string[],
  ][])
    for (const host of hosts) {
      assert.equal(identify("https://www." + host + "/item"), retailer);
      assert.equal(identify("https://" + host + ".evil.example/item"), "other");
    }
});
test("Myntra delivered state: original gallery order, parameters, original price and size variants", async () => {
  const p = await extract(
    fixture("myntra"),
    "https://www.myntra.com/shirts/fixture/123/buy",
  );
  assert.equal(p.product.title, "Fixture linen shirt");
  assert.equal(p.product.price.current, 799);
  assert.equal(p.product.price.original, 999);
  assert.equal(p.product.price.discount_percentage, 20);
  assert.equal(p.product.images.length, 2);
  assert.match(p.product.images[0].url, /w_1200.*\?token=keep/);
  assert.equal(p.product.variants.length, 2);
  assert.notEqual(p.product.variants[0].price, p.product.variants[1].price);
  assert.equal(p.product.availability, "unknown");
});
test("AJIO keeps the largest delivered URL without manufacturing an unlisted resolution", async () => {
  const p = await extract(
    fixture("ajio"),
    "https://www.ajio.com/fixture/p/123_white",
  );
  assert.equal(p.product.price.current, 999);
  assert.equal(p.product.images.length, 2);
  assert.match(p.product.images[0].url, /1117Wx1400H/);
  assert.ok(!p.product.images.some((i: any) => i.url.includes("1200Wx1500")));
  assert.equal(p.product.retailer_rating.value, 4.3);
  assert.equal(p.product.availability, "out_of_stock");
});
test("Meesho product-scoped hydration supports snake-case galleries and skips recommendations", async () => {
  const p = await extract(
    fixture("meesho"),
    "https://www.meesho.com/fixture/p/abc",
  );
  assert.equal(p.source.retailer, "meesho");
  assert.equal(p.product.title, "Fixture cotton dress");
  assert.equal(p.product.price.current, 450);
  assert.equal(p.product.images.length, 2);
  assert.ok(p.product.images.every((i: any) => !i.url.includes("unrelated")));
  assert.equal(p.product.specifications.Fabric, "Cotton");
});
test("structured graphs retain selected variants and report conflicts without replacing structured values", async () => {
  const html =
    productDoc(1499, {
      url: "/item?variant=blue",
      gtin13: "1234567890123",
      hasVariant: [
        {
          "@type": "Product",
          sku: "red",
          color: "red",
          offers: { price: 1699, priceCurrency: "INR" },
          image: "/red.jpg",
        },
        {
          "@type": "Product",
          sku: "blue",
          url: "/item?variant=blue",
          color: "blue",
          offers: {
            price: 1299,
            priceCurrency: "INR",
            availability: "https://schema.org/InStock",
          },
          image: "/blue.jpg",
        },
      ],
    }) +
    '<meta property="product:price:amount" content="99"><link rel="canonical" href="/item">';
  const p = await extract(html, "https://store.example/item?variant=blue");
  assert.equal(p.product.price.current, 1299);
  assert.equal(p.product.variants[0].price, 1699);
  assert.equal(p.product.variants[1].price, 1299);
  assert.deepEqual(
    p.product.images.map((i: { url: string }) => i.url),
    ["https://store.example/blue.jpg"],
  );
  assert.equal(p.product.price.original, null);
  assert.equal(p.product.gtin, "1234567890123");
  assert.match(p.source.canonical_url, /variant=blue/);
  assert.ok(
    p.extraction.conflicts.some((v: any) => v.field === "price.current"),
  );
  assert.equal(
    p.extraction.provenance["price.current"].source,
    "structured_data",
  );
});
test("generic metadata, product microdata, relative lazy srcsets and missing fields remain honest", async () => {
  const html =
    '<meta property="og:title" content="Fallback"><div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Cotton bag</span><meta itemprop="price" content="25.50"><meta itemprop="priceCurrency" content="USD"><img data-srcset="/small.jpg 300w, //cdn.example/big.jpg?token=preserve 1200w"></div><div class="related-products"><img src="/related.jpg"></div><button>Add to cart</button>';
  const p = await extract(html, "https://store.example/bag");
  assert.equal(p.product.title, "Cotton bag");
  assert.equal(p.product.price.current, 25.5);
  assert.equal(p.product.availability, "unknown");
  assert.ok(
    p.product.images.some(
      (i: any) => i.url === "https://cdn.example/big.jpg?token=preserve",
    ),
  );
  assert.equal(p.product.retailer_rating, null);
  assert.ok(p.extraction.missing_fields.includes("retailer_rating"));
  assert.equal(p.status, "partial");
});
test("all secondary retailers reuse generic structured extraction (fixtures are not live compatibility)", async () => {
  for (const retailer of [
    "nykaa",
    "tatacliq",
    "croma",
    "reliancedigital",
    "hm",
    "zara",
    "decathlon",
    "snapdeal",
    "amazon",
    "flipkart",
  ]) {
    const host = domains[retailer][0];
    const p = await extract(
      productDoc(100, {
        image: "/front.jpg",
        additionalProperty: [{ name: "Material", value: "Cotton" }],
      }),
      "https://" + host + "/item",
    );
    assert.equal(p.product.price.current, 100);
    assert.equal(p.product.images[0].url, "https://" + host + "/front.jpg");
    assert.equal(p.product.specifications.Material, "Cotton");
  }
});
test("prices reject ambiguous formats and images reject unsafe protocols without executing page scripts", async () => {
  for (const value of ["free", "-1", "1.234,56", "99.999", "Infinity"])
    assert.equal(amount(value), null);
  assert.equal(amount("₹1,299.50"), 1299.5);
  const p = await extract(
    productDoc(499, {
      image: [
        "javascript:alert(1)",
        "file:///secret",
        "https://127.0.0.1/image",
        "/logo.jpg",
        "/front.jpg?sig=abc",
      ],
    }) + "<script>globalThis.EXTRACTED_SCRIPT_EXECUTED = true;</script>",
    "https://shop.example/item",
  );
  assert.deepEqual(
    p.product.images.map((i: any) => i.url),
    ["https://shop.example/front.jpg?sig=abc"],
  );
  assert.equal((globalThis as any).EXTRACTED_SCRIPT_EXECUTED, undefined);
});
test("cache coalesces, preserves variant keys, expires prices and returns stale identity without stale offers", async () => {
  let calls = 0,
    fail = false;
  const importer = createProductImporter({
    ttl: 15,
    identityTTL: 1000,
    log: noLog,
    policy: async () => {},
    fetchFile: async (url: string) => {
      calls++;
      if (fail) throw new Error("network failed");
      return {
        url: new URL(url),
        type: "text/html",
        body: Buffer.from(productDoc(499)),
      };
    },
  });
  const url = "https://shop.example/item?variant=blue";
  await Promise.all([importer(url), importer(url)]);
  assert.equal(calls, 1);
  assert.equal((await importer(url)).extraction.cache, "hit");
  await importer("https://shop.example/item?variant=red");
  assert.equal(calls, 2);
  await delay(25);
  fail = true;
  const stale = await importer(url);
  assert.equal(stale.price, null);
  assert.equal(stale.product.price.current, null);
  assert.equal(stale.product.price.discount_percentage, null);
  assert.deepEqual(stale.product.offers, []);
  assert.equal(stale.extraction.cache, "stale");
  assert.equal(stale.product.title, "Fixture item");
  const again = await importer(url);
  assert.equal(again.price, null);
  assert.equal(again.extraction.cache, "stale");
});
test("only transient failures retry; negative cache and policy failures stop page downloads", async () => {
  let attempts = 0;
  const importer = createProductImporter({
    log: noLog,
    policy: async () => {},
    fetchFile: async (url: string) => {
      if (++attempts === 1)
        throw Object.assign(new Error("unavailable"), {
          remoteStatus: 503,
          retryAfter: "0",
        });
      return {
        url: new URL(url),
        type: "text/html",
        body: Buffer.from(productDoc()),
      };
    },
  });
  await importer("https://store.example/item");
  assert.equal(attempts, 2);
  let deniedCalls = 0;
  const denied = createProductImporter({
    log: noLog,
    policy: async () => {},
    fetchFile: async () => {
      deniedCalls++;
      throw Object.assign(new Error("denied"), { remoteStatus: 403 });
    },
  });
  await assert.rejects(denied("https://store.example/item"), {
    code: "ACCESS_RESTRICTED",
  });
  await assert.rejects(denied("https://store.example/item"));
  assert.equal(deniedCalls, 1);
  assert.equal(
    failureCode(Object.assign(new Error(), { name: "TimeoutError" })),
    "EXTRACTION_TIMEOUT",
  );
});
test("provider contract is disabled by default, enforces binding, priority, quotas and never calls browser for restricted pages", async () => {
  let browserCalls = 0,
    providerCalls = 0;
  const fallback = createFallbacks({
    providers: [
      {
        name: "licensed-test-connector",
        priority: 1,
        requestsPerMinute: 1,
        supports: (r: string) => r === "myntra",
        extract: async ({ url }: any) => {
          providerCalls++;
          return { url, html: productDoc() };
        },
      },
    ],
  });
  const ctx = {
    url: "https://www.myntra.com/item",
    retailer: "myntra",
    signal: AbortSignal.timeout(1000),
    restricted: true,
    browser: async () => {
      browserCalls++;
    },
  };
  assert.equal((await fallback(ctx)).method, "authorized_provider");
  assert.equal((await fallback(ctx)).html, undefined);
  assert.equal(providerCalls, 1);
  assert.equal(browserCalls, 0);
  assert.equal(
    (await createFallbacks()({ ...ctx, restricted: false, browser: undefined }))
      .html,
    undefined,
  );
});
test("authorized provider can supply metadata after a retailer denies direct requests", async () => {
  const url = "https://www.myntra.com/fixture/123/buy";
  const importer = createProductImporter({
    log: noLog,
    policy: async () => {
      throw Object.assign(new Error("policy denied"), {
        code: "RETAILER_POLICY",
      });
    },
    providers: [
      {
        name: "test-licensed-api",
        supports: () => true,
        extract: async ({ url }: any) => ({ url, html: productDoc(900) }),
      },
    ],
  });
  const p = await importer(url);
  assert.equal(p.price, 900);
  assert.equal(p.extraction.provider, true);
  assert.equal(p.extraction.provenance.title.source, "authorized_provider");
});
test("image validation records denied and tiny failures without discarding product details", async () => {
  const sharp = require("sharp"),
    image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
  const importer = createProductImporter({
    log: noLog,
    policy: async () => {},
    fetchFile: async (url: string) => {
      if (url.endsWith("/item"))
        return {
          url: new URL(url),
          type: "text/html",
          body: Buffer.from(
            productDoc(499, { image: ["/denied.jpg", "/tiny.png"] }),
          ),
        };
      if (url.includes("denied"))
        throw Object.assign(new Error("forbidden"), { remoteStatus: 403 });
      return { url: new URL(url), type: "image/png", body: image };
    },
  });
  const p = await importer("https://store.example/item");
  assert.equal(p.images.length, 0);
  assert.equal(p.name, "Fixture item");
  assert.equal(p.product.images[0].code, "IMAGE_ACCESS_DENIED");
  assert.equal(p.product.images[1].code, "IMAGE_UNSUPPORTED_OR_TOO_SMALL");
});
test("browser fallback rejects unapproved origins before launching or making a request", async () => {
  const fallback = createBrowserFallback({
    fetchFile: () => {
      throw new Error("unexpected");
    },
    policy: () => {
      throw new Error("unexpected");
    },
    allowedHosts: [],
  });
  assert.equal(
    await fallback("https://store.example/item", AbortSignal.timeout(50)),
    null,
  );
});
test("production authentication verifies Auth user, requires a bearer token, and hashes identity", async () => {
  const req = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  await assert.rejects(
    requestIdentity(req, { env: { NODE_ENV: "production" } }),
    { status: 401 },
  );
  const authed = {
    ...req,
    headers: { authorization: "Bearer " + "a".repeat(24) },
  };
  const identity = await requestIdentity(authed, {
    env: {
      NODE_ENV: "production",
      PRODUCT_AUTH_SUPABASE_URL: "https://fixture.supabase.co",
      PRODUCT_AUTH_ANON_KEY: "public-fixture",
    },
    fetchAuth: async (url: URL, options: any) => {
      assert.equal(url.href, "https://fixture.supabase.co/auth/v1/user");
      assert.equal(options.redirect, "error");
      return {
        ok: true,
        json: async () => ({ id: "12345678-1234-1234-1234-123456789012" }),
      };
    },
  });
  assert.match(identity, /^[a-f0-9]{64}$/);
});

test("never pairs a structured price with a disagreeing embedded offer currency", async () => {
  const p = await extract(
    productDoc(499) +
      '<script type="application/json" id="__NEXT_DATA__">{"props":{"product":{"name":"Fixture item","price":20,"currency":"USD","originalPrice":30}}}</script>',
    "https://shop.example/item",
  );
  assert.equal(p.product.price.current, 499);
  assert.equal(p.product.price.currency, "INR");
  assert.equal(p.product.price.original, null);
});

test("rich preview shares metadata with enrichment and validates only a suitable cover", async () => {
  const png = await require("sharp")({
    create: { width: 320, height: 400, channels: 3, background: "#665544" },
  })
    .png()
    .toBuffer();
  const requested: string[] = [];
  const short = "https://short.example/r?sku=blue";
  const target = "https://shop.example/item?variant=blue";
  let providerCalls = 0;
  let returnDetails!: () => void;
  const providerReady = new Promise<void>((resolve) => {
    returnDetails = resolve;
  });
  const importer = createProductImporter({
    log: noLog,
    policy: async () => {},
    providers: [
      {
        name: "approved-preview-test",
        supports: () => true,
        extract: async ({ url }: { url: string }) => {
          providerCalls++;
          await providerReady;
          return { url, html: productDoc(1199) };
        },
      },
    ],
    fetchFile: async (url: string) => {
      requested.push(url);
      if (url.endsWith(".png"))
        return {
          url: new URL(url),
          type: "image/png",
          body: png,
        };
      return {
        url: new URL(target),
        type: "text/html",
        body: Buffer.from(
          '<meta property="og:site_name" content="Fixture store">' +
            '<meta property="og:title" content="Canvas shoes">' +
            '<meta property="og:image" content="/front.png">' +
            '<meta property="og:image" content="/second.png">' +
            '<meta property="og:description" content="A canvas upper.">' +
            '<link rel="canonical" href="/item">',
        ),
      };
    },
  });
  const [rich, same] = await Promise.all([
    importer(short, false, false, "rich"),
    importer(short, false, false, "rich"),
  ]);
  assert.equal(rich.name, "Canvas shoes");
  assert.equal(rich.price, null);
  assert.equal(rich.images.length, 1);
  assert.equal(same.images.length, 1);
  assert.equal(rich.source.site_name, "Fixture store");
  assert.equal(rich.source.original_url, short);
  assert.equal(rich.source.canonical_url, target);
  assert.equal(providerCalls, 0);
  assert.deepEqual(requested, [short, "https://shop.example/front.png"]);
  const enrichment = importer(short, false, true);
  returnDetails();
  const details = await enrichment;
  assert.equal(providerCalls, 1);
  assert.equal(details.price, 1199);
  assert.deepEqual(details.images, []);
  assert.equal(requested.length, 2);
});

test("robots failures identify the policy stage while a product 403 identifies the page stage", async () => {
  const scenarios = [
    {
      failure: { code: "ECONNRESET" },
      code: "CONNECTION_RESET",
      reason: "ROBOTS_CONNECTION_RESET",
    },
    {
      failure: { name: "TimeoutError" },
      code: "POLICY_TIMEOUT",
      reason: "ROBOTS_TIMEOUT",
    },
    {
      failure: { remoteStatus: 403 },
      code: "ACCESS_RESTRICTED",
      reason: "ROBOTS_HTTP_DENIED",
    },
    {
      failure: { remoteStatus: 429, retryAfter: "60" },
      code: "RATE_LIMITED",
      reason: "ROBOTS_RATE_LIMITED",
    },
    { failure: null, code: "ACCESS_RESTRICTED", reason: "PAGE_HTTP_DENIED" },
  ];
  for (const scenario of scenarios) {
    let pages = 0;
    const importer = createProductImporter({
      log: noLog,
      providers: [],
      fetchFile: async (url: string) => {
        if (url.endsWith("/robots.txt")) {
          if (scenario.failure)
            throw Object.assign(new Error("Fixture"), scenario.failure);
          return {
            url: new URL(url),
            type: "text/plain",
            body: Buffer.from("User-agent: *\nDisallow:"),
          };
        }
        pages++;
        throw Object.assign(new Error("Fixture"), {
          remoteStatus: 403,
          stage: "page",
          reason: "PAGE_HTTP_DENIED",
        });
      },
    });
    await assert.rejects(importer("https://store.example/item"), {
      code: scenario.code,
      stage: scenario.failure ? "policy" : "page",
      reason: scenario.reason,
      providerFailures: [{ code: "PROVIDER_NOT_CONFIGURED" }],
    });
    assert.equal(pages, scenario.failure ? 0 : 1);
  }
});

test("verified cache aliases match retailer IDs while honoring variant, locale, and canonical scope", async () => {
  const sharp = require("sharp");
  const png = await sharp({
    create: { width: 400, height: 320, channels: 3, background: "#554488" },
  })
    .png()
    .toBuffer();
  const calls: string[] = [];
  const importer = createProductImporter({
    log: noLog,
    policy: async () => {},
    providers: [],
    fetchFile: async (url: string) => {
      if (url.endsWith(".png"))
        return { url: new URL(url), type: "image/png", body: png };
      calls.push(url);
      return {
        url: new URL(url),
        type: "text/html",
        body: Buffer.from(
          productDoc(499, {
            name: url.includes("red") ? "Red shirt" : "Blue shirt",
            image: "/cover.png",
          }) + '<link rel="canonical" href="/dp/B0ABCDE123?variant=red">',
        ),
      };
    },
  });
  const target = "https://www.amazon.in/shirt/dp/B0ABCDE123?variant=blue";
  assert.equal((await importer(target)).name, "Blue shirt");
  const tracked =
    "https://www.amazon.in/dp/B0ABCDE123?utm_source=share&variant=blue";
  const hit = await importer(tracked);
  assert.equal(hit.name, "Blue shirt");
  assert.equal(hit.source.original_url, tracked);
  assert.equal(hit.extraction.cache, "hit");
  assert.equal(calls.length, 1);
  assert.equal(
    (await importer("https://www.amazon.in/dp/B0ABCDE123?variant=red")).name,
    "Red shirt",
  );
  await importer("https://www.amazon.com/dp/B0ABCDE123?variant=blue");
  assert.equal(calls.length, 3);
});

test("SerpApi requires an exact retailer offer and an approved image host", async () => {
  const {
    exactOffer,
    configuredSerpApi,
  } = require("../server/product-serpapi.cjs");
  const target = "https://www.ajio.com/item/p/123_blue";
  const other = {
    link: "https://www.ajio.com/item/p/123_red",
    title: "Similar shirt",
    thumbnail: "https://images.example/red.jpg",
    extracted_price: 499,
    currency: "INR",
  };
  const exact = {
    ...other,
    link: "https://www.ajio.com/shirt/p/123_blue?utm_source=share",
    title: "Exact shirt",
    thumbnail: "https://images.example/blue.jpg",
  };
  assert.equal(configuredSerpApi({}), null);
  assert.equal(
    exactOffer({ product_result: { pricing: [other] } }, target),
    null,
  );
  const p = exactOffer(
    { product_result: { pricing: [other, exact] } },
    target,
    ["images.example"],
  );
  assert.equal(p.name, "Exact shirt");
  assert.equal(p.image, exact.thumbnail);
  assert.equal(p.offers.price, 499);
  assert.equal(
    exactOffer({ product_result: { pricing: [exact] } }, target).image,
    undefined,
  );
  const config = configuredSerpApi(
    {
      PRODUCT_SERPAPI_ENABLED: "true",
      SERPAPI_API_KEY: "fixture-key",
      PRODUCT_IMAGE_COPY_HOSTS: "images.example",
    },
    async (endpoint: string, options: RequestInit) => {
      assert.equal(new URL(endpoint).origin, "https://serpapi.com");
      assert.equal(new URL(endpoint).searchParams.get("q"), target);
      assert.equal(options.redirect, "error");
      return new Response(
        JSON.stringify({ product_result: { pricing: [exact] } }),
      );
    },
  );
  assert.equal(config.supports("ajio", target + "?auth_token=secret"), false);
  const fetched = await config.extract({
    url: target + "?utm_source=share",
    signal: AbortSignal.timeout(1000),
  });
  assert.equal(fetched.product.name, "Exact shirt");
  assert.equal(fetched.product.image, exact.thumbnail);
});

test("enrichment can supply an approved alternative after rich preview fails to load its cover", async () => {
  const png = await require("sharp")({
    create: { width: 400, height: 320, channels: 3, background: "#554488" },
  })
    .png()
    .toBuffer();
  const url = "https://shop.example/item";
  let providerCalls = 0;
  const importer = createProductImporter({
    log: noLog,
    policy: async () => {},
    providers: [
      {
        name: "approved-provider",
        supports: () => true,
        extract: async () => {
          providerCalls++;
          return { url, html: productDoc(1799, { image: "/alternate.png" }) };
        },
      },
    ],
    fetchFile: async (input: string) => {
      const resolved = new URL(input);
      if (resolved.pathname === "/blocked.png")
        throw Object.assign(new Error("Fixture"), { remoteStatus: 403 });
      if (resolved.pathname === "/alternate.png")
        return { url: resolved, type: "image/png", body: png };
      return {
        url: resolved,
        type: "text/html",
        body: Buffer.from(productDoc(499, { image: "/blocked.png" })),
      };
    },
  });
  const initial = await importer(url, false, false, "rich");
  assert.equal(initial.name, "Fixture item");
  assert.equal(initial.price, 499);
  assert.equal(initial.images.length, 0);
  assert.equal(providerCalls, 0);
  const details = await importer(url, false, true);
  assert.equal(details.price, 499);
  assert.equal(details.imagesPending, true);
  const withCover = await importer(url, false, false, "enriched-preview");
  assert.equal(providerCalls, 1);
  assert.equal(withCover.images.length, 1);
  assert.equal(
    withCover.product.main_image,
    "https://shop.example/alternate.png",
  );
  assert.equal(withCover.price, 499);
});
