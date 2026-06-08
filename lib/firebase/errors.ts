export function isFirestoreQuotaError(error: unknown) {
  const err = error as { code?: unknown; details?: unknown; message?: unknown; status?: unknown };
  const text = `${err?.code ?? ''} ${err?.details ?? ''} ${err?.message ?? ''} ${err?.status ?? ''}`.toLowerCase();
  return text.includes('resource_exhausted') || text.includes('quota exceeded') || text.includes('quota');
}

export class FirestoreQuotaExceededError extends Error {
  constructor(scope: string) {
    super(`Firestore quota exceeded while loading ${scope}.`);
    this.name = 'FirestoreQuotaExceededError';
  }
}

export function handleFirestoreReadError(scope: string, error: unknown) {
  if (!isFirestoreQuotaError(error)) throw error;
  console.error(`[Firestore quota] ${scope} failed`, error);
  throw new FirestoreQuotaExceededError(scope);
}
