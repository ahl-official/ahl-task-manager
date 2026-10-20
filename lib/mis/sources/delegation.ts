import { cfApi } from '@/lib/cloudflare/api';
import type { MisBucket } from '@/lib/mis/sheetFormula';
import { normalizePersonName } from '@/lib/utils/names';

/**
 * Delegation bucket (E17/F17): Cloudflare / portal One Time tasks.
 * Matches sheet Delegation Scoring:
 * - planned = Final Date in week
 * - done = Done + Not On-Time
 * - onTime = Done only
 */
export async function getDelegationBuckets(weekStart: string, weekEnd: string) {
  const byName = new Map<string, MisBucket & { name: string; department: string; uid: string; waNumber: string }>();
  const rows = await cfApi<Array<{ name: string; department: string; uid: string; waNumber: string; planned: number; done: number; onTime: number }>>(
    '/mis/delegation-counts?' + new URLSearchParams({ weekStart, weekEnd }),
  );
  for (const item of rows) {
    const key = normalizePersonName(item.name || item.uid);
    if (!key) continue;
    const previous = byName.get(key);
    byName.set(key, { ...item, name: item.name || item.uid, department: item.department || '', waNumber: item.waNumber || '',
      planned: Number(item.planned || 0) + (previous?.planned || 0),
      done: Number(item.done || 0) + (previous?.done || 0),
      onTime: Number(item.onTime || 0) + (previous?.onTime || 0) });
  }
  return byName;
}
