// This function also runs inside the device WebView. Keep it self-contained.
module.exports = String.raw`function productMetadata({ json, micro, tags, title, url, jsShell }) {
  const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
  const clean = (value, limit = 2000) => typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
  const pick = (...values) => values.find((value) => value != null && value !== "") ?? null;
  const amount = (value) => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const raw = String(value).replace(/[₹$€£¥,\s]/g, "").replace(/^(?:INR|Rs\.?)\s*/i, "");
    const price = Number(raw);
    return /^\d+(?:\.\d{1,2})?$/.test(raw) && price > 0 && price <= 10000000 ? price : null;
  };
  const currencyCode = (value) => typeof value === "string" && /^[A-Z]{3}$/i.test(value.trim())
    ? value.trim().toUpperCase() : null;
  const typed = (node) => list(node["@type"]).some((type) => /(?:^|[:/])(?:Product|IndividualProduct|ProductGroup)$/i.test(type));
  const matchesPage = (node) => {
    try {
      const candidate = new URL(node.url || node["@id"], url);
      const page = new URL(url);
      return candidate.origin === page.origin && candidate.pathname === page.pathname;
    } catch { return false; }
  };
  const state = [];
  const structured = [];
  const stack = json.map(({ text, schema }) => {
    try { return [JSON.parse(text), schema, ""]; } catch { return null; }
  }).filter(Boolean).reverse();
  for (let visited = 0; stack.length && visited < 15000; visited++) {
    const [node, schema, key] = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (typed(node)) structured.push(node);
    if (!schema && /^(product|productData|productDetails|selectedProduct|currentProduct|pdp|item)$/i.test(key)
      && (node.name || node.title || node.productName)
      && (node.price || node.salePrice || node.currentPrice || node.offers || node.image || node.images || node.media))
      state.push(node);
    if (stack.length >= 15000) continue;
    const children = Object.entries(node);
    for (let index = Math.min(children.length, 15000 - stack.length) - 1; index >= 0; index--) {
      const [childKey, child] = children[index];
      if (child && typeof child === "object") stack.push([child, schema, childKey]);
    }
  }
  const product = structured.find(matchesPage) || structured.find((node) => !node.url && !node["@id"])
    || (structured.length === 1 ? structured[0] : {}) || {};
  const embedded = state.find(matchesPage) || state[0] || {};
  const offer = (value) => {
    const queue = list(value).slice(0, 50).map((node) => [node, null]);
    for (let i = 0; i < queue.length && i < 50; i++) {
      const [node, inherited] = queue[i];
      if (!node || typeof node !== "object") continue;
      const currency = currencyCode(node.priceCurrency || node.currency) || inherited;
      const price = pick(amount(node.price), amount(node.lowPrice), amount(node.priceSpecification?.price));
      if (price != null) return { price, currency: currency || currencyCode(node.priceSpecification?.priceCurrency) };
      for (const child of list(node.offers).slice(0, 50 - queue.length)) queue.push([child, currency]);
    }
    return {};
  };
  const structuredOffer = offer(product.offers);
  const embeddedOffer = offer(embedded.offers);
  const name = pick(clean(product.name || product.title, 80), clean(micro.name, 80),
    clean(tags["og:title"] || tags["twitter:title"], 80), clean(embedded.name || embedded.title || embedded.productName, 80), clean(title, 80));
  const price = pick(structuredOffer.price, amount(product.price), amount(micro.price),
    amount(tags["product:price:amount"]), amount(tags["og:price:amount"]),
    embeddedOffer.price, amount(embedded.price?.amount ?? embedded.price), amount(embedded.salePrice ?? embedded.currentPrice));
  const currency = pick(structuredOffer.currency, currencyCode(product.priceCurrency), currencyCode(micro.priceCurrency),
    currencyCode(tags["product:price:currency"] || tags["og:price:currency"]),
    embeddedOffer.currency, currencyCode(embedded.price?.currency ?? embedded.currency), "INR");
  const images = (...values) => values.flatMap(list).map((value) => {
    const item = typeof value === "string" ? { url: value } : value;
    try {
      const raw = item?.contentUrl || item?.url || item?.src || item?.imageUrl || item?.imageURL;
      if (typeof raw !== "string" || !raw || raw.length > 2048) return null;
      const candidate = new URL(raw, url);
      const width = Number(item.width?.value ?? item.width) || 0;
      const height = Number(item.height?.value ?? item.height) || 0;
      if (candidate.protocol !== "https:" || candidate.username || candidate.password ||
        (width && width <= 2) || (height && height <= 2) ||
        /(?:^|[/_.-])(?:tracking[-_]?pixel|pixel|spacer|1x1)(?:[/_.-]|$)/i.test(candidate.pathname)) return null;
      return { url: candidate.href, area: width * height };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.area - a.area);
  const imageUrl = pick(
    images(product.image, product.images)[0]?.url,
    images(micro.image)[0]?.url,
    images({ url: tags["og:image:secure_url"] || tags["og:image"] || tags["og:image:url"], width: tags["og:image:width"], height: tags["og:image:height"] }, tags["twitter:image"], tags["twitter:image:src"])[0]?.url,
    images(embedded.image, embedded.images, embedded.media)[0]?.url,
  );
  return {
    title: name,
    price,
    currency,
    imageUrl,
    brand: clean(product.brand?.name || product.brand || micro.brand || tags["product:brand"] || embedded.brand?.name || embedded.brand, 120),
    description: clean(product.description || micro.description || tags["og:description"] || tags["twitter:description"] || tags.description || embedded.description),
    category: clean(product.category || micro.category || embedded.category, 160),
    jsRequired: !!(jsShell && (!name || (!price && !imageUrl))),
  };
}`;
