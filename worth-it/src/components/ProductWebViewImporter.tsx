import metadataScript from "../../shared/product-metadata.cjs";
import readerScript from "../../shared/product-webview-reader.cjs";
import { useEffect, useRef } from "react";
import { AppState, Modal, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  hasAutomaticProductDetails,
  type ProductPreview,
} from "../lib/productPreview";
import { detectProductImportUrl } from "../lib/validation";
import { Button } from "../ui/kit";
import { useTheme } from "../ui/theme";

export function ProductWebViewImporter({
  url,
  onFinish,
}: {
  url: string;
  onFinish: (preview?: ProductPreview, complete?: boolean) => void;
}) {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const web = useRef<WebView<unknown>>(null);
  const callback = useRef(onFinish);
  const token = useRef("");
  const closed = useRef(false);
  const loaded = useRef(false);
  const beingTouched = useRef(false);
  const lastTouch = useRef(0);
  const currentUrl = useRef(url);
  const partial = useRef<ProductPreview>(undefined);
  useEffect(() => {
    callback.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    token.current = randomUUID();
    const script = `(${readerScript})((${metadataScript}),${JSON.stringify(token.current)}); true;`;
    let elapsed = 0;
    let loadingTime = 0;
    let previous = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const delta = Math.min(now - previous, 750);
      previous = now;
      if (
        closed.current ||
        AppState.currentState !== "active" ||
        (beingTouched.current && now - lastTouch.current < 5000) ||
        now - lastTouch.current < 1000
      )
        return;
      if (loaded.current) {
        elapsed += delta;
        web.current?.injectJavaScript(script);
      } else loadingTime += delta;
      if (elapsed >= 12000 || loadingTime >= 12000) {
        closed.current = true;
        callback.current(partial.current, false);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const finish = (preview = partial.current, complete = false) => {
    if (closed.current) return;
    closed.current = true;
    callback.current(preview, complete);
  };
  const endTouch = () => {
    beingTouched.current = false;
    lastTouch.current = Date.now();
  };

  return (
    <Modal visible onRequestClose={() => finish()}>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: colors.surface,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          <Text style={[type.body, { flex: 1 }]} accessibilityRole="header">
            Loading product details from your device...
          </Text>
          <Button label="Cancel" variant="quiet" onPress={() => finish()} />
        </View>
        <View
          style={{ flex: 1 }}
          onTouchStart={() => {
            beingTouched.current = true;
            lastTouch.current = Date.now();
          }}
          onTouchMove={() => {
            lastTouch.current = Date.now();
          }}
          onTouchEnd={endTouch}
          onTouchCancel={endTouch}
        >
          <WebView<unknown>
            ref={web}
            source={{ uri: url }}
            originWhitelist={["*"]}
            incognito
            sharedCookiesEnabled={false}
            thirdPartyCookiesEnabled={false}
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={({ url: target, isTopFrame }) =>
              /^https?:\/\//i.test(target) &&
              (isTopFrame === false || !!detectProductImportUrl(target))
            }
            onLoadStart={({ nativeEvent }) => {
              if (nativeEvent.url !== currentUrl.current)
                partial.current = undefined;
              currentUrl.current = nativeEvent.url;
              loaded.current = false;
            }}
            onLoadEnd={({ nativeEvent }) => {
              currentUrl.current = nativeEvent.url;
              loaded.current = true;
            }}
            onNavigationStateChange={(event) => {
              if (event.url !== currentUrl.current) partial.current = undefined;
              currentUrl.current = event.url;
            }}
            onError={() => finish()}
            onRenderProcessGone={() => finish()}
            onContentProcessDidTerminate={() => finish()}
            onMessage={({ nativeEvent }) => {
              if (
                closed.current ||
                !token.current ||
                nativeEvent.data.length > 12000 ||
                AppState.currentState !== "active"
              )
                return;
              try {
                const message = JSON.parse(nativeEvent.data);
                const url =
                  typeof message.url === "string" &&
                  detectProductImportUrl(message.url);
                if (
                  message.nonce !== token.current ||
                  !url ||
                  url !== detectProductImportUrl(currentUrl.current)
                )
                  return;
                const item = message.metadata;
                const text = (value: unknown, limit: number) =>
                  typeof value === "string" ? value.trim().slice(0, limit) : "";
                const image =
                  typeof item.imageUrl === "string" &&
                  /^https:\/\//i.test(item.imageUrl) &&
                  detectProductImportUrl(item.imageUrl);
                const preview: ProductPreview = {
                  name: text(item.title, 80),
                  price:
                    typeof item.price === "number" &&
                    item.price > 0 &&
                    item.price <= 10000000
                      ? item.price
                      : null,
                  currency: /^[A-Z]{3}$/.test(item.currency)
                    ? item.currency
                    : "INR",
                  brand: text(item.brand, 120),
                  description: text(item.description, 2000),
                  category: text(item.category, 160),
                  productUrl: url,
                  platform: new URL(url).hostname,
                  imageUrl: image || undefined,
                  images: [],
                };
                if (preview.name || preview.price || preview.imageUrl)
                  partial.current = preview;
                if (hasAutomaticProductDetails(preview)) finish(preview, true);
              } catch {
                /* Ignore messages outside the extractor protocol. */
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
