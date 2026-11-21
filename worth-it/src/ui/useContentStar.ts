import { useCallback, useEffect, useSyncExternalStore } from "react";
import { contentStars, type StarState } from "../lib/starState";
import { repo } from "../lib/repo";
import { socialRepo } from "../lib/socialRepo";
import { feedCache } from "../lib/feed";
import { useAuth } from "./AppContext";
export function useContentStar(
  kind: "poll" | "reel",
  id: string,
  initial?: StarState,
) {
  const { session } = useAuth(),
    key = (session?.userId ?? "visitor") + ":" + kind + ":" + id;
  const subscribe = useCallback(
    (fn: () => void) => contentStars.subscribe(key, fn),
    [key],
  );
  const snapshot = useCallback(() => contentStars.get(key), [key]);
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const starred = initial?.starred,
    count = initial?.count;
  useEffect(() => {
    if (starred !== undefined && count !== undefined)
      contentStars.seed(key, { starred, count });
  }, [key, starred, count]);
  const set = useCallback(
    async (next: boolean) => {
      if (!session) throw new Error("Sign in to add a Star.");
      await contentStars.set(key, next, async (desired) => {
        if (kind === "poll") {
          const result = await repo.setPollStar(id, desired);
          feedCache.clear();
          return { starred: result.starred, count: result.stars };
        }
        const result = await socialRepo.setStar(session.userId, id, desired);
        feedCache.clear();
        return result;
      });
    },
    [key, kind, id, session],
  );
  return { value: value ?? initial ?? { starred: false, count: 0 }, set };
}
