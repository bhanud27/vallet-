import { detectProductUrl } from "./validation";

const MAX_SHARED_TEXT = 32 * 1024;

type SharePayload = { shareType?: string; value?: string };

export function sharedProductUrl(
  payloads: readonly SharePayload[],
): string | null {
  for (const { shareType, value } of payloads) {
    if (
      (shareType != null && shareType !== "text" && shareType !== "url") ||
      typeof value !== "string" ||
      value.length > MAX_SHARED_TEXT
    )
      continue;
    const text = value.trim();
    if (!/\s/.test(text)) {
      const direct = detectProductUrl(text);
      if (direct) return direct;
    }
    for (const [, candidate] of text.matchAll(
      /(?:^|[\s<([{\u201c\u2018"'=])((?:https?:\/\/|www\.)[^\s<>"'\u201c\u201d\u2018\u2019]+)/gi,
    )) {
      const url = detectProductUrl(candidate.replace(/[.,!?;:)\]}]+$/g, ""));
      if (url) return url;
    }
  }
  return null;
}

export function isAndroidSharePath(path: string) {
  return (
    path === "worthit://expo-sharing" || path === "worthit://expo-sharing/"
  );
}

type IncomingProductShare = { url: string | null };

export function createProductShareInbox() {
  let pending: IncomingProductShare | null = null;
  let holds = 0;
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => (holds ? null : pending),
    hold() {
      holds++;
      notify();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        holds--;
        notify();
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    receive(payloads: readonly SharePayload[]) {
      // Expo Router can receive the same intent again after its native data is cleared.
      if (!payloads.length) return;
      const url = sharedProductUrl(payloads);
      if (pending?.url === url) return;
      pending = { url };
      notify();
    },
    take(share: IncomingProductShare) {
      if (holds || pending !== share) return false;
      pending = null;
      notify();
      return true;
    },
  };
}

export const productShareInbox = createProductShareInbox();
