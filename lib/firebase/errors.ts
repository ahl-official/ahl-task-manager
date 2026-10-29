export function isFirestoreQuotaError(error: unknown) {
  const err = error as { code?: unknown; details?: unknown; message?: unknown; status?: unknown; statusText?: unknown };
  const text = `${err?.code ?? ''} ${err?.details ?? ''} ${err?.message ?? ''} ${err?.status ?? ''} ${err?.statusText ?? ''}`.toLowerCase();
  return (
    text.includes('resource_exhausted') ||
    text.includes('quota exceeded') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('read limit') ||
    text.includes('too many requests') ||
    text.includes('429')
  );
}

let lastQuotaHitTime = 0;

export function recordQuotaHit(scope: string, error?: unknown) {
  lastQuotaHitTime = Date.now();
  console.warn(`[Read limit hit] ${scope} returned fallback data:`, error);
}

export function isReadLimitHit(): boolean {
  return Date.now() - lastQuotaHitTime < 60_000;
}

export class FirestoreQuotaExceededError extends Error {
  constructor(scope: string) {
    super(`Firestore quota exceeded while loading ${scope}.`);
    this.name = 'FirestoreQuotaExceededError';
  }
}

export function handleFirestoreReadError(scope: string, error: unknown) {
  recordQuotaHit(scope, error);
  // Do NOT throw an unhandled exception that crashes the page and hides the navigation tabs.
  // Log the warning and allow the calling function to return fallback data ([] / empty counts).
}
