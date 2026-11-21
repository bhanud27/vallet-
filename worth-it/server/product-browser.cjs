const { Buffer } = require("node:buffer");
// Opt-in only for explicitly authorized origins. All browser network traffic is fulfilled
// by the DNS-pinned, size-limited transport; Chromium never connects to page destinations.
function createBrowserFallback({
  fetchFile,
  policy,
  allowedHosts = [],
  timeout = 7000,
  channel = process.env.PRODUCT_BROWSER_CHANNEL,
}) {
  let busy = false;
  return async (input, signal) => {
    const url = new URL(input);
    if (busy || !allowedHosts.includes(url.hostname)) return null;
    busy = true;
    let browser;
    const deadline = AbortSignal.any([
      signal,
      AbortSignal.timeout(Math.min(timeout, 8000)),
    ]);
    const close = () => {
      void browser?.close().catch(() => {});
    };
    deadline.addEventListener("abort", close, { once: true });
    try {
      await policy(input, deadline);
      const { chromium } = require("playwright-core");
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        channel: ["chrome", "msedge"].includes(channel) ? channel : undefined,
        timeout: 4000,
        args: [
          "--js-flags=--max-old-space-size=96",
          "--disable-background-networking",
          "--disable-extensions",
          "--renderer-process-limit=1",
        ],
      });
      deadline.throwIfAborted();
      const context = await browser.newContext({
        acceptDownloads: false,
        serviceWorkers: "block",
        permissions: [],
        javaScriptEnabled: true,
      });
      let requests = 0,
        totalBytes = 0,
        denied = false;
      await context.route("**/*", async (route) => {
        const request = route.request();
        try {
          if (
            ++requests > 32 ||
            request.method() !== "GET" ||
            !["document", "script", "stylesheet", "xhr", "fetch"].includes(
              request.resourceType(),
            )
          )
            return route.abort();
          const target = new URL(request.url());
          if (
            target.origin !== url.origin ||
            target.protocol !== "https:" ||
            deadline.aborted
          )
            return route.abort();
          await policy(target.href, deadline);
          const file = await fetchFile(target.href, deadline, true, {
            resource: true,
            beforeRequest: policy,
          });
          totalBytes += file.body.length;
          if (totalBytes > 8 * 1024 * 1024) return route.abort();
          return route.fulfill({
            status: 200,
            contentType: file.type,
            body: file.body,
            headers: {
              "Content-Security-Policy":
                "default-src 'self' 'unsafe-inline' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; worker-src 'none'",
            },
          });
        } catch (e) {
          if (
            [401, 403, 429].includes(e.remoteStatus) ||
            e.code === "RETAILER_POLICY"
          )
            denied = true;
          return route.abort();
        }
      });
      // WebSockets are blocked separately from HTTP routes.
      await context.routeWebSocket("**/*", (socket) => socket.close());
      const page = await context.newPage();
      page.setDefaultTimeout(4000);
      page.setDefaultNavigationTimeout(5000);
      await page.goto(input, { waitUntil: "domcontentloaded" });
      await page
        .waitForLoadState("networkidle", { timeout: 1000 })
        .catch(() => {});
      deadline.throwIfAborted();
      if (denied || page.url() !== input) return null;
      const html = await page.content();
      if (
        Buffer.byteLength(html) > 5 * 1024 * 1024 ||
        /captcha|access denied|robot check/i.test(await page.title())
      )
        return null;
      return { html, url: input };
    } finally {
      deadline.removeEventListener("abort", close);
      await browser?.close().catch(() => {});
      busy = false;
    }
  };
}
module.exports = { createBrowserFallback };
