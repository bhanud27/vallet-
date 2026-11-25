import {
  router,
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
} from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import { Alert, AppState } from "react-native";
import { readAndroidProductShare } from "../lib/readAndroidProductShare";
import { productShareInbox } from "../lib/incomingProductShare";

export function IncomingProductShare({ canCreate }: { canCreate: boolean }) {
  const stack = useRootNavigationState();
  const pathname = usePathname();
  const { sharedProductUrl, sharedProductTitle } = useGlobalSearchParams<{
    sharedProductUrl?: string;
    sharedProductTitle?: string;
  }>();
  const pending = useSyncExternalStore(
    productShareInbox.subscribe,
    productShareInbox.getSnapshot,
  );

  useEffect(() => {
    // Covers delivery before the dev client or linking listener has finished starting.
    const receive = () => void readAndroidProductShare().catch(() => undefined);
    receive();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") receive();
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (!stack?.key || !pending || (pending.url && !canCreate)) return;
    if (!productShareInbox.take(pending)) return;
    if (!pending.url) {
      Alert.alert(
        "No product link found",
        "Share a product page or paste its link in Create.",
      );
      return;
    }

    const params = { sharedProductUrl: pending.url, sharedProductTitle: pending.titleHint ?? "" };
    if (pathname === "/add") {
      if (sharedProductUrl !== pending.url || sharedProductTitle !== params.sharedProductTitle)
        router.setParams(params);
    } else {
      router.navigate({ pathname: "/add", params });
    }
  }, [canCreate, stack?.key, pending, pathname, sharedProductUrl, sharedProductTitle]);

  return null;
}
