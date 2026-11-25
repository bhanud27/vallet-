// Browser script passed to WebView verbatim, including in Hermes release builds.
module.exports = String.raw`function readPage(extract, nonce) {
  const bridge = window.ReactNativeWebView;
  const head = document.title;
  if (!bridge || document.hidden || document.readyState === "loading") return;
  const lead = document.body?.innerText.slice(0, 350) || "";
  if (/access denied|just a moment|attention required|verify (?:that )?you are human|robot check|security challenge|request blocked|^(?:403 forbidden|401 unauthorized|429 too many requests)/i.test(head) ||
      /^(?:access denied|verify (?:that )?you are human|request blocked|checking your browser)/i.test(lead.trim()) ||
      document.querySelector('iframe[src*="captcha"], iframe[src*="challenges.cloudflare.com"], #challenge-form')) return;

  const json = [];
  let remainingBytes = 2 * 1024 * 1024;
  for (const node of Array.from(document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"], #__NEXT_DATA__')).slice(0, 40)) {
    const text = node.textContent || "";
    if (text.length > remainingBytes) continue;
    remainingBytes -= text.length;
    json.push({ text, schema: node.getAttribute("type") === "application/ld+json" });
  }
  const tags = Object.create(null);
  for (const node of Array.from(document.querySelectorAll("meta[property], meta[name]")).slice(0, 300)) {
    const key = (node.getAttribute("property") || node.getAttribute("name") || "").toLowerCase();
    const value = node.getAttribute("content");
    if (value && !tags[key]) tags[key] = value;
  }
  const micro = Object.create(null);
  for (const node of Array.from(document.querySelectorAll("[itemprop]")).slice(0, 300)) {
    const value = node.getAttribute("content") || node.getAttribute("href") || node.getAttribute("src") || node.getAttribute("value") || node.textContent?.trim().slice(0, 2000);
    if (!value) continue;
    for (const key of (node.getAttribute("itemprop") || "").split(/\s+/)) {
      if (micro[key]) continue;
      micro[key] = key === "image" ? { url: value, width: node.getAttribute("width"), height: node.getAttribute("height") } : value;
    }
  }
  const url = location.href;
  const jsShell = lead.trim().length < 40 && !!document.querySelector("#root, #app, #app-root, #__next, #__nuxt, #__NEXT_DATA__");
  bridge.postMessage(JSON.stringify({ nonce, url, metadata: extract({ json, micro, tags, title: head, url, jsShell }) }));
}`;
