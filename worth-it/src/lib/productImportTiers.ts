import codes from "../../shared/product-import-codes.json";

export type ProductImportCode = keyof typeof codes;

export function importCode(value: unknown): ProductImportCode {
  return typeof value === "string" && Object.hasOwn(codes, value)
    ? (value as ProductImportCode)
    : "UNKNOWN";
}

const deviceCodes = new Set<ProductImportCode>([
  "ACCESS_RESTRICTED",
  "POLICY_TIMEOUT",
  "FETCH_TIMEOUT",
  "JS_RENDER_REQUIRED",
  "CLIENT_IMPORT_REQUIRED",
  "IMPORTER_NOT_CONFIGURED",
  "NETWORK_ERROR",
  "PARTIAL_EXTRACTION",
]);

export function nextProductImportTier(
  code: ProductImportCode,
  native: boolean,
) {
  return native && deviceCodes.has(code) ? "device" : "manual";
}

export const hostTierTtl = 7 * 24 * 60 * 60 * 1000;

export function cachedDeviceTier(value: string | null, now = Date.now()) {
  const until = Number(value);
  return until > now && until <= now + hostTierTtl;
}
