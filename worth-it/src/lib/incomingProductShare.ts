import { detectProductImportUrl, detectProductUrl, LIMITS } from "./validation";

const MAX_SHARED_TEXT = 32 * 1024;

type SharePayload = { shareType?: string; value?: string };

export function readSharedProduct(payloads: readonly SharePayload[]) {
  for (const { shareType, value } of payloads) {
    if (
      (shareType != null && shareType !== "text" && shareType !== "url") ||
      typeof value !== "string" ||
      value.length > MAX_SHARED_TEXT
    )
      continue;
    const text = value.trim();
    if (!/\s/.test(text)) {
      const direct = detectProductImportUrl(text);
      if (direct) return { url: direct };
    }
    for (const match of text.matchAll(
      /(?:^|[\s<([{\u201c\u2018"'=])((?:https?:\/\/|www\.)[^\s<>"'\u201c\u201d\u2018\u2019]+)/gi,
    )) {
      const url = detectProductImportUrl(match[1].replace(/[.,!?;:)\]}]+$/g, ""));
      if (url) {
        const index = match.index + match[0].indexOf(match[1]);
        const titleHint = [text.slice(0, index), text.slice(index + match[1].length)]
          .flatMap((part) => part.split(/\r?\n/))
          .map((line) => line.trim().replace(/^[\s()[\]{}:!?.,—–"'“”]+|[\s()[\]{}:!?.,—–"'“”]+$/gu, ""))
          .find((line) => line && /\p{L}/u.test(line) && !/https?:\/\/|www\.|^(?:check this out|look at this|found this|would you|buy now|shop now|take a look)\b/i.test(line));
        return { url, titleHint: titleHint?.slice(0, LIMITS.itemName) };
      }
    }
  }
  return null;
}

export function sharedProductUrl(payloads: readonly SharePayload[]): string | null {
  const share = readSharedProduct(payloads);
  return share ? detectProductUrl(share.url) : null;
}

export function isAndroidSharePath(path: string) {
  return (
    path === "worthit://expo-sharing" || path === "worthit://expo-sharing/"
  );
}

type IncomingProductShare = { url: string | null; titleHint?: string };

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
      const share: IncomingProductShare = readSharedProduct(payloads) ?? { url: null };
      if (pending?.url === share.url && pending?.titleHint === share.titleHint) return;
      pending = share;
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
