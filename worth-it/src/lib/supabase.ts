import { authStorage } from "./authStorage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { config } from "./config";

// supabase-js expects a full URL implementation on React Native; browsers already have one.
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (Platform.OS !== "web") require("react-native-url-polyfill/auto");

export const supabase = config.hasSupabase
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    })
  : null;

if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
