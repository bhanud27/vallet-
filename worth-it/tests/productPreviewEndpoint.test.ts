import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request, type IncomingMessage, type RequestOptions } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

const { createProductImporter, createPreviewImporter, productImportMiddleware } =
  require("../server/product-import.cjs");
const { configuredSerpApi } = require("../server/product-serpapi.cjs");

const ajio = "https://www.ajio.com/linen-shirt/p/123_blue?size=M";
const myntra = "https://www.myntra.com/tops/original-slug/987654/buy";
const zara = "https://www.zara.com/in/en/linen-shirt-p12345678.html";
const hm = "https://www2.hm.com/en_in/productpage.1234567001.html";
const images = "https://cdn.example";

function product(fields: Record<string, unknown>) {
  return '<script type="application/ld+json">' +
    JSON.stringify({ "@type": "Product", ...fields }) + "</script>";
}

test("app preview resolves retailer shares, binds search results and verifies covers", async (t) => {
  const sharp = require("sharp");
  const picture = await sharp({
    create: { width: 320, height: 360, channels: 3, background: "#ab9782" },
  }).png().toBuffer();
  const requests: string[] = [];
  const queries: string[] = [];
  const fixture = createServer((req, res) => {
    const url = new URL(req.url!, `https://${req.headers.host}`);
    requests.push(url.href);
    const send = (status: number, type: string, body: string | Buffer) => {
      res.writeHead(status, { "Content-Type": type });
      res.end(body);
    };
    if (url.pathname === "/robots.txt")
      return send(200, "text/plain", "User-agent: *\nAllow: /");
    if (url.pathname === "/broken.png")
      return send(200, "image/png", picture.subarray(0, 24));
    if (url.pathname === "/denied.png") return send(403, "text/plain", "");
    if (url.hostname === "cdn.example" && url.pathname.endsWith(".png"))
      return send(200, "image/png", picture);
    if (url.href === ajio)
      return send(200, "text/html", product({
        name: "AJIO linen shirt",
        image: images + "/ajio.png",
        offers: { price: 1599 },
      }));
    if (url.href === myntra)
      return send(200, "text/html", product({
        name: "Direct Myntra title",
        description: "Direct fabric details",
        brand: "Direct brand",
      }));
    if (url.origin + url.pathname === zara)
      return send(403, "text/html", "Access denied");
    if (url.href === hm || url.href === hm + "?onlyBroken=1")
      return send(200, "text/html", product({
        name: "H&M cotton top",
        image: url.search ? [images + "/broken.png", images + "/denied.png"] :
          [images + "/broken.png", images + "/hm.png"],
        offers: { price: 999, priceCurrency: "INR" },
      }));
    if (url.hostname === "www.myntra.com" && url.pathname.startsWith("/tops/relay/"))
      return send(403, "text/html", "Access denied");
    send(404, "text/html", "");
  }).listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const provider = configuredSerpApi({
    PRODUCT_SERPAPI_ENABLED: "true",
    SERPAPI_API_KEY: "fixture-key",
    PRODUCT_IMAGE_COPY_HOSTS: "cdn.example",
  }, async (endpoint: string) => {
    const params = new URL(endpoint).searchParams;
    const query = params.get("q")!;
    queries.push(query);
    if (query === "myntra 987654 site:www.myntra.com") {
      return Response.json({
        organic_results: [
          { link: myntra.replace("987654", "987655"), title: "Wrong ID", thumbnail: images + "/wrong-id.png" },
          { link: myntra.replace("www.myntra.com", "www.ajio.com"), title: "Wrong retailer", thumbnail: images + "/wrong-retailer.png" },
          { link: myntra.replace("original-slug", "indexed-slug") + "?srsltid=tracking", title: "Indexed title", thumbnail: images + "/myntra.png" },
        ],
        product_result: {
          pricing: [{ link: myntra, extracted_price: 249, currency: "INR" }],
        },
      });
    }
    if (query.startsWith("zara 12345678 ")) {
      assert.equal(params.get("gl"), "in");
      return Response.json({ organic_results: [
        { link: zara, title: "No variant", thumbnail: images + "/no-variant.png" },
        { link: zara.replace("/in/en/", "/us/en/") + "?v1=111", title: "Wrong market", thumbnail: images + "/wrong-market.png" },
        { link: zara + "?v1=111", title: "Red ZARA shirt", thumbnail: images + "/red.png" },
        { link: zara + "?v1=222", title: "Blue ZARA shirt", thumbnail: images + "/blue.png" },
      ] });
    }
    return Response.json({});
  });
  const importer = createPreviewImporter(createProductImporter({
    imageCopyHosts: ["cdn.example"],
    ttl: 300000,
    log: () => {},
    providers: [provider, {
      name: "fixture-merchant-feed",
      supports: (_retailer: string, url: string) => new URL(url).pathname.startsWith("/tops/relay/"),
      async extract({ url }: { url: string }) {
        const age = url.endsWith("/111222/buy") ? 60000 : 600000;
        return {
          url,
          offerObservedAt: new Date(Date.now() - age).toISOString(),
          html: product({ name: "Merchant product", offers: { price: 777 } }),
        };
      },
    }],
    resolve: async () => [{ address: "93.184.216.34" }],
    transport(url: URL, options: RequestOptions, onResponse: (response: IncomingMessage) => void) {
      assert.ok(options.lookup);
      return request({
        hostname: "127.0.0.1",
        port: (fixture.address() as AddressInfo).port,
        path: url.pathname + url.search,
        headers: { Host: url.hostname },
        signal: options.signal,
        agent: false,
      }, onResponse);
    },
  }));
  const api = createServer((req, res) =>
    productImportMiddleware(req, res, () => res.end(), importer),
  ).listen(0, "127.0.0.1");
  t.after(() => {
    api.closeAllConnections();
    api.close();
    fixture.closeAllConnections();
    fixture.close();
  });
  await once(api, "listening");
  const preview = async (url: string) => {
    const response = await fetch(`http://127.0.0.1:${(api.address() as AddressInfo).port}/api/product-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, mode: "full", detailsOnly: false }),
    });
    assert.ok([200, 422].includes(response.status), url);
    return response.json();
  };

  await t.test("AJIO resolves both OneLink destination fields on the official product host", async () => {
    const share = "https://ajioapps.onelink.me/1234/share?";
    for (const param of [
      new URLSearchParams({ deep_link_value: ajio + "&utm_source=one" }),
      new URLSearchParams({ deep_link_value: "https://www.ajio.com/shop/p/item/extra", af_web_dp: ajio }),
    ]) {
      const url = share + param;
      const result = await preview(url);
      assert.equal(result.name, "AJIO linen shirt");
      assert.equal(result.productUrl, ajio);
      assert.equal(result.source.original_url, url);
      assert.equal(result.currency, null);
    }
    assert.ok(requests.includes(ajio));
    assert.ok(!requests.some((url) => url.includes("onelink.me") || url.includes("/extra")));
  });

  await t.test("Myntra exact-ID recovery preserves direct fields and excludes indexed price", async () => {
    const result = await preview(myntra);
    assert.equal(result.name, "Direct Myntra title");
    assert.equal(result.description, "Direct fabric details");
    assert.equal(result.brand, "Direct brand");
    assert.equal(result.product.main_image, images + "/myntra.png");
    assert.equal(result.images.length, 1);
    assert.equal(result.extraction.provider, true);
    assert.equal(result.price, null);
    assert.equal(result.product.price.current, null);
    assert.equal(result.currency, null);
  });

  await t.test("ZARA isolates cache and search matches for two variants of the same product", async () => {
    for (const [id, color] of [["111", "red"], ["222", "blue"]]) {
      const url = zara + "?v1=" + id;
      const result = await preview(url);
      assert.equal(result.name.toLowerCase(), color + " zara shirt");
      assert.equal(result.productUrl, url);
      assert.equal(result.product.main_image, images + "/" + color + ".png");
      assert.ok(queries.includes("zara 12345678 site:www.zara.com/in/en/ " + id));
    }
    assert.equal((await preview(zara + "?v1=111")).extraction.cache, "hit");
    assert.ok(!requests.some((url) => /wrong-|no-variant/.test(url)));
  });

  await t.test("H&M skips broken image bytes and retains details if every image fails", async () => {
    const result = await preview(hm);
    assert.equal(result.name, "H&M cotton top");
    assert.equal(result.price, 999);
    assert.equal(result.product.images[0].status, "failed");
    assert.equal(result.product.main_image, images + "/hm.png");
    assert.equal(result.images.length, 1);
    const cover = await sharp(Buffer.from(result.images[0].base64, "base64")).metadata();
    assert.equal(cover.width, 320);
    const allFailed = await preview(hm + "?onlyBroken=1");
    assert.equal(allFailed.name, result.name);
    assert.equal(allFailed.price, result.price);
    assert.deepEqual(allFailed.images, []);
  });

  await t.test("fresh merchant offers expire from observation and retain unknown currency", async () => {
    const result = await preview("https://www.myntra.com/tops/relay/111222/buy");
    assert.equal(result.price, 777);
    assert.equal(result.currency, null);
    assert.equal(result.product.price.currency, null);
    assert.equal(
      Date.parse(result.extraction.price_expires_at) - Date.parse(result.product.price.observed_at),
      300000,
    );
    const old = await preview("https://www.myntra.com/tops/relay/333444/buy");
    assert.equal(old.name, "Merchant product");
    assert.equal(old.price, null);
    assert.equal(old.extraction.price_expires_at, null);
  });
});
