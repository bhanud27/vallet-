import type { User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

import { validateNewPassword } from "./accountSecurity";
import { verifyAccountCallback } from "./authCallback";
import { supabase } from "./supabase";
import type { Session } from "./types";
import { USERNAME_TAKEN } from "./username";

export function appSession(user: User): Session {
  return {
    userId: user.id,
    isGuest: !!user.is_anonymous,
    email: user.email ?? null,
    needsPassword:
      !!user.email_confirmed_at &&
      user.user_metadata.worthit_guest_setup === true,
  };
}

let recoveryUserId: string | null = null;

export function recoveryAllowed(userId?: string | null) {
  return !!userId && recoveryUserId === userId;
}

export function clearRecovery() {
  recoveryUserId = null;
}

function client() {
  if (!supabase)
    throw new Error(
      "Connect Supabase before creating or signing in to an account.",
    );
  return supabase.auth;
}

export function confirmationUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined")
    return `${window.location.origin}/auth-confirm`;
  // PKCE verification must return to the app that holds its verifier.
  return Linking.createURL("auth-confirm");
}

export function passwordRecoveryUrl() {
  const callback = confirmationUrl();
  if (Platform.OS === "web") return callback;
  if (/^exps?:/i.test(callback))
    throw new Error(
      "For password reset, open Worth It in the Android development app or a web browser and request a new link there.",
    );
  return "worthit://auth-confirm";
}

export async function signIn(
  email: string,
  password: string,
  captchaToken?: string,
) {
  const { data, error } = await client().signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });
  if (error) throw error;
  clearRecovery();
  return appSession(data.user);
}

async function requireAvailableUsername(username: string) {
  if (!supabase)
    throw new Error("Connect Supabase before choosing a username.");
  const { data, error } = await supabase.rpc("worthit_username_available", {
    p_username: username,
  });
  if (error) {
    if (error.code === "PGRST202")
      throw new Error(
        "Username setup is pending on the server. Please try again later.",
      );
    throw new Error(error.message);
  }
  if (!data) throw new Error(USERNAME_TAKEN);
}

async function handleUsernameAuthError(
  username: string,
  error: Error,
): Promise<never> {
  // Supabase Auth can hide a trigger failure behind a generic database error.
  if (/database error|already taken/i.test(error.message))
    await requireAvailableUsername(username);
  throw error;
}

export async function signUp(
  username: string,
  email: string,
  password: string,
  captchaToken?: string,
) {
  await requireAvailableUsername(username);
  const { data, error } = await client().signUp({
    email,
    password,
    options: {
      captchaToken,
      emailRedirectTo: confirmationUrl(),
      data: { worthit_username: username },
    },
  });
  if (error) return handleUsernameAuthError(username, error);
  return data.session && data.user ? appSession(data.user) : null;
}

export async function startGuestUpgrade(username: string, email: string) {
  await requireAvailableUsername(username);
  const { data, error } = await client().updateUser(
    {
      email,
      data: {
        worthit_username: username,
        worthit_guest_setup: true,
      },
    },
    { emailRedirectTo: confirmationUrl() },
  );
  if (error) return handleUsernameAuthError(username, error);
  return appSession(data.user);
}

export async function checkGuestVerification() {
  const { data, error } = await client().refreshSession();
  if (error) throw error;
  return data.user ? appSession(data.user) : null;
}

export async function finishGuestUpgrade(
  password: string,
  captchaToken?: string,
) {
  const auth = client();
  const { data: verified, error: checkError } = await auth.getUser();
  if (checkError) throw checkError;
  if (!verified.user || !appSession(verified.user).needsPassword)
    throw new Error("Verify your email before choosing a password.");
  const { data, error } = await auth.updateUser({
    password,
    data: { worthit_guest_setup: false },
  });
  if (error) throw error;
  return appSession(data.user);
}

export async function confirmAccount(callback: string) {
  const { user, recovery } = await verifyAccountCallback(client(), callback);
  recoveryUserId = recovery && !user.is_anonymous ? user.id : null;
  return { session: appSession(user), recovery: recoveryAllowed(user.id) };
}

export async function saveRecoveredPassword(password: string, confirm: string) {
  validateNewPassword(password, confirm);
  const auth = client();
  const { data, error } = await auth.getUser();
  if (error || !data.user || !recoveryAllowed(data.user.id))
    throw new Error(
      "Your recovery session expired. Request a fresh reset email.",
    );
  const result = await auth.updateUser({ password });
  if (result.error)
    throw new Error(
      "Could not update your password. Try again or request a fresh reset email.",
    );
  clearRecovery();
}
