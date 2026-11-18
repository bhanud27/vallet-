const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

export const config = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** Connected mode needs both values. Otherwise the app runs in local demo mode. */
  hasSupabase: /^https?:\/\//.test(url) && anonKey.length > 20,
  /** Public https URL where the web build is hosted. Used to build share links on native. */
  webUrl: (process.env.EXPO_PUBLIC_WEB_URL?.trim() ?? '').replace(/\/+$/, ''),
};
