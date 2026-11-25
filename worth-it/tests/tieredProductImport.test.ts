import assert from "node:assert/strict";
import { once } from "node:events";
import {
  createServer,
  request,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { runInNewContext } from "node:vm";
import codes from "../shared/product-import-codes.json";
import {
  cachedDeviceTier,
  hostTierTtl,
  nextProductImportTier,
  type ProductImportCode,
} from "../src/lib/productImportTiers";
import {
  canonicalPollProductUrl,
  detectProductImportUrl,
  validatePollDetails,
} from "../src/lib/validation";
import { readSharedProduct } from "../src/lib/incomingProductShare";

const load = createRequire(import.meta.url);
const {
  canonicalProductUrl,
  createGenericProductImporter,
  extractGenericProduct,
  genericPublicUrl,
  isPublicAddress,
  productImportMiddleware,
} = load("../server/product-import.cjs");

test("requests preserve signed parameters and storage removes only tracking parameters", () => {
  const original =
    "http://store.example/item?variant=blue&utm_source=share&fbclid=x&signature=a%2Bb";
  const canonical = "http://store.example/item?variant=blue&signature=a%2Bb";
  assert.equal(detectProductImportUrl(original), original);
  assert.equal(canonicalPollProductUrl(original), canonical);
  assert.equal(canonicalProductUrl(`${original}#section`), canonical);
  assert.equal(
    detectProductImportUrl("Message javascript:https://store.example/item"),
    null,
  );
  assert.deepEqual(
    readSharedProduct([
      { value: `Check this out!\nBlue linen shirt\n${original}` },
    ]),
    { url: original, titleHint: "Blue linen shirt" },
  );
});

test("server rejects non-web schemes and non-public address ranges", () => {
  for (const url of [
    "file:///tmp/item",
    "ftp://shop.example/item",
    "https://user:pass@shop.example/item",
  ])
    assert.throws(() => genericPublicUrl(url), { code: "INVALID_URL" });
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "172.16.1.2",
    "192.168.0.1",
    "169.254.169.254",
    "100.100.100.200",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::a",
    "fe80::1",
    "64:ff9b::a00:1",
    "2002:7f00:1::1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "2606:4700:4700::1111"])
    assert.equal(isPublicAddress(ip), true, ip);
  assert.throws(() => genericPublicUrl("https://[::ffff:127.0.0.1]/"), {
    code: "UNSAFE_URL",
  });
  assert.equal(
    genericPublicUrl("http://shop.example/item").href,
    "http://shop.example/item",
  );
});

test("server parses Product graphs, nested offers, Indian prices and sized image arrays", async () => {
  const url = "https://store.example/product";
  const page = `<meta property="og:title" content="Secondary"><script type="application/ld+json">${JSON.stringify(
    [
      {
        "@graph": [
          {
            "@type": ["Thing", "Product"],
            name: "  Laptop  ",
            brand: { name: "Brand" },
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "INR",
              offers: [{ "@type": "Offer", price: "₹ 1,29,999" }],
            },
            image: [
              "data:image/gif;base64,R0lG",
              { url: "/pixel.gif", width: 1, height: 1 },
              { url: "/small.png", width: 80, height: 80 },
              { contentUrl: "/large.png", width: 1200, height: 900 },
            ],
          },
        ],
      },
    ],
  )}</script>`;
  const item = await extractGenericProduct(page, url);
  assert.equal(item.title, "Laptop");
  assert.equal(item.price, 129999);
  assert.equal(item.currency, "INR");
  assert.equal(item.imageUrl, "https://store.example/large.png");
  assert.equal(item.brand, "Brand");
});

test("microdata wins over OpenGraph, and embedded app state works for a JS shell", async () => {
  const url = "https://store.example/product";
  const page =
    '<title>Page</title><meta property="og:title" content="OG"><meta property="og:price:amount" content="3.99"><meta property="product:price:currency" content="USD"><meta name="twitter:image" content="/cover.webp"><span itemprop="name">Item</span><meta itemprop="price" content="5">';
  const item = await extractGenericProduct(page, url);
  assert.equal(item.title, "Item");
  assert.equal(item.price, 5);
  assert.equal(item.imageUrl, "https://store.example/cover.webp");
  const og = await extractGenericProduct(page.split("<span")[0], url);
  assert.equal(og.title, "OG");
  assert.equal(og.price, 3.99);
  const next =
    '<div id="root"></div><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"product":{"title":"Lamp","price":{"amount":22,"currency":"USD"},"image":"/lamp.webp"}}}}</script>';
  assert.equal((await extractGenericProduct(next, url)).title, "Lamp");
  assert.equal((await extractGenericProduct(next, url)).jsRequired, false);
  assert.equal(
    (
      await extractGenericProduct(
        '<title>Store</title><div id="root"></div>',
        url,
      )
    ).jsRequired,
    true,
  );
});

test("the WebView script reads top-level metadata and leaves an interactive challenge alone", () => {
  const reader = load("../shared/product-webview-reader.cjs");
  const metadata = load("../shared/product-metadata.cjs");
  const messages: string[] = [];
  const document = {
    title: "Desk lamp",
    hidden: false,
    readyState: "complete",
    body: { innerText: "Desk lamp now available in blue" },
    querySelector: () => null,
    querySelectorAll: (selector: string) =>
      selector.startsWith("meta")
        ? [
            {
              getAttribute: (attr: string) =>
                ({ property: "product:price:amount", content: "₹ 1,299" })[
                  attr as "property" | "content"
                ],
            },
          ]
        : [],
  };
  const run = () =>
    runInNewContext(`(${reader})((${metadata}), "expected-nonce");`, {
      document,
      URL,
      location: { href: "https://shop.example/lamp" },
      window: {
        ReactNativeWebView: {
          postMessage: (message: string) => messages.push(message),
        },
      },
    });
  run();
  assert.equal(messages.length, 1);
  assert.equal(JSON.parse(messages[0]).metadata.price, 1299);
  assert.equal(JSON.parse(messages[0]).nonce, "expected-nonce");
  document.title = "Verify you are human";
  run();
  assert.equal(messages.length, 1);
});

test("escalation covers every shared error and the device cache expires after seven days", () => {
  const device = new Set([
    "ACCESS_RESTRICTED",
    "POLICY_TIMEOUT",
    "FETCH_TIMEOUT",
    "JS_RENDER_REQUIRED",
    "CLIENT_IMPORT_REQUIRED",
    "IMPORTER_NOT_CONFIGURED",
    "NETWORK_ERROR",
    "PARTIAL_EXTRACTION",
  ]);
  for (const code of Object.keys(codes) as ProductImportCode[]) {
    assert.equal(
      nextProductImportTier(code, true),
      device.has(code) ? "device" : "manual",
      code,
    );
    assert.equal(nextProductImportTier(code, false), "manual", code);
  }
  const now = 1700000000000;
  assert.equal(cachedDeviceTier(String(now + hostTierTtl), now), true);
  assert.equal(
    cachedDeviceTier(String(now + hostTierTtl), now + hostTierTtl),
    false,
  );
  assert.equal(cachedDeviceTier(String(now + hostTierTtl + 1), now), false);
  assert.equal(cachedDeviceTier(null, now), false);
});

test("manual drafts require a positive price and can retain an HTTP link", () => {
  const input = {
    itemName: "Lamp",
    question: "Buy it?",
    priceInr: 1200,
    importSource: "manual" as const,
    productUrl: "http://store.example/product",
  };
  assert.throws(() => validatePollDetails(input), /price greater than zero/);
  assert.doesNotThrow(() =>
    validatePollDetails({
      ...input,
      productDetails: { price: 1200, currency: "INR" },
    }),
  );
});

test("HTTP endpoint handles local static, restricted, slow, JS, non-HTML, redirect and oversize fixtures", async (t) => {
  const seen: string[] = [];
  const fixture = createServer((req, res) => {
    const path = new URL(req.url!, `http://${req.headers.host}`).pathname;
    seen.push(`${req.headers.host}${req.url}`);
    const send = (status: number, type: string, body = "") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(body);
    };
    if (req.headers.host === "policy-slow.example" && path === "/robots.txt")
      return;
    if (req.headers.host === "policy-denied.example" && path === "/robots.txt")
      return send(403, "text/plain");
    if (path === "/robots.txt")
      return send(200, "text/plain", "User-agent: *\nAllow: /");
    if (path === "/slow") return;
    if (path === "/denied") return send(403, "text/html");
    if (path === "/json") return send(200, "application/json", "{}");
    if (path === "/shell")
      return send(
        200,
        "text/html",
        "<title>Store</title><div id='root'></div>",
      );
    if (path === "/big")
      return send(200, "text/html", "x".repeat(2 * 1024 * 1024 + 1));
    if (path === "/start") {
      res.writeHead(302, { Location: "http://another.example/middle" });
      return res.end();
    }
    if (path === "/middle") {
      res.writeHead(301, { Location: "/static?variant=7&utm_source=store" });
      return res.end();
    }
    if (path === "/private") {
      res.writeHead(302, { Location: "http://169.254.169.254/" });
      return res.end();
    }
    if (path === "/mixed") {
      res.writeHead(302, { Location: "http://mixed.example/item" });
      return res.end();
    }
    if (path === "/loop") {
      res.writeHead(302, { Location: "/loop" });
      return res.end();
    }
    send(
      200,
      "text/html",
      '<meta property="og:title" content="Lamp"><meta property="og:price:amount" content="1500"><meta property="og:image" content="https://cdn.example/lamp.webp">',
    );
  }).listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const port = (fixture.address() as AddressInfo).port;
  const importer = createGenericProductImporter({
    timeout: 850,
    policyTimeout: 250,
    resolve: async (host: string) =>
      host === "mixed.example"
        ? [{ address: "93.184.216.34" }, { address: "::1" }]
        : [{ address: "93.184.216.34" }],
    transport(
      url: URL,
      options: RequestOptions,
      onResponse: (response: IncomingMessage) => void,
    ) {
      assert.ok(options.lookup);
      return request(
        {
          hostname: "127.0.0.1",
          port,
          path: url.pathname + url.search,
          headers: { Host: url.hostname },
          signal: options.signal,
          agent: false,
        },
        onResponse,
      );
    },
  });
  const api = createServer((req, res) =>
    productImportMiddleware(req, res, () => res.end(), importer),
  ).listen(0, "127.0.0.1");
  await once(api, "listening");
  t.after(() => {
    api.closeAllConnections();
    api.close();
    fixture.closeAllConnections();
    fixture.close();
  });
  const origin = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const preview = async (url: string, refresh = false) => {
    const result = await fetch(`${origin}/api/product-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, refresh }),
    });
    return { status: result.status, body: await result.json() };
  };
  assert.deepEqual(await (await fetch(`${origin}/api/health`)).json(), {
    status: "ok",
  });
  const staticUrl = "http://store.example/static?utm_source=share&variant=1";
  const result = await preview(staticUrl);
  assert.equal(result.status, 200);
  assert.equal(result.body.name, "Lamp");
  assert.equal(result.body.price, 1500);
  assert.equal(result.body.imageUrl, "https://cdn.example/lamp.webp");
  assert.equal(result.body.productUrl, "http://store.example/static?variant=1");
  assert.ok(seen.includes("store.example/static?utm_source=share&variant=1"));
  await preview(staticUrl.replace("share", "new"));
  assert.equal(seen.filter((path) => path.includes("/static?")).length, 1);
  await preview(staticUrl, true);
  assert.equal(seen.filter((path) => path.includes("/static?")).length, 2);
  const redirect = await preview("http://store.example/start");
  assert.equal(
    redirect.body.productUrl,
    "http://another.example/static?variant=7",
  );
  assert.ok(
    seen.indexOf("another.example/robots.txt") <
      seen.indexOf("another.example/middle"),
  );
  for (const [url, code, remote] of [
    ["http://store.example/shell", "JS_RENDER_REQUIRED", 200],
    ["http://store.example/denied", "ACCESS_RESTRICTED", 403],
    ["http://store.example/slow", "FETCH_TIMEOUT", undefined],
    ["http://store.example/json", "NOT_HTML", 200],
    ["http://store.example/big", "UNKNOWN", 200],
    ["http://store.example/private", "UNSAFE_URL", 302],
    ["http://store.example/mixed", "UNSAFE_URL", undefined],
    ["http://policy-denied.example/item", "ACCESS_RESTRICTED", 403],
  ] as const) {
    const result = await preview(url);
    assert.equal(result.status, 422, url);
    assert.equal(result.body.code, code, url);
    assert.equal(result.body.remote_status, remote, url);
  }
  await assert.rejects(importer("http://policy-slow.example/item", false), {
    code: "POLICY_TIMEOUT",
  });
  await assert.rejects(
    importer("http://store.example/loop", false),
    /too many/,
  );
  assert.equal(seen.filter((path) => path === "store.example/loop").length, 6);
  assert.deepEqual(
    seen.filter((path) =>
      /^(?:policy-(?:denied|slow)|mixed)\.example/.test(path),
    ),
    ["policy-denied.example/robots.txt", "policy-slow.example/robots.txt"],
  );
});
