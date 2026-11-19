import { emptyBucket, type MisBucket } from '@/lib/mis/sheetFormula';

// Accept both legacy Office/Salon parameters and the merged Daily row without counting both.
export function checklistPdfBuckets(score: {
  parameters?: Array<MisBucket & { id?: string }>;
  checklist?: MisBucket;
}) {
  const parameters = score.parameters || [];
  const sum = (ids: string[]) => parameters.filter(row => ids.includes(row.id || '')).reduce(
    (total, row) => ({ planned: total.planned + row.planned, done: total.done + row.done, onTime: total.onTime + row.onTime }),
    emptyBucket(),
  );
  const daily = parameters.some(row => row.id === 'daily') ? sum(['daily']) : sum(['office', 'salon']);
  const weekly = parameters.some(row => row.id === 'weekly' || row.id === 'monthly')
    ? sum(['weekly', 'monthly'])
    : {
      planned: (score.checklist?.planned ?? daily.planned) - daily.planned,
      done: (score.checklist?.done ?? daily.done) - daily.done,
      onTime: (score.checklist?.onTime ?? daily.onTime) - daily.onTime,
    };
  const checklist = score.checklist ?? {
    planned: daily.planned + weekly.planned,
    done: daily.done + weekly.done,
    onTime: daily.onTime + weekly.onTime,
  };
  return { daily, weekly, checklist };
}
