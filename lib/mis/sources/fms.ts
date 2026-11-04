import { getSpreadsheetSheetTitles, hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { emptyBucket, type MisBucket } from '@/lib/mis/sheetFormula';
import { FMS_STEP_CATALOG, type FmsStepDef } from '@/lib/mis/sources/fmsCatalog';
import { dateKeyInRange } from '@/lib/mis/week';
import { parseSheetDate } from '@/lib/utils/indiaDate';
import { normalizePersonName } from '@/lib/utils/names';
import { mapFmsNameToSystemUser } from '@/lib/fms/userMapping';

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
  const mapped = mapFmsNameToSystemUser(name) || name;
  const key = normalizePersonName(mapped);
  if (!key) return null;
  const existing = map.get(key);
  if (existing) return existing;
  const created: FmsPersonBucket = { name: mapped, department: '', ...emptyBucket() };
  map.set(key, created);
  return created;
}

function isDoneStatus(status: string, step: FmsStepDef) {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  if (step.doneStatuses?.length) {
    return step.doneStatuses.some(value => value.toLowerCase() === s);
  }
  return s === 'done' || (step.sheet.includes('O2D') && s === 'completed');
}

function isOnTimeStatus(onTimeFlag: string) {
  const f = onTimeFlag.trim().toLowerCase();
  if (!f) return false;
  // Match MIS Report COUNTIFS on-time criterion ("On-Time" / "On Time")
  return f === 'on-time' || f === 'on time';
}

function rowInWeek(
  row: unknown[],
  step: FmsStepDef,
  weekStart: string,
  weekEnd: string,
) {
  const cellVal = row[step.dateCol];
  if (!cellVal) return false;
  const startKey = parseSheetDate(cellVal);
  if (!startKey) return false;

  if (step.endCol !== undefined) {
    const endKey = parseSheetDate(row[step.endCol]);
    if (!endKey) return false;
    return startKey >= weekStart && endKey <= weekEnd;
  }

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

  const defaultSpreadsheetId = misReportSpreadsheetId();

  // Group steps by spreadsheet ID
  const stepsBySpreadsheet = new Map<string, FmsStepDef[]>();
  for (const step of FMS_STEP_CATALOG) {
    const sId = step.spreadsheetId || defaultSpreadsheetId;
    if (!stepsBySpreadsheet.has(sId)) {
      stepsBySpreadsheet.set(sId, []);
    }
    stepsBySpreadsheet.get(sId)!.push(step);
  }

  // Map of `${sId}:${actualSheetTitle}` -> rows
  const sheetRows = new Map<string, unknown[][]>();
  // Map of `${sId}:${catalogSheetName}` -> actual sheet title
  const validSheetMap = new Map<string, string>();

  for (const [sId, stepsForSheet] of Array.from(stepsBySpreadsheet.entries())) {
    try {
      const availableSheets = await getSpreadsheetSheetTitles(sId);
      const catalogNames = Array.from(new Set(stepsForSheet.map(s => s.sheet)));
      const resolvedNames: string[] = [];

      for (const name of catalogNames) {
        let actual = name;
        if (availableSheets.has(name)) {
          actual = name;
        } else {
          const match = Array.from(availableSheets).find(
            a => a.toLowerCase() === name.toLowerCase() ||
                 a.replace(/\s+/g, '').toLowerCase() === name.replace(/\s+/g, '').toLowerCase()
          );
          if (match) actual = match;
        }
        validSheetMap.set(`${sId}:${name}`, actual);
        resolvedNames.push(actual);
      }

      const uniqueResolved = Array.from(new Set(resolvedNames));
      if (uniqueResolved.length > 0) {
        const ranges = uniqueResolved.map(name => `${quoteSheet(name)}!A2:CZ`);
        const allResults = await readSpreadsheetValues(sId, ranges, 'FORMATTED_VALUE');
        uniqueResolved.forEach((name, idx) => {
          sheetRows.set(`${sId}:${name}`, allResults[idx] || []);
        });
      }
    } catch (err) {
      console.error(`Failed to batch read FMS sheets from spreadsheet ${sId}`, err);
    }
  }

  for (let i = 0; i < FMS_STEP_CATALOG.length; i++) {
    const step = FMS_STEP_CATALOG[i];
    const sId = step.spreadsheetId || defaultSpreadsheetId;
    const actualSheetName = validSheetMap.get(`${sId}:${step.sheet}`) || step.sheet;
    const entry = includeSteps ? stepCounts[i] : null;
    const rows = sheetRows.get(`${sId}:${actualSheetName}`) ?? [];
    const dateCol = step.dateCol;
    const statusCol = step.statusCol ?? (dateCol + 2);
    const onTimeCol = step.onTimeCol ?? (dateCol + 4);
    const nameCol = step.nameCol ?? (dateCol + 5);

    for (const row of rows) {
      let name = cell(row, nameCol);
      // For Upload FMS Stage 3, check if handed over to Azhar
      if (step.id === 'upload-fms-stage-3') {
        const col19 = cell(row, 19).toLowerCase();
        if (col19.includes('azhar')) {
          name = 'Azhar';
        }
      }
      if (!name) continue;
      if (!rowInWeek(row, step, weekStart, weekEnd)) continue;

      const status = cell(row, statusCol);
      let done = isDoneStatus(status, step);
      if (!done && step.actualCol !== undefined) {
        const actual = cell(row, step.actualCol);
        if (actual && actual.trim() !== '') {
          done = true;
        }
      }

      let onTime = false;
      if (done) {
        if (step.delayCol !== undefined) {
          const delayStr = cell(row, step.delayCol);
          if (!delayStr || delayStr.startsWith('-') || delayStr === '0' || delayStr === '00:00:00' || delayStr.toLowerCase() === 'on-time') {
            onTime = true;
          } else if (step.actualCol !== undefined) {
            const pDate = parseSheetDate(cell(row, dateCol));
            const aDate = parseSheetDate(cell(row, step.actualCol));
            if (pDate && aDate && aDate <= pDate) {
              onTime = true;
            }
          }
        } else {
          const onTimeFlag = cell(row, onTimeCol);
          onTime = isOnTimeStatus(onTimeFlag);
        }
      }

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
