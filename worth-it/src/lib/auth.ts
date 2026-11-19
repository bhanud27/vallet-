import type { User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { config } from './config';
import { supabase } from './supabase';
import type { Session } from './types';
import { USERNAME_TAKEN } from './username';

export function appSession(user: User): Session {
  return {
    userId: user.id,
    isGuest: !!user.is_anonymous,
    email: user.email ?? null,
    needsPassword: !!user.email_confirmed_at && user.user_metadata.worthit_guest_setup === true,
  };
}

function client() {
  if (!supabase) throw new Error('Connect Supabase before creating or signing in to an account.');
  return supabase.auth;
}

function confirmationUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/auth-confirm`;
  if (config.webUrl) return `${config.webUrl}/auth-confirm`;
  return Linking.createURL('auth-confirm');
}

export async function signIn(email: string, password: string) {
  const { data, error } = await client().signInWithPassword({ email, password });
  if (error) throw error;
  return appSession(data.user);
}

async function requireAvailableUsername(username: string) {
  if (!supabase) throw new Error('Connect Supabase before choosing a username.');
  const { data, error } = await supabase.rpc('worthit_username_available', { p_username: username });
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Username setup is pending on the server. Please try again later.');
    throw new Error(error.message);
  }
  if (!data) throw new Error(USERNAME_TAKEN);
}

async function handleUsernameAuthError(username: string, error: Error): Promise<never> {
  // Supabase Auth can hide a trigger failure behind a generic database error.
  if (/database error|already taken/i.test(error.message)) await requireAvailableUsername(username);
  throw error;
}

export async function signUp(username: string, email: string, password: string) {
  await requireAvailableUsername(username);
  const { data, error } = await client().signUp({ email, password, options: {
    emailRedirectTo: confirmationUrl(), data: { worthit_username: username },
  } });
  if (error) return handleUsernameAuthError(username, error);
  return data.session && data.user ? appSession(data.user) : null;
}

export async function startGuestUpgrade(username: string, email: string) {
  await requireAvailableUsername(username);
  const { data, error } = await client().updateUser({ email, data: {
    worthit_username: username, worthit_guest_setup: true,
  } }, { emailRedirectTo: confirmationUrl() });
  if (error) return handleUsernameAuthError(username, error);
  return appSession(data.user);
}

export async function checkGuestVerification() {
  const { data, error } = await client().refreshSession();
  if (error) throw error;
  return data.user ? appSession(data.user) : null;
}

export async function finishGuestUpgrade(password: string) {
  const auth = client();
  const { data: verified, error: checkError } = await auth.getUser();
  if (checkError) throw checkError;
  if (!verified.user || !appSession(verified.user).needsPassword) throw new Error('Verify your email before choosing a password.');
  const { data, error } = await auth.updateUser({ password, data: { worthit_guest_setup: false } });
  if (error) throw error;
  return appSession(data.user);
}

export async function confirmAccount(callback: string) {
  const url = new URL(callback);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const param = (name: string) => url.searchParams.get(name) ?? fragment.get(name);
  if (param('error') || param('error_code')) throw new Error('This confirmation link is invalid or expired.');
  const auth = client();
  const code = param('code');
  const access_token = param('access_token');
  const refresh_token = param('refresh_token');
  const token_hash = param('token_hash');
  const type = param('type');
  let result;
  if (code) result = await auth.exchangeCodeForSession(code);
  else if (access_token && refresh_token && (type === 'signup' || type === 'email_change' || type === 'email' || !type)) {
    result = await auth.setSession({ access_token, refresh_token });
  } else if (token_hash && (type === 'signup' || type === 'email_change' || type === 'email')) {
    result = await auth.verifyOtp({ token_hash, type });
  } else {
    throw new Error('Open the confirmation link from your email to finish.');
  }
  if (result.error) throw result.error;
  if (!result.data.user) throw new Error('Could not confirm the account. Try signing in.');
  return appSession(result.data.user);
}
