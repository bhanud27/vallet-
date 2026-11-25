/** Same-origin web proxies and Expo LAN addresses share the existing endpoint. */
export function productPreviewOrigin(
  configured: string | undefined,
  development: boolean,
  platform: string,
  hostUri?: string,
  webOrigin?: string,
): string | null {
  if (configured?.trim()) {
    let url: URL;
    try {
      url = new URL(configured.trim());
    } catch {
      throw new Error("The product preview service address is invalid.");
    }
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !["https:", "http:"].includes(url.protocol) ||
      (!development &&
        (url.protocol !== "https:" ||
          !url.hostname.includes(".") ||
          /^[\d.]+$/.test(url.hostname) ||
          /\.(local|internal|localhost|home|lan)\.?$/i.test(url.hostname)))
    )
      throw new Error(
        "The product preview service needs a valid HTTPS address.",
      );
    if (
      development &&
      platform !== "web" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      hostUri
    ) {
      const host = new URL(
        hostUri.includes("://") ? hostUri : `http://${hostUri}`,
      );
      url.hostname = host.hostname;
    }
    return url.origin;
  }
  if (!development) return null;
  if (platform === "web") return webOrigin ?? null;
  if (development && hostUri)
    return new URL(hostUri.includes("://") ? hostUri : `http://${hostUri}`)
      .origin;
  return null;
}
