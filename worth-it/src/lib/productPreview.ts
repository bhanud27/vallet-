import { supabase } from "./supabase";
import { productPreviewOrigin } from "./productPreviewOrigin";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { MAX_POLL_MEDIA } from "./types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  cachedDeviceTier,
  hostTierTtl,
  importCode,
  nextProductImportTier,
  type ProductImportCode,
} from "./productImportTiers";

export class ProductPreviewError extends Error {
  readonly code: ProductImportCode;

  constructor(code: ProductImportCode) {
    super(code);
    this.code = code;
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
  imageUrl?: string;
  code?: ProductImportCode;
}
const origin = (() => {
  try {
    const resolved = productPreviewOrigin(
      process.env.EXPO_PUBLIC_IMPORTER_URL,
      __DEV__,
      Platform.OS,
      Constants.expoConfig?.hostUri,
      Platform.OS === "web" ? globalThis.location?.origin : undefined,
    );
    if (__DEV__) console.info("Product importer origin", resolved);
    return resolved;
  } catch {
    return null;
  }
})();

export function productPhoto(image: ProductImage) {
  return {
    uri: `data:${image.mimeType};base64,${image.base64}`,
    mimeType: image.mimeType,
  };
}
const clonePreview = (value: ProductPreview): ProductPreview =>
  JSON.parse(JSON.stringify(value));
const cached = new Map<string, { until: number; value: ProductPreview }>();

export function hasAutomaticProductDetails(preview: ProductPreview) {
  return !!(preview.name && (preview.price || preview.images.length || preview.imageUrl));
}

const hostTierKey = "product-import:device-hosts";
let hostTierWork: Promise<unknown> = Promise.resolve();

function withHostTiers<T>(use: (entries: Map<string, number>) => Promise<T> | T): Promise<T> {
  const work = hostTierWork.then(async () => {
    let data: [string, number][] = [];
    try {
      const saved = JSON.parse((await AsyncStorage.getItem(hostTierKey)) ?? "[]");
      if (Array.isArray(saved)) data = saved.filter((entry) =>
        Array.isArray(entry) && typeof entry[0] === "string" &&
        typeof entry[1] === "number" && cachedDeviceTier(String(entry[1])));
    } catch { /* Unavailable storage leaves normal tier ordering in place. */ }
    return use(new Map(data.slice(-32)));
  });
  hostTierWork = work.catch(() => {});
  return work;
}

const hostOf = (url: string) => new URL(url).hostname.toLowerCase();
const saveHostTiers = (hosts: Map<string, number>) =>
  AsyncStorage.setItem(hostTierKey, JSON.stringify([...hosts].slice(-32))).catch(() => {});

export async function rememberDeviceProductImport(url: string) {
  await withHostTiers((hosts) => {
    const host = hostOf(url);
    hosts.delete(host);
    hosts.set(host, Date.now() + hostTierTtl);
    return saveHostTiers(hosts);
  });
}

export async function startProductImport(url: string, signal: AbortSignal, refresh = false) {
  const native = Platform.OS !== "web";
  const host = hostOf(url);
  if (native && !refresh) {
    const preference = await withHostTiers((hosts) => hosts.has(host));
    signal.throwIfAborted();
    if (preference) return { tier: "device", code: "CLIENT_IMPORT_REQUIRED" } as const;
  }
  try {
    const preview = await getProductPreview(url, signal, refresh);
    if (hasAutomaticProductDetails(preview)) {
      void withHostTiers((hosts) => {
        if (hosts.delete(host)) return saveHostTiers(hosts);
      });
      return { tier: "server", preview } as const;
    }
    const code = preview.code ?? "PARTIAL_EXTRACTION";
    return { tier: nextProductImportTier(code, native), preview, code } as const;
  } catch (error) {
    signal.throwIfAborted();
    const code = error instanceof ProductPreviewError ? error.code : "UNKNOWN";
    return { tier: nextProductImportTier(code, native), code } as const;
  }
}
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
  const key = url + "|" + mode + (refresh ? "|refresh" : "");
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
    throw new ProductPreviewError("NETWORK_ERROR");
  });
  const body = await response.json().catch(() => null);
  if (!body || response.status >= 500)
    throw new ProductPreviewError("NETWORK_ERROR");
  if (!Array.isArray(body.images) || (!response.ok && response.status !== 422))
    throw new ProductPreviewError(
      importCode(body.code),
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
    imageUrl: text("imageUrl", 2048) || undefined,
    code: body.code == null ? undefined : importCode(body.code),
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
    !value.imageUrl &&
    !value.name &&
    value.price === null &&
    !value.description &&
    !value.brand &&
    !value.warning
  )
    throw new ProductPreviewError(value.code ?? "PARTIAL_EXTRACTION");
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
