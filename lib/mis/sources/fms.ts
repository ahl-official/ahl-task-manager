import { getSpreadsheetSheetTitles, hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { emptyBucket, type MisBucket } from '@/lib/mis/sheetFormula';
import { FMS_STEP_CATALOG, type FmsStepDef } from '@/lib/mis/sources/fmsCatalog';
import { dateKeyInRange } from '@/lib/mis/week';
import { parseSheetDate } from '@/lib/utils/indiaDate';
import { normalizePersonName } from '@/lib/utils/names';

const DEFAULT_MIS_REPORT_ID = '1seVqJ5xPqva1Si6CXDpuZSePvP40PDO2fzJSJfss8GU';

function misReportSpreadsheetId() {
  return process.env.MIS_REPORT_SPREADSHEET_ID || DEFAULT_MIS_REPORT_ID;
}

export function hasMisReportSheet() {
  return Boolean(misReportSpreadsheetId() && hasGoogleSheetsAuth());
}

function quoteSheet(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function cell(row: unknown[], index: number) {
  return String(row[index] ?? '').trim();
}

export type FmsPersonBucket = MisBucket & { name: string; department: string };

export interface FmsStepPersonCount {
  step: FmsStepDef;
  byName: Map<string, FmsPersonBucket>;
}

function ensureRow(map: Map<string, FmsPersonBucket>, name: string) {
  const key = normalizePersonName(name);
  if (!key) return null;
  const existing = map.get(key);
  if (existing) return existing;
  const created: FmsPersonBucket = { name, department: '', ...emptyBucket() };
  map.set(key, created);
  return created;
}

function isDoneStatus(status: string, step: FmsStepDef) {
  const allowed = step.doneStatuses?.length ? step.doneStatuses : ['Done'];
  return allowed.some(value => value.toLowerCase() === status.toLowerCase());
}

function rowInWeek(
  row: unknown[],
  step: FmsStepDef,
  weekStart: string,
  weekEnd: string,
) {
  const startKey = parseSheetDate(row[step.dateCol]);
  if (!startKey) return false;
  return dateKeyInRange(startKey, weekStart, weekEnd);
}


const fmsCache = new Map<string, { expiresAt: number; data: { byName: Map<string, FmsPersonBucket>; stepCounts: FmsStepPersonCount[] } }>();

/**
 * Count every Master FMS/workflow step for the week.
 * Returns person totals (E20) and optionally per-step maps for the parameter panel.
 */
export async function getFmsDetailedCounts(
  weekStart: string,
  weekEnd: string,
  options?: { includeSteps?: boolean },
) {
  const includeSteps = options?.includeSteps !== false;
  const cacheKey = `${weekStart}_${weekEnd}_${includeSteps}`;
  const cached = fmsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const byName = new Map<string, FmsPersonBucket>();
  const stepCounts: FmsStepPersonCount[] = includeSteps
    ? FMS_STEP_CATALOG.map(step => ({
      step,
      byName: new Map<string, FmsPersonBucket>(),
    }))
    : [];

  if (!hasMisReportSheet()) {
    return { byName, stepCounts };
  }

  const catalogSheetNames = Array.from(new Set(FMS_STEP_CATALOG.map(step => step.sheet)));
  const availableSheets = await getSpreadsheetSheetTitles(misReportSpreadsheetId());

  // Map catalog sheet name -> actual matching sheet title in workbook
  const validSheetMap = new Map<string, string>();
  for (const name of catalogSheetNames) {
    if (availableSheets.has(name)) {
      validSheetMap.set(name, name);
    } else {
      const match = Array.from(availableSheets).find(
        actual => actual.toLowerCase() === name.toLowerCase() ||
                  actual.replace(/\s+/g, '').toLowerCase() === name.replace(/\s+/g, '').toLowerCase()
      );
      if (match) {
        validSheetMap.set(name, match);
      }
    }
  }

  const sheetRows = new Map<string, unknown[][]>();
  const sheetsToQuery = Array.from(new Set(validSheetMap.values()));

  if (sheetsToQuery.length > 0) {
    try {
      const ranges = sheetsToQuery.map(name => `${quoteSheet(name)}!A2:AZ`);
      const allResults = await readSpreadsheetValues(misReportSpreadsheetId(), ranges, 'FORMATTED_VALUE');
      sheetsToQuery.forEach((name, idx) => {
        sheetRows.set(name, allResults[idx] || []);
      });
    } catch (err) {
      console.error('Failed to batch read FMS sheets from Google Sheets', err);
    }
  }

  for (let i = 0; i < FMS_STEP_CATALOG.length; i++) {
    const step = FMS_STEP_CATALOG[i];
    const actualSheetName = validSheetMap.get(step.sheet) || step.sheet;
    const entry = includeSteps ? stepCounts[i] : null;
    const rows = sheetRows.get(actualSheetName) ?? [];
    const dateCol = step.dateCol;
    const statusCol = dateCol + 2;
    const onTimeCol = dateCol + 4;
    const nameCol = dateCol + 5;

    for (const row of rows) {
      const name = cell(row, nameCol);
      if (!name) continue;
      if (!rowInWeek(row, step, weekStart, weekEnd)) continue;

      const status = cell(row, statusCol);
      const onTimeFlag = cell(row, onTimeCol);
      const done = isDoneStatus(status, step);
      const onTime = done && /^on[- ]?time$/i.test(onTimeFlag);

      const totalBucket = ensureRow(byName, name);
      if (!totalBucket) continue;
      totalBucket.planned += 1;
      if (done) totalBucket.done += 1;
      if (onTime) totalBucket.onTime += 1;

      if (entry) {
        const stepBucket = ensureRow(entry.byName, name);
        if (!stepBucket) continue;
        stepBucket.planned += 1;
        if (done) stepBucket.done += 1;
        if (onTime) stepBucket.onTime += 1;
      }
    }
  }

  const result = { byName, stepCounts };
  fmsCache.set(cacheKey, { expiresAt: Date.now() + 60_000, data: result });
  return result;
}

/** FMS bucket (E20/F20): totals only (no per-step maps) — used by live Scores. */
export async function getFmsBuckets(weekStart: string, weekEnd: string) {
  const { byName } = await getFmsDetailedCounts(weekStart, weekEnd, { includeSteps: false });
  return byName;
}
