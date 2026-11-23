import { supabase } from "./supabase";
import { productPreviewOrigin } from "./productPreviewOrigin";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { MAX_POLL_MEDIA } from "./types";

export class ProductPreviewError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProductPreviewError";
  }
}

export interface ProductImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}
export interface ProductIntelligence {
  schema_version: 2;
  status: "success" | "partial" | "restricted" | "failed" | "unsupported";
  code: string | null;
  source: {
    retailer: string;
    original_url: string;
    canonical_url: string;
    site_name?: string;
  };
  product: {
    title: string | null;
    brand: string | null;
    price: {
      current: number | null;
      original: number | null;
      currency: string | null;
      discount_percentage: number | null;
      observed_at: string;
      state: string;
    };
    images: {
      url: string;
      status: string;
      code?: string;
      width?: number;
      height?: number;
    }[];
    variants: {
      id: string | null;
      attributes: Record<string, string>;
      price: number | null;
      currency: string | null;
      availability: string;
    }[];
    specifications: Record<string, string>;
    retailer_rating: {
      value: number;
      best: number;
      rating_count: number | null;
      review_count: number | null;
    } | null;
    availability: string;
  };
  extraction: {
    method: string;
    extracted_at: string;
    price_expires_at?: string;
    cache: string;
    missing_fields: string[];
    provenance: Record<string, { source: string | null; state: string }>;
  };
}
export interface ProductPreview {
  name: string;
  price: number | null;
  currency: string | null;
  description: string;
  brand: string;
  category: string;
  productUrl: string;
  platform: string;
  images: ProductImage[];
  intelligence?: ProductIntelligence;
  imagesPending?: boolean;
  originalPrice?: number;
  limited?: boolean;
  warning?: string;
}
function previewOrigin() {
  try {
    return productPreviewOrigin(
      process.env.EXPO_PUBLIC_PRODUCT_IMPORT_URL,
      __DEV__,
      Platform.OS,
      Constants.expoConfig?.hostUri,
      Platform.OS === "web" ? globalThis.location?.origin : undefined,
    );
  } catch {
    throw new ProductPreviewError("IMPORTER_NOT_CONFIGURED");
  }
}

export function productPhoto(image: ProductImage) {
  return {
    uri: `data:${image.mimeType};base64,${image.base64}`,
    mimeType: image.mimeType,
  };
}
const clonePreview = (value: ProductPreview): ProductPreview =>
  JSON.parse(JSON.stringify(value));
const cached = new Map<string, { until: number; value: ProductPreview }>();
type PreviewMode = "rich" | "enrichment" | "enriched-preview" | "full";
const pending = new Map<
  string,
  {
    controller: AbortController;
    promise: Promise<ProductPreview>;
    callers: number;
  }
>();

export async function getProductPreview(
  url: string,
  signal: AbortSignal,
  refresh = false,
  mode: PreviewMode = "full",
): Promise<ProductPreview> {
  signal.throwIfAborted();
  const key = url + "|" + mode;
  let request = pending.get(key);
  if (!request) {
    const controller = new AbortController();
    const promise = fetchProductPreview(url, controller.signal, refresh, mode);
    request = { controller, promise, callers: 0 };
    const work = request;
    pending.set(key, work);
    const clean = () => {
      if (pending.get(key) === work) pending.delete(key);
    };
    void promise.then(clean, clean);
  }

  const work = request;
  work.callers++;
  try {
    return await new Promise<ProductPreview>((resolve, reject) => {
      const cancel = () => reject(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
      void work.promise.then(
        (value) => {
          signal.removeEventListener("abort", cancel);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", cancel);
          reject(error);
        },
      );
    });
  } finally {
    if (--work.callers === 0 && pending.get(key) === work) {
      pending.delete(key);
      work.controller.abort();
    }
  }
}
async function fetchProductPreview(
  url: string,
  signal: AbortSignal,
  refresh: boolean,
  mode: PreviewMode,
): Promise<ProductPreview> {
  const origin = previewOrigin();
  if (!origin) throw new ProductPreviewError("IMPORTER_NOT_CONFIGURED");
  if (refresh)
    for (const entry of cached.keys())
      if (entry.startsWith(origin + "|" + url + "|")) cached.delete(entry);
  const key = origin + "|" + url + "|" + mode,
    hit = cached.get(key);
  if (signal.aborted) throw new Error("Preview request cancelled.");
  if (!refresh && hit && hit.until > Date.now()) return clonePreview(hit.value);
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  if (signal.aborted) throw new Error("Preview request cancelled.");
  const response = await fetch(`${origin}/api/product-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      url,
      refresh,
      detailsOnly: mode === "enrichment",
      mode,
    }),
    signal,
  }).catch((error) => {
    if (signal.aborted) throw error;
    throw new ProductPreviewError("IMPORTER_UNAVAILABLE");
  });
  const body = await response.json().catch(() => null);
  if (response.status === 401) throw new ProductPreviewError("AUTH_REQUIRED");
  if (response.status === 429) throw new ProductPreviewError("RATE_LIMITED");
  if (!body || response.status >= 500)
    throw new ProductPreviewError("IMPORTER_UNAVAILABLE");
  if (!response.ok || !Array.isArray(body.images))
    throw new ProductPreviewError(
      typeof body.code === "string" ? body.code : "EXTRACTION_FAILED",
    );
  let bytes = 0;
  const images: ProductImage[] = body.images
    .filter((image: ProductImage) => {
      if (
        !image ||
        !["image/jpeg", "image/png", "image/webp"].includes(image.mimeType) ||
        typeof image.base64 !== "string" ||
        !image.base64.length ||
        image.base64.length > Math.ceil((8 * 1024 * 1024) / 3) * 4 ||
        image.base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)
      )
        return false;
      bytes += image.base64.length;
      return bytes <= 28 * 1024 * 1024;
    })
    .slice(0, MAX_POLL_MEDIA);
  const text = (key: string, max: number) =>
    typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
  const value: ProductPreview = {
    name: text("name", 80),
    price:
      typeof body.price === "number" && body.price > 0 && body.price <= 10000000
        ? body.price
        : null,
    currency: /^[A-Z]{3}$/.test(body.currency) ? body.currency : null,
    description: text("description", 2000),
    brand: text("brand", 120),
    category: text("category", 160),
    productUrl: text("productUrl", 2048),
    platform: text("platform", 30),
    images,
    intelligence:
      body.schema_version === 2 &&
      body.product &&
      body.extraction &&
      body.source
        ? {
            schema_version: 2,
            status: body.status,
            code: body.code,
            product: body.product,
            source: body.source,
            extraction: body.extraction,
          }
        : undefined,
    imagesPending: body.imagesPending === true,
    originalPrice:
      typeof body.originalPrice === "number" &&
      body.originalPrice > 0 &&
      body.originalPrice <= 10000000
        ? body.originalPrice
        : undefined,
    limited: !!body.limited,
    warning: text("warning", 300) || undefined,
  };
  if (
    !images.length &&
    !value.name &&
    value.price === null &&
    !value.description &&
    !value.brand &&
    !value.warning
  )
    throw new Error(
      "This store did not share a product preview. Add details and photos manually.",
    );
  // Keep a bounded cache for both comparison slots and their metadata.
  if (cached.size >= 4) cached.delete(cached.keys().next().value!);
  cached.set(key, {
    until: Math.min(
      Date.now() +
        (value.intelligence?.extraction.cache === "stale" ? 10000 : 60000),
      value.intelligence?.extraction.cache === "stale"
        ? Date.now() + 10000
        : Date.parse(value.intelligence?.extraction.price_expires_at || "") ||
            Date.now() + 60000,
    ),
    value,
  });
  return clonePreview(value);
}
