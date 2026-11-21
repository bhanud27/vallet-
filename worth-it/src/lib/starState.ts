export interface StarState {
  starred: boolean;
  count: number;
}
/** Account-scoped reaction snapshots. Writes serialize and repeated adds coalesce. */
export function createStarState() {
  const rows = new Map<
    string,
    {
      value?: StarState;
      initial?: string;
      listeners: Set<() => void>;
      pending?: Promise<StarState>;
    }
  >();
  const row = (key: string) => {
    let r = rows.get(key);
    if (!r) {
      if (rows.size >= 1000)
        for (const [oldKey, old] of rows) {
          if (!old.pending && !old.listeners.size) {
            rows.delete(oldKey);
            if (rows.size < 800) break;
          }
        }
      r = { listeners: new Set() };
      rows.set(key, r);
    }
    return r;
  };
  const emit = (key: string, value: StarState) => {
    const r = row(key);
    r.value = { starred: value.starred, count: Math.max(0, value.count) };
    r.listeners.forEach((fn) => fn());
    return r.value;
  };
  return {
    get: (key: string) => row(key).value,
    subscribe(key: string, fn: () => void) {
      const r = row(key);
      r.listeners.add(fn);
      return () => {
        r.listeners.delete(fn);
      };
    },
    seed(key: string, value?: StarState) {
      const r = row(key);
      if (!value) return;
      const version = JSON.stringify(value);
      if (r.initial === version) return;
      r.initial = version;
      if (!r.pending) emit(key, value);
    },
    async set(
      key: string,
      desired: boolean,
      persist: (next: boolean) => Promise<StarState>,
    ): Promise<StarState> {
      const r = row(key);
      if (r.pending) {
        await r.pending;
        return this.set(key, desired, persist);
      }
      if (r.value?.starred === desired) return r.value;
      const previous = r.value;
      r.pending = Promise.resolve().then(() => persist(desired));
      if (previous)
        emit(key, {
          starred: desired,
          count: previous.count + Number(desired) - Number(previous.starred),
        });
      try {
        return emit(key, await r.pending);
      } catch (e) {
        if (previous) emit(key, previous);
        else {
          r.value = undefined;
          r.listeners.forEach((fn) => fn());
        }
        throw e;
      } finally {
        r.pending = undefined;
      }
    },
  };
}
export const contentStars = createStarState();
