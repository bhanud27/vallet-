import type { ProductImportCode } from "./productImportTiers";

export const productPhotoSources = [
  { source: "gallery", label: "Gallery" },
  { source: "camera", label: "Camera" },
  { source: "clipboard", label: "Paste image from clipboard" },
] as const;
export type ProductPhotoSource = (typeof productPhotoSources)[number]["source"];

export function productImportFailureView(
  code: ProductImportCode | undefined,
  web: boolean,
) {
  return {
    message: "Couldn't auto-fill this link. Add title, price and photo.",
    hint: web
      ? "For automatic details, open Worth It in the Android app."
      : null,
    photoLabel: "Add photo",
    retryLabel:
      code === "NETWORK_ERROR" || code === "FETCH_TIMEOUT" ? "Try again" : null,
  };
}
