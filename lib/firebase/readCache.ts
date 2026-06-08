type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function clearFirestoreReadCache(prefix?: string) {
  for (const key of Array.from(cache.keys())) {
    if (!prefix || key.startsWith(prefix)) cache.delete(key);
  }
}

export async function cachedFirestoreRead<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = loader().catch(error => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, {
    expiresAt: now + ttlMs,
    promise,
  });
  return promise;
}
