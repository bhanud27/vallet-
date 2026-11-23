import type { SupabaseClient } from "@supabase/supabase-js";

type Auth = Pick<
  SupabaseClient["auth"],
  "exchangeCodeForSession" | "verifyOtp" | "setSession"
>;

export async function verifyAccountCallback(auth: Auth, callback: string) {
  const url = new URL(callback);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const param = (name: string) =>
    url.searchParams.get(name) ?? fragment.get(name);
  if (param("error") || param("error_code"))
    throw new Error("This email link is invalid or expired.");

  const code = param("code");
  const flowId = param("sb_flow_id");
  const access_token = param("access_token");
  const refresh_token = param("refresh_token");
  const token_hash = param("token_hash");
  const type = param("type");
  let result;
  if (code) {
    result = await auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
  } else if (
    token_hash &&
    (type === "signup" ||
      type === "email_change" ||
      type === "email" ||
      type === "recovery")
  ) {
    result = await auth.verifyOtp({ token_hash, type });
  } else if (
    access_token &&
    refresh_token &&
    (type === "signup" || type === "email_change" || type === "email" || !type)
  ) {
    result = await auth.setSession({ access_token, refresh_token });
  } else {
    throw new Error("Open the link from your email to continue.");
  }
  if (result.error)
    throw new Error(
      "Could not verify this email link. Request a fresh link and open it on the device and app or browser where you requested it.",
    );
  if (!result.data.user || !result.data.session)
    throw new Error(
      "This email link did not create a session. Request a fresh link.",
    );

  return {
    user: result.data.user,
    recovery: code
      ? "redirectType" in result.data && result.data.redirectType === "recovery"
      : !!token_hash && type === "recovery",
  };
}
