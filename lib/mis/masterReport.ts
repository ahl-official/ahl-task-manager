import { computeMisScoresForWeek } from '@/lib/mis/compute';
import {
  computeG4,
  emptyBucket,
  formatGapPercent,
  gapPercent,
  type MisBucket,
} from '@/lib/mis/sheetFormula';
import { CHECKLIST_PARAM_LABELS } from '@/lib/mis/sources/checklist';
import type { MisParameterRow } from '@/lib/mis/types';
import { formatWeekLabel, getMisWeekPeriod } from '@/lib/mis/week';
import { formatDmy } from '@/lib/utils/indiaDate';
import { normalizePersonName } from '@/lib/utils/names';

export type { MisParameterRow } from '@/lib/mis/types';

export interface MisMasterRollup {
  label: string;
  kra: string;
  kpi: string;
  planned: number;
  done: number;
  onTime: number;
  gapPercent: number | null;
  onTimeGapPercent: number | null;
}

export interface MisMasterReport {
  name: string;
  department: string;
  uid: string | null;
  waNumber: string;
  weekKey: string;
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  weekStartLabel: string;
  weekEndLabel: string;
  weekLabel: string;
  checklist: MisBucket;
  delegation: MisBucket;
  fms: MisBucket;
  total: MisBucket;
  gapPercent: number | null;
  onTimeGapPercent: number | null;
  gapLabel: string;
  lastWeekPlannedPercent: string;
  nextWeekPlannedPercent: string;
  rollups: MisMasterRollup[];
  parameters: MisParameterRow[];
  formula: string;
  sources: {
    checklist: string;
    delegation: string;
    fms: string;
  };
}

function rollup(
  label: string,
  kra: string,
  kpi: string,
  bucket: MisBucket,
): MisMasterRollup {
  return {
    label,
    kra,
    kpi,
    planned: bucket.planned,
    done: bucket.done,
    onTime: bucket.onTime,
    gapPercent: gapPercent(bucket.done, bucket.planned),
    onTimeGapPercent: gapPercent(bucket.onTime, bucket.planned),
  };
}

function ensureParameters(
  person: Awaited<ReturnType<typeof computeMisScoresForWeek>>[number] | null,
  checklist: MisBucket,
  delegationBucket: MisBucket,
  fms: MisBucket,
): MisParameterRow[] {
  if (person?.parameters?.length) return person.parameters;
  const parameters: MisParameterRow[] = Object.entries(CHECKLIST_PARAM_LABELS).map(([id, label]) => ({
    id,
    label,
    section: 'Checklist',
    group: 'checklist' as const,
    planned: 0,
    done: 0,
    onTime: 0,
    gapPercent: null,
  }));
  parameters.push({
    id: 'delegation',
    label: 'Delegation',
    section: 'Delegation',
    group: 'delegation',
    planned: delegationBucket.planned,
    done: delegationBucket.done,
    onTime: delegationBucket.onTime,
    gapPercent: gapPercent(delegationBucket.done, delegationBucket.planned),
  });
  parameters.push({
    id: 'fms',
    label: 'FMS Total',
    section: 'FMS',
    group: 'fms',
    planned: fms.planned,
    done: fms.done,
    onTime: fms.onTime,
    gapPercent: gapPercent(fms.done, fms.planned),
  });
  // silence unused when snapshot has no params — checklist totals still available via rollups
  void checklist;
  return parameters;
}

export async function buildMisMasterReport(input: {
  name: string;
  weekStart?: string;
  weekEnd?: string;
}): Promise<MisMasterReport | null> {
  const week = input.weekStart && input.weekEnd
    ? { ...getMisWeekPeriod(input.weekStart), weekStart: input.weekStart, weekEnd: input.weekEnd }
    : getMisWeekPeriod(input.weekStart);

  const key = normalizePersonName(input.name);
  if (!key) return null;

  const current = getMisWeekPeriod();
  let person: Awaited<ReturnType<typeof computeMisScoresForWeek>>[number] | null = null;

  // Past weeks: use saved weekly snapshot when present (avoids re-hitting sheets).
  if (week.weekKey !== current.weekKey) {
    const { adminGetMisWeeklySnapshots } = await import('@/lib/mis/weeklySnapshot');
    const snapshots = await adminGetMisWeeklySnapshots({ weekKey: week.weekKey });
    const hit = snapshots.find(row => normalizePersonName(row.name) === key) ?? null;
    if (hit) {
      person = {
        uid: hit.uid,
        name: hit.name,
        department: hit.department,
        waNumber: hit.waNumber,
        checklist: hit.checklist,
        delegation: hit.delegation,
        fms: hit.fms,
        parameters: hit.parameters,
        planned: hit.planned,
        done: hit.done,
        onTime: hit.onTime,
        gapPercent: hit.gapPercent,
        gapDecimal: hit.gapDecimal,
        onTimeGapPercent: hit.onTimeGapPercent,
        weekKey: hit.weekKey,
        weekStart: hit.weekStart,
        weekEnd: hit.weekEnd,
      };
    }
  }

  if (!person) {
    const rows = await computeMisScoresForWeek(week.weekStart, week.weekEnd);
    person = rows.find(row => normalizePersonName(row.name) === key) ?? null;
  }

  const checklist = person?.checklist ?? emptyBucket();
  const delegationBucket = person?.delegation ?? emptyBucket();
  const fms = person?.fms ?? emptyBucket();
  const scored = computeG4(checklist, delegationBucket, fms);

  const name = person?.name || input.name;
  const rollups: MisMasterRollup[] = [
    rollup('Overall', 'All work should be done', '% Work Not Done', scored.total),
    {
      ...rollup('Overall (On-Time)', 'All work should be done On-Time', '% Work Not Done On-Time', {
        planned: scored.total.planned,
        done: scored.total.onTime,
        onTime: scored.total.onTime,
      }),
      gapPercent: scored.onTimeGapPercent,
      onTimeGapPercent: scored.onTimeGapPercent,
    },
    rollup('Checklist Total Task', 'All work should be done', '% Work Not Done', checklist),
    rollup('Delegation Total Task', 'All work should be done', '% Work Not Done', delegationBucket),
    rollup('FMS Total Task', 'All work should be done', '% Work Not Done', fms),
  ];

  return {
    name,
    department: person?.department || '',
    uid: person?.uid ?? null,
    waNumber: person?.waNumber || '',
    weekKey: week.weekKey,
    weekNumber: week.weekNumber,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    weekStartLabel: formatDmy(week.weekStart),
    weekEndLabel: formatDmy(week.weekEnd),
    weekLabel: formatWeekLabel(week.weekStart, week.weekEnd),
    checklist: scored.checklist,
    delegation: scored.delegation,
    fms: scored.fms,
    total: scored.total,
    gapPercent: scored.gapPercent,
    onTimeGapPercent: scored.onTimeGapPercent,
    gapLabel: formatGapPercent(scored.gapPercent),
    lastWeekPlannedPercent: '',
    nextWeekPlannedPercent: '',
    rollups,
    parameters: ensureParameters(person, checklist, delegationBucket, fms),
    formula: 'ROUND(done/planned*100 - 100, 2)',
    sources: {
      checklist: 'Office / Salon / Weekly Master sheets (Checklist Scoring sources)',
      delegation: 'Cloudflare One Time (Delegation Scoring formula)',
      fms: 'MIS Report FMS tabs',
    },
  };
}
