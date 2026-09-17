/** Tiny in-memory TTL cache for MIS week computes (speeds Scores UI + master detail). */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export function misCacheGet<T>(key: string): T | null {
  const row = store.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return row.value as T;
}

export function misCacheSet<T>(key: string, value: T, ttlMs = 60_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function misCacheKey(parts: Array<string | number | undefined | null>) {
  return parts.map(part => String(part ?? '')).join('|');
}
