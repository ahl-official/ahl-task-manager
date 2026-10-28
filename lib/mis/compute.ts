import { adminGetAllUsers } from '@/lib/firebase/users';
import { misCacheGet, misCacheGetLastKnown, misCacheKey, misCacheSet } from '@/lib/mis/cache';
import { computeG4, emptyBucket, gapPercent, gapToDecimal } from '@/lib/mis/sheetFormula';
import { CHECKLIST_PARAM_LABELS, getChecklistDetailedCounts } from '@/lib/mis/sources/checklist';
import { getDelegationBuckets } from '@/lib/mis/sources/delegation';
import { getFmsBuckets } from '@/lib/mis/sources/fms';
import type { MisParameterRow, MisPersonScore } from '@/lib/mis/types';
import { formatWeekLabel, getMisWeekPeriod } from '@/lib/mis/week';
import { normalizePersonName } from '@/lib/utils/names';
import { cfApi, CloudflareApiError, hasCloudflareApi } from '@/lib/cloudflare/api';

export async function getReconciledScores(weekStart: string, weekEnd: string): Promise<MisPersonScore[]> {
  if (!hasCloudflareApi()) return [];
  try {
    return await cfApi<MisPersonScore[]>(`/mis/reconciled?weekStart=${encodeURIComponent(weekStart)}&weekEnd=${encodeURIComponent(weekEnd)}`);
  } catch (error) {
    // Allow the app and Worker to be deployed separately. Other read failures must surface.
    if (error instanceof CloudflareApiError && error.status === 404) return [];
    throw error;
  }
}

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
  const fallback = misCacheGetLastKnown<MisPersonScore[]>(cacheKey);

  try {
    const [checklistDetailed, delegation, fms, users, reconciled] = await Promise.all([
      getChecklistDetailedCounts(week.weekStart, week.weekEnd).catch(() => ({ byName: new Map(), paramCounts: [] })),
      getDelegationBuckets(week.weekStart, week.weekEnd).catch(() => new Map()),
      getFmsBuckets(week.weekStart, week.weekEnd).catch(() => new Map()),
      adminGetAllUsers().catch(() => []),
      getReconciledScores(week.weekStart, week.weekEnd).catch(() => []),
    ]);

    const checklist = checklistDetailed.byName;
    const usersByName = new Map(
      users
        .filter(user => user.isActive !== false)
        .map(user => [normalizePersonName(user.name), user]),
    );

    const reconciledByName = new Map(reconciled.map(row => [normalizePersonName(row.name), row]));
    const names = new Set<string>([
      ...Array.from(checklist.keys()),
      ...Array.from(delegation.keys()),
      ...Array.from(fms.keys()),
      ...Array.from(reconciledByName.keys()),
    ]);

    const rows: MisPersonScore[] = [];
    for (const key of Array.from(names)) {
      const historical = reconciledByName.get(key);
      if (historical) {
        rows.push(historical);
        continue;
      }
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
    misCacheSet(cacheKey, rows, 60 * 60 * 1000); // 1 hour cache
    return rows;
  } catch (err) {
    if (fallback && fallback.length > 0) {
      console.warn('[computeMisScoresForWeek] Computation failed, continuing to serve cached scores:', err);
      return fallback;
    }
    throw err;
  }
}

export function misSnapshotId(name: string, weekKey: string) {
  return `${weekKey}_${normalizePersonName(name).replace(/\s+/g, '-') || 'unknown'}`;
}

/**
 * Overlay live FMS sheet counts onto score rows (snapshots often store stale FMS).
 * Checklist/delegation unchanged. Recomputes G4 totals from updated FMS.
 * Sheets-only — no D1.
 */
export async function overlayLiveFmsOnScores(
  rows: MisPersonScore[],
  weekStart: string,
  weekEnd: string,
): Promise<MisPersonScore[]> {
  if (!rows.length) return rows;
  const [fmsByName, reconciled] = await Promise.all([
    getFmsBuckets(weekStart, weekEnd),
    getReconciledScores(weekStart, weekEnd),
  ]);
  const historicalByName = new Map(reconciled.map(row => [normalizePersonName(row.name), row]));
  const overlaid = rows.map((row) => {
    const key = normalizePersonName(row.name);
    const historical = historicalByName.get(key);
    if (historical) return historical;
    const live = fmsByName.get(key);
    const fmsBucket = live
      ? { planned: live.planned, done: live.done, onTime: live.onTime }
      : emptyBucket();
    const scored = computeG4(row.checklist || emptyBucket(), row.delegation || emptyBucket(), fmsBucket);
    const parameters = Array.isArray(row.parameters)
      ? row.parameters.map((param) =>
          param.id === 'fms' || param.group === 'fms'
            ? {
                ...param,
                planned: fmsBucket.planned,
                done: fmsBucket.done,
                onTime: fmsBucket.onTime,
                gapPercent: gapPercent(fmsBucket.done, fmsBucket.planned),
              }
            : param,
        )
      : row.parameters;
    return {
      ...row,
      fms: scored.fms,
      parameters,
      planned: scored.total.planned,
      done: scored.total.done,
      onTime: scored.total.onTime,
      gapPercent: scored.gapPercent,
      gapDecimal: gapToDecimal(scored.gapPercent),
      onTimeGapPercent: scored.onTimeGapPercent,
    };
  });
  const seen = new Set(overlaid.map(row => normalizePersonName(row.name)));
  return [...overlaid, ...reconciled.filter(row => !seen.has(normalizePersonName(row.name)))];
}

export { formatWeekLabel };
