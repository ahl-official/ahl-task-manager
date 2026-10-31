type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
  value?: T;
  lastKnownValue?: T;
};

const cache = new Map<string, CacheEntry<any>>();

export const LONG_READ_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (long cache; manual rescan via Global Refresh Button)

export function clearFirestoreReadCache(prefix?: string) {
  for (const key of Array.from(cache.keys())) {
    if (!prefix || key.startsWith(prefix)) {
      const entry = cache.get(key);
      if (entry) {
        // Expire the timer so the next read triggers a fresh fetch,
        // but preserve lastKnownValue so if read limits are hit, we still serve the cached data!
        entry.expiresAt = 0;
        if (entry.value !== undefined) {
          entry.lastKnownValue = entry.value;
        }
      }
    }
  }
}

export async function cachedFirestoreRead<T>(
  key: string,
  ttlMs: number = LONG_READ_CACHE_TTL_MS,
  loader: () => Promise<T>,
  emptyFallback?: T,
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.promise;

  const fallbackValue = cached?.value !== undefined ? cached.value : cached?.lastKnownValue;

  const promise = loader()
    .then(val => {
      const entry = cache.get(key);
      if (entry) {
        entry.value = val;
        entry.lastKnownValue = val;
      }
      return val;
    })
    .catch(error => {
      // If read limit hits or database read fails, KEEP SHOWING CACHED VALUE!
      if (fallbackValue !== undefined) {
        console.warn(
          `[Read Limit Hit / Failover] Database read for "${key}" failed, continuing to serve cached data:`,
          error?.message || error
        );
        const entry = cache.get(key);
        if (entry) {
          entry.expiresAt = Date.now() + ttlMs;
          entry.value = fallbackValue;
          entry.lastKnownValue = fallbackValue;
          entry.promise = Promise.resolve(fallbackValue);
        }
        return fallbackValue;
      }
      // No cached value in THIS instance's memory (e.g. a cold start right after deploy).
      // Degrade to a safe empty value instead of throwing and crashing the page, when the
      // caller has given us one to use.
      if (emptyFallback !== undefined) {
        console.warn(
          `[Read Limit Hit / No Cache] Database read for "${key}" failed with nothing cached yet, returning empty fallback:`,
          error?.message || error
        );
        cache.delete(key);
        return emptyFallback;
      }
      cache.delete(key);
      throw error;
    });

  cache.set(key, {
    expiresAt: now + ttlMs,
    promise,
    value: fallbackValue,
    lastKnownValue: fallbackValue,
  });
  return promise;
}

/** Update a single task in-place across all cached task lists without refetching from the DB */
export function updateTaskInReadCache(taskId: string, patch: Record<string, any>) {
  if (!taskId) return;
  for (const [key, entry] of Array.from(cache.entries())) {
    if (!key.startsWith('tasks:')) continue;

    if (Array.isArray(entry.value)) {
      const list = entry.value as any[];
      const idx = list.findIndex(item => item && (item.taskId === taskId || item.id === taskId));
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          ...patch,
          updatedAt: patch.updatedAt || new Date().toISOString(),
        };
        entry.promise = Promise.resolve(list);
      }
    }

    if (entry.value && typeof entry.value === 'object' && 'total' in entry.value && patch.status && patch.oldStatus && patch.status !== patch.oldStatus) {
      const counts = entry.value as any;
      const statusMap: Record<string, string> = {
        'Pending Accept': 'pending',
        'In Progress': 'inProgress',
        'Delay Requested': 'delayRequested',
        'Overdue': 'overdue',
        'Completed': 'completed',
        'Verified': 'verified',
        'Dead': 'dead',
      };
      const oldField = statusMap[patch.oldStatus];
      const newField = statusMap[patch.status];
      if (oldField && typeof counts[oldField] === 'number') {
        counts[oldField] = Math.max(0, counts[oldField] - 1);
      }
      if (newField && typeof counts[newField] === 'number') {
        counts[newField] = counts[newField] + 1;
      }
      entry.promise = Promise.resolve(counts);
    }
  }
}

/** Prepend a newly created task in-place into cached task lists without refetching from the DB */
export function addTaskToReadCache(task: any) {
  if (!task || !task.taskId) return;
  for (const [key, entry] of Array.from(cache.entries())) {
    if (!key.startsWith('tasks:')) continue;

    if (Array.isArray(entry.value)) {
      const list = entry.value as any[];
      const exists = list.some(item => item && (item.taskId === task.taskId || item.id === task.taskId));
      if (!exists) {
        const matchesScope =
          key.includes('tasks:all') ||
          (task.assignedTo && key.includes(task.assignedTo)) ||
          (task.handoffUid && key.includes(task.handoffUid));
        if (matchesScope) {
          list.unshift(task);
          if (list.length > 100) list.pop();
          entry.promise = Promise.resolve(list);
        }
      }
    }

    if (entry.value && typeof entry.value === 'object' && 'total' in entry.value) {
      const counts = entry.value as any;
      counts.total = (counts.total || 0) + 1;
      const statusMap: Record<string, string> = {
        'Pending Accept': 'pending',
        'In Progress': 'inProgress',
        'Delay Requested': 'delayRequested',
        'Overdue': 'overdue',
        'Completed': 'completed',
        'Verified': 'verified',
        'Dead': 'dead',
      };
      const field = statusMap[task.status] || 'pending';
      if (typeof counts[field] === 'number') counts[field] += 1;
      entry.promise = Promise.resolve(counts);
    }
  }
}

/** Remove a deleted task from in-memory cached lists without refetching from the DB */
export function removeTaskFromReadCache(taskId: string) {
  if (!taskId) return;
  for (const [key, entry] of Array.from(cache.entries())) {
    if (!key.startsWith('tasks:')) continue;

    if (Array.isArray(entry.value)) {
      const list = entry.value as any[];
      const filtered = list.filter(item => item && item.taskId !== taskId && item.id !== taskId);
      if (filtered.length !== list.length) {
        entry.value = filtered;
        entry.promise = Promise.resolve(filtered);
      }
    }

    if (entry.value && typeof entry.value === 'object' && 'total' in entry.value) {
      const counts = entry.value as any;
      counts.total = Math.max(0, (counts.total || 0) - 1);
      entry.promise = Promise.resolve(counts);
    }
  }
}
