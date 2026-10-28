/** In-memory TTL cache for MIS week computes (speeds Scores UI + master detail) with last-known fallback */

type Entry<T> = { value: T; expiresAt: number; lastKnownValue?: T };

const store = new Map<string, Entry<unknown>>();

export function clearMisCache() {
  for (const entry of Array.from(store.values())) {
    entry.expiresAt = 0; // force fresh compute on next request, but preserve lastKnownValue for fallback if DB read fails!
  }
}

export function misCacheGet<T>(key: string): T | null {
  const row = store.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    return null;
  }
  return (row.value ?? row.lastKnownValue) as T;
}

export function misCacheGetLastKnown<T>(key: string): T | null {
  const row = store.get(key);
  if (!row) return null;
  return (row.lastKnownValue ?? row.value) as T | null;
}

export function misCacheSet<T>(key: string, value: T, ttlMs = 60 * 60 * 1000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs, lastKnownValue: value });
}

export function misCacheKey(parts: Array<string | number | undefined | null>) {
  return parts.map(part => String(part ?? '')).join('|');
}
