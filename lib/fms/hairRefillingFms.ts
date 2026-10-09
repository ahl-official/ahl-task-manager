import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

const DEFAULT_HAIR_REFILLING_SPREADSHEET_ID = '1_0ul30QHPKXW3HDtb3IfyAYqJcCRfPPCZ1wBoJw4fio';
const SHEET_TITLE = 'FMS';

export interface HairRefillingTask {
  sheetRow: number;
  jobCode: string;
  technicianName: string;
  clientName: string;
  contactNo: string;
  pieceType: string;
  refillingPercent: string;
  labourAssignedTo: string;
  mappedUser: string;
  deliveryDate: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
}

interface StageDefinition {
  stageName: string;
  stageKey: string;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  timeDelayCol?: number;
}

const REFILLING_STAGES: StageDefinition[] = [
  {
    stageName: 'Labour Collection & Technician Briefing',
    stageKey: 'labour_collect_briefing',
    plannedCol: 9,   // Col J
    actualCol: 10,   // Col K
    statusCol: 11,   // Col L
    timeDelayCol: 13,// Col N
  },
  {
    stageName: 'Labour Refilling Work & Tech Approval',
    stageKey: 'labour_work_approval',
    plannedCol: 15,  // Col P
    actualCol: 16,   // Col Q
    statusCol: 17,   // Col R
    timeDelayCol: 18,// Col S
  },
  {
    stageName: 'Technician Approval Check',
    stageKey: 'technician_approval_check',
    plannedCol: 19,  // Col T
    actualCol: 20,   // Col U
    statusCol: 21,   // Col V
    timeDelayCol: 22,// Col W
  },
  {
    stageName: 'Labour Rework (if required)',
    stageKey: 'labour_rework',
    plannedCol: 25,  // Col Z
    actualCol: 26,   // Col AA
    statusCol: 27,   // Col AB
    timeDelayCol: 28,// Col AC
  },
  {
    stageName: 'Deliver to Client',
    stageKey: 'deliver_to_client',
    plannedCol: 29,  // Col AD
    actualCol: 30,   // Col AE
    statusCol: 31,   // Col AF
    timeDelayCol: 32,// Col AG
  },
];

export function hairRefillingSpreadsheetId(): string {
  return process.env.HAIR_REFILLING_FMS_SPREADSHEET_ID || DEFAULT_HAIR_REFILLING_SPREADSHEET_ID;
}

export async function getHairRefillingFmsTasks(options?: {
  targetUserName?: string;
  role?: UserRole;
  registeredUserNames?: string[];
}): Promise<HairRefillingTask[]> {
  const spreadsheetId = hairRefillingSpreadsheetId();
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
      `'${SHEET_TITLE}'!A7:AJ500`,
      'FORMATTED_VALUE',
    );
    const rows = results[0] || [];
    const tasks: HairRefillingTask[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const technicianName = String(row[1] ?? '').trim();
      const clientName = String(row[2] ?? '').trim();
      const contactNo = String(row[3] ?? '').trim();
      const jobCode = String(row[4] ?? '').trim();
      const pieceType = String(row[5] ?? '').trim();
      const refillingPercent = String(row[6] ?? '').trim();
      const deliveryDate = String(row[8] ?? '').trim();

      if (!jobCode && !clientName) continue;

      for (const stage of REFILLING_STAGES) {
        const planned = String(row[stage.plannedCol] ?? '').trim();
        const actual = String(row[stage.actualCol] ?? '').trim();
        const status = String(row[stage.statusCol] ?? '').trim();
        const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';

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
        const labourAssignedTo = whoFromSheet || 'Prashant';
        const mappedUser = mapFmsNameToSystemUser(labourAssignedTo);

        // Filter for specific user if requested
        if (options?.targetUserName) {
          if (!labourAssignedTo || !isFmsNameMatchUser(labourAssignedTo, options.targetUserName)) {
            continue;
          }
        }

        tasks.push({
          sheetRow: i + 7,
          jobCode: jobCode || `Job #${i + 7}`,
          technicianName,
          clientName: clientName || '—',
          contactNo,
          pieceType,
          refillingPercent,
          labourAssignedTo,
          mappedUser,
          deliveryDate,
          stageName: stage.stageName,
          stageKey: stage.stageKey,
          plannedDate: planned,
          actualDate: actual,
          status: 'Pending',
          timeDelay,
        });
      }
    }

    return tasks;
  } catch (err) {
    console.error('Failed to fetch Hair Refilling FMS tasks:', err);
    throw err;
  }
}
