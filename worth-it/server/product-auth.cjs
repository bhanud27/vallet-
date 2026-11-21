// Verify tokens against the configured project's Auth service; never trust decoded JWT claims alone.
const { createHash } = require("node:crypto");
async function requestIdentity(
  req,
  { env = process.env, fetchAuth = fetch } = {},
) {
  const required =
    env.NODE_ENV === "production" || env.PRODUCT_IMPORT_REQUIRE_AUTH === "true";
  const token = /^Bearer ([A-Za-z0-9._-]{20,8192})$/.exec(
    req.headers.authorization || "",
  )?.[1];
  if (!token) {
    if (required)
      throw Object.assign(new Error("Sign in to fetch product details."), {
        status: 401,
      });
    return req.socket.remoteAddress;
  }
  const origin = env.PRODUCT_AUTH_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.PRODUCT_AUTH_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!origin || !key)
    throw Object.assign(
      new Error("Product previews are temporarily unavailable."),
      { status: 503 },
    );
  const target = new URL("/auth/v1/user", origin);
  if (target.protocol !== "https:" || !target.hostname.endsWith(".supabase.co"))
    throw Object.assign(
      new Error("Product previews are temporarily unavailable."),
      { status: 503 },
    );
  const result = await fetchAuth(target, {
    headers: { apikey: key, Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(4000),
    redirect: "error",
  });
  const user = await result.json().catch(() => null);
  if (!result.ok || !/^[a-f0-9-]{36}$/i.test(user?.id || ""))
    throw Object.assign(new Error("Sign in again to fetch product details."), {
      status: 401,
    });
  // Rate-limit keys never contain bearer tokens or personal profile information.
  return createHash("sha256").update(user.id).digest("hex");
}
module.exports = { requestIdentity };
