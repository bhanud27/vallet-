import type { SupabaseClient } from "@supabase/supabase-js";
export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
export function validateNewPassword(value: string, confirm: string) {
  if (value.length < 10 || value.length > 128)
    throw new Error("Choose a password with 10 to 128 characters.");
  if (value !== confirm) throw new Error("The passwords do not match.");
}
export function accountSecurity(
  auth: SupabaseClient["auth"],
  redirect: string,
) {
  async function current() {
    const { data, error } = await auth.getUser();
    if (error || !data.user || data.user.is_anonymous)
      throw new Error("Sign in to a registered account to manage security.");
    return data.user;
  }
  async function reauthenticate(password: string, otp?: string) {
    const user = await current();
    if (!user.email || !password)
      throw new Error("Enter your current password.");
    const { data, error } = await auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (error)
      throw new Error(
        "Could not verify your password. Check it and try again.",
      );
    if (data.user.id !== user.id) {
      await auth.signOut({ scope: "local" });
      throw new Error("Your account changed. Sign in again.");
    }
    const assurance = await auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error)
      throw new Error("Could not verify account security. Try again.");
    if (
      assurance.data.nextLevel === "aal2" &&
      assurance.data.currentLevel !== "aal2"
    ) {
      if (!otp) throw new Error("Enter the six-digit authenticator code.");
      const { data: factors, error: failure } = await auth.mfa.listFactors();
      if (failure) throw new Error("Could not check your authenticator.");
      const factor = factors.totp.find((item) => item.status === "verified");
      if (!factor)
        throw new Error(
          "Use your configured authentication provider to verify this account.",
        );
      const verified = await auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: otp.trim(),
      });
      if (verified.error)
        throw new Error("The authenticator code is invalid or expired.");
    }
    return user;
  }
  return {
    current,
    reauthenticate,
    async changePassword(
      currentPassword: string,
      next: string,
      confirmation: string,
      otp?: string,
    ) {
      validateNewPassword(next, confirmation);
      await reauthenticate(currentPassword, otp);
      const { error } = await auth.updateUser({ password: next });
      if (error)
        throw new Error(
          "Could not update the password. Your provider may require an additional verification.",
        );
    },
    async changeEmail(email: string, password: string, otp?: string) {
      if (!validEmail(email.trim()))
        throw new Error("Enter a valid email address.");
      await reauthenticate(password, otp);
      const { error } = await auth.updateUser(
        { email: email.trim() },
        { emailRedirectTo: redirect },
      );
      if (error)
        throw new Error("Could not request the email change. Try again.");
    },
    async reset(email: string) {
      if (!validEmail(email.trim()))
        throw new Error("Enter a valid email address.");
      const { error } = await auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirect,
      });
      if (error)
        throw new Error("Could not send a reset link. Try again later.");
    },
    async signOut(all = false) {
      const { error } = await auth.signOut({ scope: all ? "global" : "local" });
      if (error)
        throw new Error(
          "Could not sign out. Check your connection and try again.",
        );
    },
  };
}
