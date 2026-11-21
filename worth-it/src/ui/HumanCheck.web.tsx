import React, { useEffect, useRef } from "react";
import { useTheme } from "./theme";
export function HumanCheck({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const { mode } = useTheme();
  const key = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
    frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === "worthit-captcha" &&
        typeof event.data.token === "string"
      )
        onToken(event.data.token);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onToken]);
  if (!key) return null;
  return (
    <iframe
      ref={frame}
      key={resetKey + mode}
      title="Verify you are human"
      src={
        "/captcha.html?sitekey=" +
        encodeURIComponent(key) +
        "&attempt=" +
        resetKey +
        "&theme=" +
        mode
      }
      onLoad={() => onToken("")}
      style={{ height: 160, width: "100%", border: 0 }}
    />
  );
}
