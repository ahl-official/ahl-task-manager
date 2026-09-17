/** PDF MIS gap score: ROUND(done/planned*100 - 100, 2). Full completion → 0. */

export function gapPercent(done: number, planned: number): number | null {
  if (!Number.isFinite(done) || !Number.isFinite(planned) || planned <= 0) return null;
  return Math.round(((done / planned) * 100 - 100) * 100) / 100;
}

/** MIS Data stores G4 as a decimal fraction (−12.07% → −0.1207). */
export function gapToDecimal(gap: number | null): number | null {
  if (gap === null || !Number.isFinite(gap)) return null;
  return gap / 100;
}

export function formatGapPercent(gap: number | null): string {
  if (gap === null || !Number.isFinite(gap)) return '—';
  return `${gap.toFixed(2)}%`;
}

/**
 * Apps Script PDF display rule for Week/Month Report decimals:
 * `${(value * 100).toFixed(2)}%`
 * Pass gapPercent (−12.07); we convert to decimal then apply the same multiply.
 */
export function formatAppsScriptPercent(gapPercent: number | null | undefined): string {
  if (gapPercent === null || gapPercent === undefined || !Number.isFinite(gapPercent)) return '';
  const decimal = gapToDecimal(gapPercent);
  if (decimal === null) return '';
  return `${(decimal * 100).toFixed(2)}%`;
}

export interface MisBucket {
  planned: number;
  done: number;
  onTime: number;
}

export function emptyBucket(): MisBucket {
  return { planned: 0, done: 0, onTime: 0 };
}

export function addBuckets(...buckets: MisBucket[]): MisBucket {
  return buckets.reduce(
    (acc, bucket) => ({
      planned: acc.planned + (bucket.planned || 0),
      done: acc.done + (bucket.done || 0),
      onTime: acc.onTime + (bucket.onTime || 0),
    }),
    emptyBucket(),
  );
}

/** G4 completion gap from combined Checklist + Delegation + FMS buckets. */
export function computeG4(checklist: MisBucket, delegation: MisBucket, fms: MisBucket) {
  const total = addBuckets(checklist, delegation, fms);
  return {
    total,
    checklist,
    delegation,
    fms,
    gapPercent: gapPercent(total.done, total.planned),
    gapDecimal: gapToDecimal(gapPercent(total.done, total.planned)),
    onTimeGapPercent: gapPercent(total.onTime, total.planned),
  };
}

/**
 * Week/Month Report monthly score (ms): average of week scores present that month.
 * Sheet uses /4 when week 5 is empty, else /5 — we average only non-null weeks.
 */
export function averageWeekGaps(weeks: Array<number | null | undefined>): number | null {
  const values = weeks.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}
