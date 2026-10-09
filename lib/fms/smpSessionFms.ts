import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

export const DEFAULT_SMP_SESSION_SPREADSHEET_ID = '1qROKII2f3YFNioEF5BobbVFgBI-KQvUpA4G6153bvTQ';
export const SHEET_TITLE = 'Session FMS';

export interface SmpSessionTask {
  sheetRow: number;
  uniqueId: string;
  clientName: string;
  contactNo: string;
  city: string;
  firstSessionDate: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  formLink?: string;
  timeDelay?: string;
}

interface StageDefinition {
  stageName: string;
  stageKey: string;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  formLinkCol?: number;
  timeDelayCol?: number;
}

const SMP_STAGES: StageDefinition[] = [
  {
    stageName: 'First Session Completed?',
    stageKey: 'first_session',
    plannedCol: 6,
    actualCol: 7,
    statusCol: 8,
    timeDelayCol: 9,
    formLinkCol: 10,
  },
  {
    stageName: 'Second Session Appointment Completed?',
    stageKey: 'second_session',
    plannedCol: 13,
    actualCol: 14,
    statusCol: 15,
  },
];

export async function getSmpSessionFmsTasks(options?: {
  targetUserName?: string;
  role?: UserRole;
}): Promise<SmpSessionTask[]> {
  const spreadsheetId = process.env.SMP_SESSION_FMS_SPREADSHEET_ID || DEFAULT_SMP_SESSION_SPREADSHEET_ID;
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  try {
    // Read Dooer List tab to fetch the first doer dynamically
    let firstDoerName = '';
    const doerTabNames = ['Dooer List', 'Doer List', 'Dooer list', 'Doer list'];
    for (const dTab of doerTabNames) {
      try {
        const doerResult = await readSpreadsheetValues(
          spreadsheetId,
          `'${dTab}'!A1:Z50`,
          'FORMATTED_VALUE',
        );
        const doerRows = doerResult || [];
        for (const dRow of doerRows) {
          if (!dRow || dRow.length === 0) continue;
          for (const cell of dRow) {
            const val = String(cell ?? '').trim();
            if (
              val &&
              !['doer', 'dooer', 'name', 'sr', 'no', 'sr.', 'sr no', 'doer list', 'dooer list', 'users', 'user', 'role', 'email'].includes(val.toLowerCase()) &&
              val.length > 1
            ) {
              firstDoerName = val;
              break;
            }
          }
          if (firstDoerName) break;
        }
        if (firstDoerName) break;
      } catch {}
    }

    // Read header row A1:AZ6 to dynamically fetch the "Who" row (Row 3, index 2)
    const headerResult = await readSpreadsheetValues(
      spreadsheetId,
      `'${SHEET_TITLE}'!A1:AZ6`,
      'FORMATTED_VALUE',
    );
    const whoRow = (headerResult && headerResult[2]) || [];

    const results = await readSpreadsheetValues(
      spreadsheetId,
      `'${SHEET_TITLE}'!A7:AZ500`,
      'FORMATTED_VALUE',
    );
    const rows = results[0] || [];
    const tasks: SmpSessionTask[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const clientName = String(row[1] ?? '').trim();
      const contactNo = String(row[2] ?? '').trim();
      const city = String(row[3] ?? '').trim();
      const uniqueId = String(row[4] ?? '').trim();
      const firstSessionDate = String(row[5] ?? '').trim();

      if (!clientName && !uniqueId) continue;

      for (const stage of SMP_STAGES) {
        const planned = String(row[stage.plannedCol] ?? '').trim();
        const actual = String(row[stage.actualCol] ?? '').trim();
        const status = String(row[stage.statusCol] ?? '').trim();
        const formLink = stage.formLinkCol !== undefined ? String(row[stage.formLinkCol] ?? '').trim() : '';
        const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';

        // Only include if planned date exists and actual date is not completed
        if (!planned) continue;
        if (actual) continue;
        if (status && (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase() === 'true')) continue;

        // Read assignee directly from Who row (Row 3) for this stage, or first doer from Dooer List
        let whoFromSheet = '';
        for (let back = stage.plannedCol; back >= 0; back--) {
          const val = String(whoRow[back] ?? '').trim();
          if (val && !['who', 'assignee', 'assigned to', 'given to', 'who?', 'doer'].includes(val.toLowerCase())) {
            whoFromSheet = val;
            break;
          }
        }
        const assignedTo = whoFromSheet || firstDoerName || 'Gauri';
        const mappedUser = mapFmsNameToSystemUser(assignedTo);

        if (options?.targetUserName) {
          if (!assignedTo || !isFmsNameMatchUser(assignedTo, options.targetUserName)) {
            continue;
          }
        }

        tasks.push({
          sheetRow: i + 7,
          uniqueId: uniqueId || `SMP #${i + 7}`,
          clientName: clientName || '—',
          contactNo,
          city,
          firstSessionDate,
          assignedTo,
          mappedUser,
          stageName: stage.stageName,
          stageKey: stage.stageKey,
          plannedDate: planned,
          actualDate: actual,
          status: 'Pending',
          formLink,
          timeDelay,
        });
      }
    }

    return tasks;
  } catch (err) {
    console.error('Failed to fetch SMP Session FMS tasks:', err);
    throw err;
  }
}
