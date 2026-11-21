const { imageIdentity, imageResolution } = require("./retailer-images.cjs");
const { extractAdapter, retailerImages } = require("./product-adapters.cjs");
const list = (value) =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const clean = (value, max = 2000) =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max) || null
    : value && typeof value === "object"
      ? clean(value.name || value.value || value.label, max)
      : null;
function amount(value) {
  const raw = String(value ?? "").replace(/[₹,$€£\s]/g, "");
  return /^\d+(?:\.\d{1,2})?$/.test(raw) && +raw > 0 && +raw <= 10000000
    ? +raw
    : null;
}
const currency = (v) =>
  /^[A-Z]{3}$/.test(String(v || "").toUpperCase())
    ? String(v).toUpperCase()
    : null;
function safeLink(value, base, validate) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return validate(value, base).href;
  } catch {
    return null;
  }
}
function available(v) {
  const text = String(v || "")
    .split("/")
    .pop()
    .toLowerCase();
  return (
    {
      instock: "in_stock",
      outofstock: "out_of_stock",
      soldout: "out_of_stock",
      preorder: "preorder",
      backorder: "backorder",
      discontinued: "discontinued",
    }[text] || "unknown"
  );
}
function imageUrls(value) {
  return list(value).flatMap((v) =>
    typeof v === "string"
      ? [v]
      : v && typeof v === "object"
        ? [v.contentUrl || v.url || v.src || v.imageUrl || v.imageURL].filter(
            Boolean,
          )
        : [],
  );
}
function scopedProducts(value, target) {
  const nodes = [],
    pending = [value];
  let visited = 0;
  while (pending.length && visited++ < 20000) {
    const node = pending.shift();
    if (!node || typeof node !== "object") continue;
    if (
      list(node["@type"]).some((t) =>
        /(^|\/)(Product|ProductGroup|IndividualProduct)$/i.test(t),
      )
    ) {
      nodes.push(node);
      continue;
    }
    pending.push(
      ...Object.values(node).filter((v) => v && typeof v === "object"),
    );
  }
  const matches = (node) => {
    try {
      const a = new URL(node.url || node["@id"], target),
        b = new URL(target);
      return (
        a.origin === b.origin &&
        a.pathname === b.pathname &&
        (!a.search || a.search === b.search)
      );
    } catch {
      return false;
    }
  };
  return nodes.find(matches) || nodes.find((n) => !n.url && !n["@id"]);
}
async function extractIntelligence(html, url, legacy, validate) {
  const { parse } = await import("parse5");
  const pending = [{ node: parse(html), product: false, excluded: false }],
    scripts = [],
    structured = [],
    meta = {},
    micro = {},
    gallery = [];
  let canonical = null,
    storefront = null;
  for (let cursor = 0; cursor < pending.length && cursor < 60000; cursor++) {
    const { node, product: parent, excluded: parentExcluded } = pending[cursor];
    const a = Object.fromEntries(
      (node.attrs || []).map((v) => [v.name, v.value]),
    );
    const signature = [a.id, a.class, a["data-testid"]]
      .filter(Boolean)
      .join(" ");
    const excluded =
      parentExcluded ||
      /recommend|similar-products|related-products|advert|seller-avatar/i.test(
        signature,
      );
    const product =
      parent ||
      /schema.org\/Product|product[-_ ]*(gallery|image|media)|pdp[-_ ]*(gallery|image)|woocommerce-product/i.test(
        [signature, a.itemtype].join(" "),
      );
    for (const child of node.childNodes || [])
      pending.push({ node: child, product, excluded });
    const text = (node.childNodes || []).map((n) => n.value || "").join("");
    if (node.tagName === "script") {
      scripts.push({ text, type: a.type, id: a.id });
      if (a.type === "application/ld+json")
        try {
          structured.push(JSON.parse(text));
        } catch {
          /* Other sources remain usable. */
        }
    }
    if (node.tagName === "meta")
      meta[(a.property || a.name || a.itemprop || "").toLowerCase()] ??=
        a.content;
    if (node.tagName === "link" && /\bcanonical\b/i.test(a.rel || "")) {
      const candidate = safeLink(a.href, url, validate);
      if (candidate && new URL(candidate).origin === new URL(url).origin) {
        // Canonicals often drop selection parameters; retain the selected variant.
        const c = new URL(candidate);
        for (const [k, v] of new URL(url).searchParams)
          if (!/^utm_|^(gclid|fbclid)$/i.test(k)) c.searchParams.set(k, v);
        canonical = c.href;
      }
    }
    if (!excluded && product && a.itemprop)
      micro[a.itemprop.toLowerCase()] ??= a.content || a.href || clean(text);
    if (!excluded && product && ["img", "source"].includes(node.tagName)) {
      const choices = (a["data-srcset"] || a.srcset || "")
        .split(",")
        .map((v) => v.trim().split(/\s+/))
        .sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
      gallery.push(
        a["data-zoom-image"] ||
          a["data-large_image"] ||
          choices[0]?.[0] ||
          a["data-src"] ||
          a["data-original"] ||
          a["data-lazy-src"] ||
          a.src,
      );
    }
    if (/shopify/i.test(a.src || "") || /shopify/i.test(meta.generator || ""))
      storefront = "shopify";
    if (/woocommerce/i.test(signature + " " + (a.src || "")))
      storefront = "woocommerce";
  }
  const structuredProduct = scopedProducts(structured, url),
    adapter = extractAdapter({ scripts, url }),
    embedded = adapter.data;
  const sources = [
    ["structured_data", structuredProduct],
    ["embedded_data", embedded],
    ["microdata", micro],
  ];
  const provenance = {},
    conflicts = [];
  function choose(field, candidates) {
    const valid = candidates.filter(
      (c) =>
        c[1] != null && c[1] !== "" && !(Array.isArray(c[1]) && !c[1].length),
    );
    const first = valid[0];
    provenance[field] = {
      source: first?.[0] || null,
      state: first ? "extracted_unverified" : "missing",
    };
    const disagreements = valid
      .slice(1)
      .filter((c) => JSON.stringify(c[1]) !== JSON.stringify(first[1]));
    if (disagreements.length) {
      provenance[field].state = "conflicting";
      conflicts.push({
        field,
        chosen: first[0],
        alternatives: disagreements.map((c) => c[0]),
      });
    }
    return first?.[1] ?? null;
  }
  const offersOf = (p) => list(p?.offers);
  const selectedVariant = list(structuredProduct?.hasVariant).find((v) => {
    try {
      return new URL(v.url, url).href === new URL(url).href;
    } catch {
      return false;
    }
  });
  const structuredOffer = offersOf(selectedVariant || structuredProduct).find(
    (o) => amount(o?.price ?? o?.priceSpecification?.price) != null,
  );
  const embeddedPrice = amount(
    embedded?.price?.discounted ??
      embedded?.price?.value ??
      embedded?.selling_price ??
      embedded?.discountedPrice ??
      embedded?.price,
  );
  const title = choose("title", [
    ...sources.map(([s, p]) => [
      s,
      clean(p?.name || p?.title || p?.productName, 80),
    ]),
    ["open_graph", clean(meta["og:title"] || meta["twitter:title"], 80)],
    ["generic", clean(legacy.name, 80)],
  ]);
  const current = choose("price.current", [
    [
      "structured_data",
      amount(
        structuredOffer?.price ?? structuredOffer?.priceSpecification?.price,
      ),
    ],
    ["embedded_data", embeddedPrice],
    ["microdata", amount(micro.price)],
    [
      "open_graph",
      amount(meta["product:price:amount"] || meta["og:price:amount"]),
    ],
  ]);
  const priceSources = {
    structured_data: amount(
      structuredOffer?.price ?? structuredOffer?.priceSpecification?.price,
    ),
    embedded_data: embeddedPrice,
    microdata: amount(micro.price),
    open_graph: amount(meta["product:price:amount"] || meta["og:price:amount"]),
  };
  const priceCurrency = choose(
    "price.currency",
    [
      [
        "structured_data",
        currency(
          structuredOffer?.priceCurrency ||
            structuredOffer?.priceSpecification?.priceCurrency,
        ),
      ],
      [
        "embedded_data",
        currency(
          embedded?.currency ||
            embedded?.price?.currencyIso ||
            embedded?.price?.currency,
        ),
      ],
      ["microdata", currency(micro.pricecurrency)],
      [
        "open_graph",
        currency(meta["product:price:currency"] || meta["og:price:currency"]),
      ],
    ].filter(([source]) => priceSources[source] === current && current != null),
  );
  const originalCandidates = [
    [
      "embedded_data",
      amount(
        embedded?.mrp ??
          embedded?.price?.mrp ??
          embedded?.originalPrice ??
          embedded?.original_price,
      ),
    ],
    ["open_graph", amount(meta["product:original_price:amount"])],
  ];
  for (const spec of list(structuredOffer?.priceSpecification))
    if (/ListPrice|StrikethroughPrice|MSRP/i.test(spec?.priceType || ""))
      originalCandidates.unshift(["structured_data", amount(spec.price)]);
  const embeddedCurrency = currency(
    embedded?.currency ||
      embedded?.price?.currencyIso ||
      embedded?.price?.currency,
  );
  const original = choose(
    "price.original",
    originalCandidates.filter(
      ([source, v]) =>
        v != null &&
        (current == null || v >= current) &&
        !(
          source === "embedded_data" &&
          embeddedCurrency &&
          priceCurrency &&
          embeddedCurrency !== priceCurrency
        ),
    ),
  );
  const field = (name, keys, fallback) =>
    choose(name, [
      ...sources.map(([s, p]) => [
        s,
        clean(keys.map((k) => p?.[k]).find((v) => v != null)),
      ]),
      ["open_graph", clean(fallback)],
    ]);
  const specifications = Object.create(null);
  for (const p of [embedded, structuredProduct]) {
    for (const attr of list(
      p?.additionalProperty || p?.attributes || p?.specifications,
    )) {
      const key = clean(attr?.name || attr?.key, 100),
        value = clean(attr?.value, 500);
      if (key && value && Object.keys(specifications).length < 80)
        specifications[key] = value;
    }
    if (
      p?.specifications &&
      !Array.isArray(p.specifications) &&
      typeof p.specifications === "object"
    )
      for (const [k, v] of Object.entries(p.specifications).slice(0, 80))
        if (clean(v, 500)) specifications[clean(k, 100)] = clean(v, 500);
    for (const key of [
      "material",
      "fabric",
      "color",
      "size",
      "weight",
      "width",
      "height",
      "depth",
      "capacity",
      "warranty",
      "countryOfOrigin",
      "careInstructions",
      "packageContents",
    ])
      if (clean(p?.[key])) specifications[key] = clean(p[key], 500);
  }
  const variants = [];
  for (const [source, parent] of sources.slice(0, 2))
    for (const v of list(
      parent?.hasVariant || parent?.variants || parent?.sizes,
    ).slice(0, 80)) {
      if (!v || typeof v !== "object") continue;
      const offer = offersOf(v)[0] || v;
      const attrs = Object.create(null);
      for (const k of [
        "size",
        "color",
        "capacity",
        "storage",
        "style",
        "model",
        "option1",
        "option2",
        "option3",
      ])
        if (clean(v[k])) attrs[k] = clean(v[k], 120);
      const id = clean(v.sku || v.id || v.code, 120),
        variantUrl = safeLink(v.url, url, validate);
      if (!id && !variantUrl && !Object.keys(attrs).length) continue;
      const key = id || variantUrl || JSON.stringify(attrs);
      if (variants.some((v) => v.key === key)) continue;
      variants.push({
        key,
        id,
        url: variantUrl,
        attributes: attrs,
        price: amount(offer.price?.value ?? offer.price),
        currency: currency(offer.priceCurrency || offer.currency),
        availability: available(offer.availability),
        images: imageUrls(v.image || v.images)
          .map((i) => safeLink(i, url, validate))
          .filter(Boolean),
        source,
      });
    }
  const candidates = [
    ...imageUrls(selectedVariant?.image || structuredProduct?.image),
    ...retailerImages(embedded),
    ...imageUrls(embedded?.images || embedded?.image),
    ...legacy.images,
    ...gallery,
    ...variants.flatMap((v) => v.images),
  ];
  const seen = new Set(),
    images = [];
  for (const raw of candidates) {
    const value = safeLink(raw, url, validate);
    if (!value) continue;
    const identity = imageIdentity(value);
    if (seen.has(identity)) {
      const old = images.find((i) => imageIdentity(i.url) === identity);
      if (old && imageResolution(value) > imageResolution(old.url)) {
        old.url = value;
        old.source_url = value;
      }
      continue;
    }
    seen.add(identity);
    if (
      /(?:^|[\/_-])(?:placeholder|no[-_]?image|spacer|sprite|logo|transparent|tracking)(?:[\/_.-]|$)/i.test(
        new URL(value).pathname,
      )
    )
      continue;
    images.push({
      url: value,
      source_url: value,
      is_primary: images.length === 0,
      status: "unverified",
      source:
        candidates.indexOf(raw) < imageUrls(structuredProduct?.image).length
          ? "structured_data"
          : "delivered_page",
    });
    if (images.length >= 48) break;
  }
  const ratingNode =
    structuredProduct?.aggregateRating || embedded?.aggregateRating;
  const ratingValue = Number(ratingNode?.ratingValue),
    best = Number(ratingNode?.bestRating || 5),
    worst = Number(ratingNode?.worstRating || 1);
  const count = (v) => (/^\d{1,10}$/.test(String(v)) ? Number(v) : null);
  const product = {
    id: field("id", ["productID", "productId", "styleId", "id", "code"]),
    title,
    url,
    canonical_url: canonical || url,
    retailer: adapter.retailer,
    storefront,
    brand: field(
      "brand",
      ["brand", "brandName", "vendor"],
      meta["product:brand"],
    ),
    manufacturer: field("manufacturer", ["manufacturer"]),
    seller: clean(structuredOffer?.seller || embedded?.seller),
    sku: field("sku", ["sku"]),
    model: field("model", ["model", "modelNumber"]),
    gtin: field("gtin", [
      "gtin",
      "gtin13",
      "gtin12",
      "gtin14",
      "ean",
      "upc",
      "isbn",
    ]),
    category: field(
      "category",
      ["category", "categoryName", "articleType", "type"],
      legacy.category,
    ),
    subcategory: field("subcategory", ["subcategory"]),
    description: field(
      "description",
      ["description", "productDescription"],
      legacy.description,
    ),
    price: {
      current,
      original,
      currency: priceCurrency,
      discount_amount:
        current != null && original != null
          ? +(original - current).toFixed(2)
          : null,
      discount_percentage:
        current != null && original != null && original > current
          ? Math.round(((original - current) / original) * 100)
          : null,
      observed_at: new Date().toISOString(),
      state: current == null ? "missing" : "extracted_unverified",
    },
    offers: offersOf(structuredProduct)
      .slice(0, 20)
      .map((o) => ({
        price: amount(o.price),
        currency: currency(o.priceCurrency),
        availability: available(o.availability),
        seller: clean(o.seller),
      })),
    coupons: clean(embedded?.coupon || embedded?.couponCode),
    images,
    image_count: images.length,
    specifications,
    features: list(structuredProduct?.featureList || embedded?.features)
      .map((v) => clean(v, 500))
      .filter(Boolean)
      .slice(0, 30),
    variants,
    availability: available(
      structuredOffer?.availability ||
        embedded?.availability ||
        micro.availability,
    ),
    delivery: clean(structuredOffer?.shippingDetails?.description),
    return_policy: clean(structuredOffer?.hasMerchantReturnPolicy?.description),
    exchange_policy: null,
    retailer_rating:
      ratingNode &&
      Number.isFinite(ratingValue) &&
      ratingValue >= worst &&
      ratingValue <= best
        ? {
            value: ratingValue,
            best,
            worst,
            rating_count: count(ratingNode.ratingCount),
            review_count: count(ratingNode.reviewCount),
          }
        : null,
  };
  for (const [key, value] of Object.entries(product))
    if (!provenance[key]) {
      const missing =
        value == null ||
        value === "unknown" ||
        (Array.isArray(value) && !value.length) ||
        (typeof value === "object" &&
          !Array.isArray(value) &&
          !Object.keys(value).length);
      provenance[key] = {
        source: missing ? null : "delivered_page",
        state: missing ? "missing" : "extracted_unverified",
      };
    }
  const missing = ["title", "brand", "description", "category"].filter(
    (k) => product[k] == null,
  );
  if (current == null) missing.push("price.current");
  if (priceCurrency == null) missing.push("price.currency");
  if (!images.length) missing.push("images");
  if (!product.retailer_rating) missing.push("retailer_rating");
  if (product.availability === "unknown") missing.push("availability");
  const methods = [
    ...new Set(
      Object.values(provenance)
        .map((v) => v.source)
        .filter(Boolean),
    ),
  ];
  return {
    schema_version: 2,
    status: missing.length ? "partial" : "success",
    code: missing.length ? "PARTIAL_EXTRACTION" : null,
    source: {
      retailer: adapter.retailer,
      original_url: url,
      canonical_url: canonical || url,
    },
    product,
    extraction: {
      method: methods.join("+"),
      provenance,
      conflicts,
      missing_fields: missing,
      extracted_at: new Date().toISOString(),
      // Coverage is completeness, not a probability that a value is correct.
      coverage: { present: 9 - missing.length, total: 9 },
      cache: "miss",
      provider: false,
      browser: false,
    },
  };
}
function failureCode(error) {
  if (
    error.code === "RETAILER_POLICY" ||
    [401, 403].includes(error.remoteStatus)
  )
    return "ACCESS_RESTRICTED";
  if (error.remoteStatus === 404 || error.remoteStatus === 410)
    return "PRODUCT_NOT_FOUND";
  if (error.code === "UNSUPPORTED_URL") return "UNSUPPORTED_URL";
  if (error.status === 401) return "AUTH_REQUIRED";
  if (error.status === 400) return "INVALID_URL";
  if (error.remoteStatus === 429 || error.status === 429) return "RATE_LIMITED";
  if (["TimeoutError", "AbortError"].includes(error.name))
    return "EXTRACTION_TIMEOUT";
  return error.code &&
    /^[A-Z_]+$/.test(error.code) &&
    ["METADATA_NOT_FOUND", "ACCESS_RESTRICTED", "PROVIDER_ERROR"].includes(
      error.code,
    )
    ? error.code
    : "EXTRACTION_FAILED";
}
module.exports = {
  extractIntelligence,
  amount,
  available,
  failureCode,
  imageUrls,
};
