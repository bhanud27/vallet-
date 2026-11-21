type Entry<T> = { value: T; expires: number };
export function createQueryCache<T>(limit = 50, now = () => Date.now()) {
  const entries = new Map<string, Entry<T>>();
  return {
    get(key: string) {
      const entry = entries.get(key);
      if (!entry || entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T, ttl = 30000) {
      entries.delete(key);
      entries.set(key, { value, expires: now() + ttl });
      while (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    clear() {
      entries.clear();
    },
  };
}
