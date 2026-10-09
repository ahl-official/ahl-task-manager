import { emptyBucket, type MisBucket } from '@/lib/mis/sheetFormula';
import { normalizePersonName } from '@/lib/utils/names';
import { getRecurringMisCounts } from '@/lib/cloudflare/recurring';
import { hasCloudflareApi } from '@/lib/cloudflare/api';

export const CHECKLIST_PARAM_LABELS: Record<string, string> = {
  office: 'Office Daily',
  salon: 'Salon Daily',
  weekly: 'Weekly & Monthly',
};

export type ChecklistPersonBucket = MisBucket & { name: string; department: string };

export interface ChecklistParamCount {
  id: string;
  label: string;
  byName: Map<string, ChecklistPersonBucket>;
}

/**
 * Checklist bucket (E7/F7) + per-source parameters (Office / Salon / Weekly).
 * Reads directly and exclusively from Cloudflare D1 Database.
 */
export async function getChecklistDetailedCounts(weekStart: string, weekEnd: string) {
  const byName = new Map<string, ChecklistPersonBucket>();
  const paramCounts: ChecklistParamCount[] = Object.entries(CHECKLIST_PARAM_LABELS).map(([id, label]) => ({
    id,
    label,
    byName: new Map<string, ChecklistPersonBucket>(),
  }));
  const paramById = new Map(paramCounts.map(row => [row.id, row]));

  if (!hasCloudflareApi()) {
    console.warn('Cloudflare API not configured for MIS recurring checklist source');
    return { byName, paramCounts };
  }

  try {
    const d1Data = await getRecurringMisCounts(weekStart, weekEnd);
    const userEntries = Object.entries(d1Data?.byName || {});

    for (const [keyName, row] of userEntries) {
      const key = normalizePersonName(row.name || keyName);
      if (!key) continue;

      const personBucket: ChecklistPersonBucket = {
        name: row.name,
        department: row.department || '',
        planned: row.planned || 0,
        done: row.done || 0,
        onTime: row.onTime || 0,
      };
      byName.set(key, personBucket);

      for (const [catKey, catCounts] of Object.entries(row.byCategory || {})) {
        const param = paramById.get(catKey);
        if (param) {
          param.byName.set(key, {
            name: row.name,
            department: row.department || '',
            planned: catCounts.planned || 0,
            done: catCounts.done || 0,
            onTime: catCounts.onTime || 0,
          });
        }
      }
    }
  } catch (err) {
    console.error('Failed to get MIS checklist counts from Cloudflare D1 database', err);
  }

  return { byName, paramCounts };
}

export async function getChecklistBuckets(weekStart: string, weekEnd: string) {
  const { byName } = await getChecklistDetailedCounts(weekStart, weekEnd);
  return byName;
}
