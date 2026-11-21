import { supabase } from "./supabase";
import { productPreviewOrigin } from "./productPreviewOrigin";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { MAX_POLL_MEDIA } from "./types";
export interface ProductImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}
export interface ProductIntelligence {
  schema_version: 2;
  status: "success" | "partial" | "restricted" | "failed" | "unsupported";
  code: string | null;
  source: { retailer: string; original_url: string; canonical_url: string };
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
  limited?: boolean;
  warning?: string;
}
function previewOrigin() {
  return productPreviewOrigin(
    process.env.EXPO_PUBLIC_PRODUCT_IMPORT_URL,
    __DEV__,
    Platform.OS,
    Constants.expoConfig?.hostUri,
    typeof window === "undefined" ? undefined : window.location.origin,
  );
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
export async function getProductPreview(
  url: string,
  signal: AbortSignal,
  refresh = false,
  detailsOnly = false,
): Promise<ProductPreview> {
  const origin = previewOrigin();
  if (!origin)
    throw new Error(
      "Automatic previews are unavailable here. Add details and photos manually.",
    );
  if (refresh)
    for (const entry of cached.keys())
      if (entry.startsWith(origin + "|" + url + "|")) cached.delete(entry);
  const key = origin + "|" + url + (detailsOnly ? "|details" : "|full"),
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
    body: JSON.stringify({ url, refresh, detailsOnly }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.images))
    throw new Error(
      body.error || "The store did not provide a product preview.",
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
  // Keep only two image-bearing previews (the backend also has a bounded cache).
  if (cached.size >= 2) cached.delete(cached.keys().next().value!);
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
