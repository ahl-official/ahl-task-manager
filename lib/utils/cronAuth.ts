import { timingSafeEqual } from 'crypto';
import { getSession } from './auth';

export async function isCronOrAdmin(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const supplied = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (secret) {
    const expected = Buffer.from(secret), actual = Buffer.from(supplied);
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return true;
  }
  return (await getSession())?.role === 'admin';
}
