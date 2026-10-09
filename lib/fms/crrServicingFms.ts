import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

export const DEFAULT_CRR_SERVICING_SPREADSHEET_ID = '1lHTH3Jj9s1SaMc1k5dB0IvwhBEjzdBr9a4Ai3VRbYKg';
export const SHEET_TITLE = 'CRR FMS';

export interface CrrServicingTask {
  sheetRow: number;
  customerName: string;
  contactNo: string;
  city: string;
  serviceName: string;
  invoiceNo: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
  callAttempt?: string;
  formLink?: string;
}

interface StageDefinition {
  stageName: string;
  stageKey: string;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  timeDelayCol?: number;
  callAttemptCol?: number;
  formLinkCol?: number;
}

const CRR_STAGES: StageDefinition[] = [
  {
    stageName: 'Feedback Call & Tentative Day',
    stageKey: 'feedback_call',
    plannedCol: 6,
    actualCol: 7,
    statusCol: 8,
    timeDelayCol: 9,
    callAttemptCol: 10,
    formLinkCol: 11,
  },
  {
    stageName: 'Follow Up Reminder & Book Appointment',
    stageKey: 'followup_reminder',
    plannedCol: 14,
    actualCol: 15,
    statusCol: 16,
    timeDelayCol: 17,
    callAttemptCol: 18,
    formLinkCol: 19,
  },
];

export async function getCrrServicingFmsTasks(options?: {
  targetUserName?: string;
  role?: UserRole;
}): Promise<CrrServicingTask[]> {
  const spreadsheetId = process.env.CRR_SERVICING_FMS_SPREADSHEET_ID || DEFAULT_CRR_SERVICING_SPREADSHEET_ID;
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  try {
    // Read Users tab to fetch all authorized users for this sheet
    const authorizedUsers: string[] = [];
    const userTabCandidates = ['Users', 'User', 'User List', 'Users List', 'Doer List', 'Dooer List'];
    for (const uTab of userTabCandidates) {
      try {
        const usersResult = await readSpreadsheetValues(
          spreadsheetId,
          `'${uTab}'!A1:D100`,
          'FORMATTED_VALUE',
        );
        const userRows = usersResult || [];
        for (const uRow of userRows) {
          if (!uRow || uRow.length === 0) continue;
          for (const cell of uRow) {
            const val = String(cell ?? '').trim();
            if (
              val &&
              !['username', 'user', 'name', 'password', 'role', 'sr', 'no', 'sr.', 'sr no', 'email', 'status', 'admin', 'pass'].includes(val.toLowerCase()) &&
              val.length > 1
            ) {
              authorizedUsers.push(val);
            }
          }
        }
        if (authorizedUsers.length > 0) break;
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
    const tasks: CrrServicingTask[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const customerName = String(row[1] ?? '').trim();
      const contactNo = String(row[2] ?? '').trim();
      const city = String(row[3] ?? '').trim();
      const serviceName = String(row[4] ?? '').trim();
      const invoiceNo = String(row[5] ?? '').trim();

      if (!customerName && !invoiceNo) continue;

      for (const stage of CRR_STAGES) {
        const planned = String(row[stage.plannedCol] ?? '').trim();
        const actual = String(row[stage.actualCol] ?? '').trim();
        const status = String(row[stage.statusCol] ?? '').trim();
        const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';
        const callAttempt = stage.callAttemptCol !== undefined ? String(row[stage.callAttemptCol] ?? '').trim() : '';
        const formLink = stage.formLinkCol !== undefined ? String(row[stage.formLinkCol] ?? '').trim() : '';

        // Only include if planned date exists and actual date is not completed
        if (!planned) continue;
        if (actual) continue;
        if (status && (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase() === 'true')) continue;

        // Read assignee directly from Who row (Row 3) for this stage
        let whoFromSheet = '';
        for (let back = stage.plannedCol; back >= 0; back--) {
          const val = String(whoRow[back] ?? '').trim();
          if (val && !['who', 'assignee', 'assigned to', 'given to', 'who?', 'doer'].includes(val.toLowerCase())) {
            whoFromSheet = val;
            break;
          }
        }
        const assignedTo = whoFromSheet || 'Ninsi';
        const mappedUser = mapFmsNameToSystemUser(assignedTo);

        if (options?.targetUserName) {
          const isAuthorizedUser =
            authorizedUsers.length > 0
              ? authorizedUsers.some(u => isFmsNameMatchUser(u, options.targetUserName!))
              : isFmsNameMatchUser('Ninsi', options.targetUserName);

          const isDirectAssignee = Boolean(assignedTo && isFmsNameMatchUser(assignedTo, options.targetUserName));

          if (!isAuthorizedUser && !isDirectAssignee) {
            continue;
          }
        }

        tasks.push({
          sheetRow: i + 7,
          customerName: customerName || `Client #${i + 7}`,
          contactNo,
          city,
          serviceName,
          invoiceNo,
          assignedTo,
          mappedUser,
          stageName: stage.stageName,
          stageKey: stage.stageKey,
          plannedDate: planned,
          actualDate: actual,
          status: 'Pending',
          timeDelay,
          callAttempt,
          formLink,
        });
      }
    }

    return tasks;
  } catch (err) {
    console.error('Failed to fetch CRR Servicing FMS tasks:', err);
    throw err;
  }
}
