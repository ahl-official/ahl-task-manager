import { adminGetAllUsers } from '@/lib/firebase/users';
import { misCacheGet, misCacheKey, misCacheSet } from '@/lib/mis/cache';
import { computeG4, emptyBucket, gapPercent } from '@/lib/mis/sheetFormula';
import { CHECKLIST_PARAM_LABELS, getChecklistDetailedCounts } from '@/lib/mis/sources/checklist';
import { getDelegationBuckets } from '@/lib/mis/sources/delegation';
import { getFmsBuckets } from '@/lib/mis/sources/fms';
import type { MisParameterRow, MisPersonScore } from '@/lib/mis/types';
import { formatWeekLabel, getMisWeekPeriod } from '@/lib/mis/week';
import { normalizePersonName } from '@/lib/utils/names';

function paramRow(
  id: string,
  label: string,
  section: string,
  group: MisParameterRow['group'],
  bucket: { planned: number; done: number; onTime: number },
): MisParameterRow {
  return {
    id,
    label,
    section,
    group,
    planned: bucket.planned,
    done: bucket.done,
    onTime: bucket.onTime,
    gapPercent: gapPercent(bucket.done, bucket.planned),
  };
}

/**
 * Live PDF-style MIS for a business week.
 * Checklist (timely Masters) + Delegation (Cloudflare One Time) + FMS (MIS Report sheets).
 * Results cached ~60s so Scores list + member detail share one compute.
 */
export async function computeMisScoresForWeek(weekStart?: string, weekEnd?: string): Promise<MisPersonScore[]> {
  const week = weekStart && weekEnd
    ? { ...getMisWeekPeriod(weekStart), weekStart, weekEnd }
    : getMisWeekPeriod();

  const cacheKey = misCacheKey(['live', 'v2-params', week.weekStart, week.weekEnd]);
  const cached = misCacheGet<MisPersonScore[]>(cacheKey);
  if (cached) return cached;

  const [checklistDetailed, delegation, fms, users] = await Promise.all([
    getChecklistDetailedCounts(week.weekStart, week.weekEnd),
    getDelegationBuckets(week.weekStart, week.weekEnd),
    getFmsBuckets(week.weekStart, week.weekEnd),
    adminGetAllUsers().catch(() => []),
  ]);

  const checklist = checklistDetailed.byName;
  const usersByName = new Map(
    users
      .filter(user => user.isActive !== false)
      .map(user => [normalizePersonName(user.name), user]),
  );

  const names = new Set<string>([
    ...Array.from(checklist.keys()),
    ...Array.from(delegation.keys()),
    ...Array.from(fms.keys()),
  ]);

  const rows: MisPersonScore[] = [];
  for (const key of Array.from(names)) {
    const check = checklist.get(key);
    const del = delegation.get(key);
    const fmsRow = fms.get(key);
    const user = usersByName.get(key);

    const checklistBucket = check ?? emptyBucket();
    const delegationBucket = del
      ? { planned: del.planned, done: del.done, onTime: del.onTime }
      : emptyBucket();
    const fmsBucket = fmsRow
      ? { planned: fmsRow.planned, done: fmsRow.done, onTime: fmsRow.onTime }
      : emptyBucket();

    const scored = computeG4(checklistBucket, delegationBucket, fmsBucket);
    const name = check?.name || del?.name || fmsRow?.name || user?.name || key;

    const parameters: MisParameterRow[] = [];
    for (const [id, label] of Object.entries(CHECKLIST_PARAM_LABELS)) {
      const paramMap = checklistDetailed.paramCounts.find(row => row.id === id)?.byName;
      const bucket = paramMap?.get(key) ?? emptyBucket();
      parameters.push(paramRow(id, label, 'Checklist', 'checklist', bucket));
    }
    parameters.push(paramRow('delegation', 'Delegation', 'Delegation', 'delegation', delegationBucket));
    parameters.push(paramRow('fms', 'FMS Total', 'FMS', 'fms', fmsBucket));

    rows.push({
      uid: del?.uid || user?.uid || null,
      name,
      department: check?.department || del?.department || user?.department || '',
      waNumber: del?.waNumber || user?.waNumber || '',
      checklist: scored.checklist,
      delegation: scored.delegation,
      fms: scored.fms,
      parameters,
      planned: scored.total.planned,
      done: scored.total.done,
      onTime: scored.total.onTime,
      gapPercent: scored.gapPercent,
      gapDecimal: scored.gapDecimal,
      onTimeGapPercent: scored.onTimeGapPercent,
      weekKey: week.weekKey,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  misCacheSet(cacheKey, rows, 300_000); // 5 minutes cache
  return rows;
}

export function misSnapshotId(name: string, weekKey: string) {
  return `${weekKey}_${normalizePersonName(name).replace(/\s+/g, '-') || 'unknown'}`;
}

export { formatWeekLabel };
