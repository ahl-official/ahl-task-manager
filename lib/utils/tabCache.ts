// A bounded, browser-memory cache shared across tab visits, keyed by viewer and filter.
export function createTabCache<T>(ttlMs: number) {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (entry && entry.expiresAt > Date.now()) return entry.value;
      entries.delete(key);
    },
    set(key: string, value: T) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      if (entries.size > 24) entries.delete(entries.keys().next().value!);
    },
    clear() { entries.clear(); },
  };
}
