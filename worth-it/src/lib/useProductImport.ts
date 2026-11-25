import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { ProductImportCode } from "./productImportTiers";
import {
  rememberDeviceProductImport,
  startProductImport,
  type ProductPreview,
} from "./productPreview";

export const manualProductMessage =
  "Couldn't load details automatically. Add them below.";

type Attempt = { url: string; key: number };
type Phase = "loading" | "device" | "done" | "failed";

export function useProductImport({
  url,
  enabled,
  attempt,
  resolvedUrl,
  onPreview,
  onManual,
}: {
  url: string | null;
  enabled: boolean;
  attempt?: Attempt;
  resolvedUrl?: string;
  onPreview: (
    preview: ProductPreview,
    source: "server" | "device" | "manual",
    url: string,
  ) => void;
  onManual: (url: string, code: ProductImportCode) => void;
}) {
  const latest = useRef({ resolvedUrl, onPreview, onManual });
  useEffect(() => {
    latest.current = { resolvedUrl, onPreview, onManual };
  });
  const [request, setRequest] = useState<{ url: string; phase: Phase }>();
  const device = useRef<{
    url: string;
    finish: (preview?: ProductPreview, complete?: boolean) => void;
  } | null>(null);
  const key = attempt?.url === url ? attempt?.key : undefined;

  useEffect(() => {
    if (!url || !enabled || (!key && latest.current.resolvedUrl === url))
      return;
    const controller = new AbortController();
    const { signal } = controller;
    const manual = (code: ProductImportCode) => {
      if (signal.aborted) return;
      setRequest({ url, phase: "failed" });
      latest.current.onManual(url, code);
    };
    const timer = setTimeout(
      () => {
        setRequest({ url, phase: "loading" });
        const server = new AbortController();
        const cancel = () => server.abort();
        signal.addEventListener("abort", cancel, { once: true });
        let timeout: ReturnType<typeof setTimeout>;
        const deadline = new Promise<{
          tier: "device" | "manual";
          code: ProductImportCode;
        }>((resolve) => {
          timeout = setTimeout(() => {
            resolve({
              tier: Platform.OS === "web" ? "manual" : "device",
              code: "FETCH_TIMEOUT",
            });
            cancel();
          }, 9500);
        });
        void Promise.race([
          startProductImport(url, server.signal, !!key),
          deadline,
        ])
          .then(
            (result) => {
              if (signal.aborted) return;
              if ("preview" in result && result.preview)
                latest.current.onPreview(
                  result.preview,
                  result.tier === "server" ? "server" : "manual",
                  url,
                );
              if (result.tier === "server") {
                setRequest({ url, phase: "done" });
              } else if (result.tier === "device") {
                device.current = {
                  url,
                  finish: (preview, complete) => {
                    if (signal.aborted || device.current?.url !== url) return;
                    device.current = null;
                    if (preview)
                      latest.current.onPreview(
                        preview,
                        complete ? "device" : "manual",
                        url,
                      );
                    if (!preview || !complete) return manual(result.code);
                    setRequest({ url, phase: "done" });
                    void rememberDeviceProductImport(url);
                  },
                };
                setRequest({ url, phase: "device" });
              } else manual(result.code);
            },
            () => manual("UNKNOWN"),
          )
          .finally(() => {
            clearTimeout(timeout);
            signal.removeEventListener("abort", cancel);
          });
      },
      key ? 0 : 400,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
      device.current = null;
    };
  }, [url, enabled, key]);

  const phase = enabled && request?.url === url ? request?.phase : undefined;
  return {
    phase,
    deviceUrl: phase === "device" ? url : null,
    finishDevice: (preview?: ProductPreview, complete?: boolean) =>
      device.current?.finish(preview, complete),
  };
}
