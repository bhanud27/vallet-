import { supabase } from "./supabase";
import { optionalRpc } from "./backendRpc";
import { accountSecurity } from "./accountSecurity";
import { confirmationUrl, clearRecovery } from "./auth";
import { safetyRpc } from "./safety";
import { feedCache } from "./feed";
import { clearMediaUrlCache } from "./storageUrls";
import { resetActivePreferences } from "./preferences";
export type AccountState = {
  available: boolean;
  deactivated: boolean;
  deletion_pending: boolean;
  mfa_enforced: boolean;
  mfaRequired: boolean;
};
export const emptyAccountState: AccountState = {
  available: false,
  deactivated: false,
  deletion_pending: false,
  mfa_enforced: false,
  mfaRequired: false,
};
export async function accountState(): Promise<AccountState> {
  if (!supabase) return emptyAccountState;
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error) throw new Error("Could not verify account security.");
  const result = await optionalRpc<Partial<AccountState>>(
    supabase,
    "worthit_account_state",
  );
  return {
    ...emptyAccountState,
    ...(result.available ? result.data : {}),
    mfaRequired:
      assurance.data.nextLevel === "aal2" &&
      assurance.data.currentLevel !== "aal2",
  };
}
export async function verifySensitiveAction(password: string, otp: string) {
  if (!supabase) throw new Error("A connected account is required.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in again.");
  if (!data.user.is_anonymous)
    await accountSecurity(supabase.auth, confirmationUrl()).reauthenticate(
      password,
      otp,
    );
}
export async function accountAction(
  action: "deactivate" | "reactivate" | "delete",
  password: string,
  otp: string,
) {
  await verifySensitiveAction(password, otp);
  await safetyRpc(
    action === "delete" ? "request_account_deletion" : "worthit_deactivate",
    action === "delete" ? undefined : { p_deactivate: action === "deactivate" },
  );
  feedCache.clear();
  clearMediaUrlCache();
}
export async function logout() {
  if (!supabase)
    throw new Error("Local demo mode has no signed-in server session.");
  await accountSecurity(supabase.auth, confirmationUrl()).signOut();
  feedCache.clear();
  clearMediaUrlCache();
  clearRecovery();
  resetActivePreferences();
}
