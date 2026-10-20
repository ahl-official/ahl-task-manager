import { isDailyWeeklyOff } from './weeklyOff';

export type PeriodCategory = 'Daily' | 'Weekly' | 'Monthly' | string;

export type MaterializeTemplate = {
  id: string;
  category: PeriodCategory;
  title?: string;
  description?: string;
  assignedTo?: string;
  assignedToName?: string;
  department?: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  createdAt?: string | null;
};

export type PeriodRowSpec = {
  templateId: string;
  periodKey: string;
  monthKey: string;
  category: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedToName: string;
  department: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
};

/** Monday (ISO) week start for a YYYY-MM-DD date. */
export function weekStartMonday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  const iso = dow === 0 ? 7 : dow;
  dt.setUTCDate(dt.getUTCDate() - (iso - 1));
  return dt.toISOString().slice(0, 10);
}

export function monthBounds(monthKey: string): { start: string; end: string; year: number; month: number; lastDay: number } {
  const [ys, ms] = monthKey.split('-');
  const year = Number(ys);
  const month = Number(ms);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    lastDay,
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  };
}

function eachDateInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  const cur = new Date(Date.UTC(ys, ms - 1, ds, 12, 0, 0));
  const last = new Date(Date.UTC(ye, me - 1, de, 12, 0, 0));
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Build concrete checklist period rows for one calendar month.
 * Daily = each day (Salon Mondays skipped). Weekly = each week due-day in month.
 * Monthly = one row. Days before template creation are omitted.
 */
export function buildMonthPeriodRows(template: MaterializeTemplate, monthKey: string): PeriodRowSpec[] {
  const cat = String(template.category || 'Daily');
  const catLower = cat.toLowerCase();
  const { start: monthStart, end: monthEnd } = monthBounds(monthKey);
  const created = String(template.createdAt || '').slice(0, 10);
  const fromDate = created && created > monthStart ? created : monthStart;

  const base = {
    templateId: template.id,
    monthKey,
    category: cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase(),
    title: String(template.title || template.description || 'Recurring Task').trim(),
    description: String(template.description || template.title || '').trim(),
    assignedTo: String(template.assignedTo || ''),
    assignedToName: String(template.assignedToName || 'Unassigned'),
    department: String(template.department || ''),
  };

  if (fromDate > monthEnd) return [];

  if (catLower === 'daily') {
    return eachDateInRange(fromDate, monthEnd)
      .filter((d) => !isDailyWeeklyOff(d, template.assignedToName))
      .map((d) => ({
        ...base,
        periodKey: d,
        dueDate: d,
        periodStart: d,
        periodEnd: d,
      }));
  }

  if (catLower === 'weekly') {
    const dueDow = template.dayOfWeek != null && template.dayOfWeek >= 1 && template.dayOfWeek <= 7
      ? Number(template.dayOfWeek)
      : 5; // Friday default (matches existing checklist fallback)
    const rows: PeriodRowSpec[] = [];
    const seen = new Set<string>();
    for (const d of eachDateInRange(monthStart, monthEnd)) {
      const [y, m, day] = d.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
      const dow = dt.getUTCDay();
      const iso = dow === 0 ? 7 : dow;
      if (iso !== dueDow) continue;
      if (d < fromDate) continue;
      const periodKey = weekStartMonday(d);
      if (seen.has(periodKey)) continue;
      seen.add(periodKey);
      const weekEnd = (() => {
        const mon = new Date(`${periodKey}T12:00:00Z`);
        mon.setUTCDate(mon.getUTCDate() + 6);
        return mon.toISOString().slice(0, 10);
      })();
      rows.push({
        ...base,
        periodKey,
        dueDate: d,
        periodStart: periodKey,
        periodEnd: weekEnd,
      });
    }
    return rows;
  }

  if (catLower === 'monthly') {
    if (created && created.slice(0, 7) > monthKey) return [];
    const dueDay = template.dayOfMonth != null && template.dayOfMonth >= 1
      ? Math.min(Number(template.dayOfMonth), monthBounds(monthKey).lastDay)
      : monthBounds(monthKey).lastDay;
    const dueDate = `${monthKey}-${String(dueDay).padStart(2, '0')}`;
    return [{
      ...base,
      periodKey: monthKey,
      dueDate,
      periodStart: monthStart,
      periodEnd: monthEnd,
    }];
  }

  return [];
}

export function periodRowId(templateId: string, periodKey: string) {
  return `${templateId}:${periodKey}`;
}
