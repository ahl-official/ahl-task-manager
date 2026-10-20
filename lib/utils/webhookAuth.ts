import { timingSafeEqual } from 'crypto';

export function isWebhookAuthorized(headers: Headers, secret: string): boolean {
  if (!secret) return false;
  const supplied = headers.get('x-webhook-secret') || headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
