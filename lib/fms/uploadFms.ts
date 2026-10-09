import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

const DEFAULT_UPLOAD_FMS_SPREADSHEET_ID = '10URWCazGNO7ChsGQW0vM2Z9VgoyvDMeLLrwNd-LvWME';
const SHEET_TITLE = 'Upload FMS';

export interface FmsTask {
  sheetRow: number;
  videoNo: string;
  videoName: string;
  uniqueId: string;
  companyName: string;
  videoType: string;
  editorName: string;
  videoLink: string;
  givenTo: string;
  mappedUser: string;
  priority: string;
  remarks: string;
  scheduleDate: string;
  stageName?: string;
  plannedDate: string;
  actualDate: string;
  status: 'Done' | 'Pending';
  formLink: string;
  timeDelay: string;
}

const UPLOAD_FMS_STAGES = [
  {
    stageName: 'Upload Video',
    plannedCol: 13, // Col N
    actualCol: 14,  // Col O
    statusCol: 15,  // Col P
    formLinkCol: 16,// Col Q
    timeDelayCol: 20,// Col U
  },
  {
    stageName: 'Download & Upload Ad',
    plannedCol: 21, // Col V
    actualCol: 22,  // Col W
    statusCol: 23,  // Col X
    formLinkCol: 24,// Col Y
    timeDelayCol: 25,// Col Z
  },
  {
    stageName: 'Website / Landing Page Upload',
    plannedCol: 32, // Col AG
    actualCol: 33,  // Col AH
    statusCol: 34,  // Col AI
    formLinkCol: 35,// Col AJ
    timeDelayCol: 37,// Col AL
  },
];

export function uploadFmsSpreadsheetId(): string {
  return process.env.UPLOAD_FMS_SPREADSHEET_ID || DEFAULT_UPLOAD_FMS_SPREADSHEET_ID;
}

/**
 * Returns formatted date & time in Indian Standard Time (IST): DD/MM/YYYY HH:mm:ss
 */
export function formatIstTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Fetch all FMS upload tasks from the sheet.
 * If targetUserName is provided, filters tasks assigned to that user (based on "Given To" column).
 */
export async function getUploadFmsTasks(options?: {
  targetUserName?: string;
  role?: UserRole;
}): Promise<FmsTask[]> {
  const spreadsheetId = uploadFmsSpreadsheetId();
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  try {
    // Read header row A1:AZ6 to dynamically fetch the "Who" row (Row 3, index 2)
    const headerResult = await readSpreadsheetValues(
      spreadsheetId,
      `'${SHEET_TITLE}'!A1:AZ6`,
      'FORMATTED_VALUE',
    );
    const whoRow = (headerResult && headerResult[2]) || [];

    const results = await readSpreadsheetValues(
      spreadsheetId,
      `'${SHEET_TITLE}'!A7:AL1500`,
      'FORMATTED_VALUE',
    );
    const rows = results[0] || [];

    const tasks: FmsTask[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const videoNo = String(row[1] ?? '').trim();
      const videoName = String(row[2] ?? '').trim();
      const defaultGivenTo = String(row[8] ?? '').trim();

      // Skip empty placeholder rows
      if (!videoNo && !videoName && !defaultGivenTo) continue;

      // Check each stage in this row
      for (const stage of UPLOAD_FMS_STAGES) {
        const plannedDate = String(row[stage.plannedCol] ?? '').trim();

        // Rule: "when planned date is there show only those in fms if no planned date dont fetch for fms"
        if (!plannedDate) continue;

        const actualDate = String(row[stage.actualCol] ?? '').trim();
        const statusRaw = String(row[stage.statusCol] ?? '').trim();
        const isDone = actualDate !== '' || statusRaw.toLowerCase().includes('done') || statusRaw.toLowerCase().includes('complete') || statusRaw.toLowerCase() === 'true';

        // Only include active pending tasks (planned present, actual/done not present)
        if (actualDate || isDone) continue;

        // Read assignee directly from Who row (Row 3) for this stage
        let stageWho = '';
        for (let back = stage.plannedCol; back >= 0; back--) {
          const val = String(whoRow[back] ?? '').trim();
          if (val && !['who', 'assignee', 'assigned to', 'given to', 'who?', 'doer'].includes(val.toLowerCase())) {
            stageWho = val;
            break;
          }
        }
        const givenTo = stageWho || defaultGivenTo;
        const mappedUser = mapFmsNameToSystemUser(givenTo);

        if (options?.targetUserName) {
          if (!givenTo || !isFmsNameMatchUser(givenTo, options.targetUserName)) {
            continue;
          }
        }

        tasks.push({
          sheetRow: i + 7, // 1-based row index in Google Sheets
          videoNo,
          videoName: videoName || `Video #${videoNo}`,
          uniqueId: String(row[3] ?? '').trim(),
          companyName: String(row[4] ?? '').trim(),
          videoType: String(row[5] ?? '').trim(),
          editorName: String(row[6] ?? '').trim(),
          videoLink: String(row[7] ?? '').trim(),
          givenTo,
          mappedUser,
          priority: String(row[10] ?? '').trim(),
          remarks: String(row[11] ?? '').trim(),
          scheduleDate: String(row[12] ?? '').trim(),
          stageName: stage.stageName,
          plannedDate,
          actualDate,
          status: isDone ? 'Done' : 'Pending',
          formLink: String(row[stage.formLinkCol] ?? '').trim(),
          timeDelay: String(row[stage.timeDelayCol] ?? '').trim(),
        });
      }
    }

    return tasks;
  } catch (err) {
    console.error('Failed to fetch Upload FMS tasks:', err);
    throw err;
  }
}
