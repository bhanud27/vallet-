import React, { useEffect } from "react";
import * as Linking from "expo-linking";
import { usePathname } from "expo-router";
import { config } from "../lib/config";
import { Banner, Button } from "./kit";
import { useTheme } from "./theme";
export function HumanCheck({
  onToken,
}: {
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const { mode } = useTheme();
  const key = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
    url = Linking.useURL(),
    path = usePathname();
  const target =
    path === "/login"
      ? "login"
      : path === "/signup"
        ? "signup"
        : "verify-human";
  useEffect(() => {
    if (!url?.startsWith("worthit://" + target + "#")) return;
    const token = new URLSearchParams(url.split("#")[1]).get("token");
    if (token) onToken(token);
  }, [url, onToken, target]);
  if (!key) return null;
  if (!config.webUrl.startsWith("https://"))
    return (
      <Banner kind="error">
        Configure the hosted HTTPS challenge URL before using native CAPTCHA.
      </Banner>
    );
  return (
    <Button
      label="Verify you are human"
      onPress={() => {
        void Linking.openURL(
          config.webUrl +
            "/captcha.html?native=1&return=" +
            target +
            "&sitekey=" +
            encodeURIComponent(key) +
            "&theme=" +
            mode,
        );
      }}
    />
  );
}
