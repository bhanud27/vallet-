// Offline browser-fallback verification: every request is fulfilled from a synthetic document.
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const { createBrowserFallback } = require("../server/product-browser.cjs");
const { extractProduct, publicUrl } = require("../server/product-import.cjs");
const { extractIntelligence } = require("../server/product-model.cjs");
async function main() {
  const calls = [];
  const url = "https://permitted.fixture.example/product";
  const html = `<title>Rendered fixture</title><script>
    const s=document.createElement('script');s.type='application/ld+json';
    s.textContent=JSON.stringify({'@type':'Product',name:'Rendered fixture product',offers:{price:400,priceCurrency:'INR'}});document.head.appendChild(s);
    fetch('http://127.0.0.1:9999/private').catch(()=>{});
    fetch('https://other.fixture.example/leak').catch(()=>{});
  </script>`;
  const render = createBrowserFallback({
    allowedHosts: ["permitted.fixture.example"],
    channel: process.platform === "win32" ? "msedge" : undefined,
    policy: async (target) => {
      assert.equal(new URL(target).origin, new URL(url).origin);
    },
    fetchFile: async (target) => {
      calls.push(target);
      assert.equal(target, url);
      return {
        body: Buffer.from(html),
        type: "text/html",
        url: new URL(target),
      };
    },
  });
  const started = Date.now();
  const result = await render(url, AbortSignal.timeout(8000));
  assert.ok(result?.html.includes("Rendered fixture product"));
  const p = await extractIntelligence(
    result.html,
    url,
    await extractProduct(result.html, url),
    publicUrl,
  );
  assert.equal(p.product.price.current, 400);
  assert.deepEqual(calls, [url]);
  console.log(
    JSON.stringify({
      result: "passed",
      method: "offline_browser_rendering",
      requests_fulfilled: calls.length,
      unsafe_requests_blocked: true,
      milliseconds: Date.now() - started,
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
