import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

const DEFAULT_PRODUCT_LAUNCH_SPREADSHEET_ID = '1xWyFjRY3bfFLYHxVCXasfJNa6yycQGsao_0MTZVSrhs';
const SHEET_TITLE = 'FMS';

export interface ProductLaunchTask {
  sheetRow: number;
  productName: string;
  category: string;
  subCategory: string;
  companyName: string;
  stageName: string;
  assignedTo: string;
  mappedUser: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
  score?: string;
  technicianName?: string;
  remarks?: string;
}

interface StageDefinition {
  stageName: string;
  who: string;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  timeDelayCol?: number;
  scoreCol?: number;
  technicianCol?: number;
  remarksCol?: number;
}

const STAGES: StageDefinition[] = [
  {
    stageName: 'Trial and Feedback on Model/Clients',
    who: 'Satvik',
    plannedCol: 5,   // Col F
    actualCol: 6,    // Col G
    statusCol: 7,    // Col H
    timeDelayCol: 8, // Col I
    scoreCol: 9,     // Col J
    technicianCol: 10, // Col K
    remarksCol: 11,  // Col L
  },
  {
    stageName: 'Product/Service (Approved / Not Approved)',
    who: 'Satvik',
    plannedCol: 12,  // Col M
    actualCol: 13,   // Col N
    statusCol: 14,   // Col O
    timeDelayCol: 15, // Col P
  },
  {
    stageName: 'Staff Training of New Product/Service',
    who: 'Satvik',
    plannedCol: 16,  // Col Q
    actualCol: 17,   // Col R
    statusCol: 18,   // Col S
    timeDelayCol: 19, // Col T
  },
  {
    stageName: 'Product/Service Launched (Available)',
    who: 'Satvik',
    plannedCol: 20,  // Col U
    actualCol: 21,   // Col V
    statusCol: 22,   // Col W
    timeDelayCol: 23, // Col X
  },
];

export function productLaunchSpreadsheetId(): string {
  return process.env.PRODUCT_LAUNCH_FMS_SPREADSHEET_ID || DEFAULT_PRODUCT_LAUNCH_SPREADSHEET_ID;
}

export async function getProductLaunchFmsTasks(options?: {
  targetUserName?: string;
  role?: UserRole;
}): Promise<ProductLaunchTask[]> {
  const spreadsheetId = productLaunchSpreadsheetId();
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
      `'${SHEET_TITLE}'!A7:AZ500`,
      'FORMATTED_VALUE',
    );
    const rows = results[0] || [];
    const tasks: ProductLaunchTask[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const productName = String(row[1] ?? '').trim();
      const category = String(row[2] ?? '').trim();
      const subCategory = String(row[3] ?? '').trim();
      const companyName = String(row[4] ?? '').trim();

      if (!productName && !category) continue;

      for (const stage of STAGES) {
        const planned = String(row[stage.plannedCol] ?? '').trim();
        const actual = String(row[stage.actualCol] ?? '').trim();
        const status = String(row[stage.statusCol] ?? '').trim();
        const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';
        const score = stage.scoreCol !== undefined ? String(row[stage.scoreCol] ?? '').trim() : '';
        const technicianName = stage.technicianCol !== undefined ? String(row[stage.technicianCol] ?? '').trim() : '';
        const remarks = stage.remarksCol !== undefined ? String(row[stage.remarksCol] ?? '').trim() : '';

        // Only include if planned date exists and actual date is not completed
        if (!planned) continue;
        if (actual) continue;
        if (status && (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase() === 'true')) continue;

        // Read assignee directly from Who row (Row 3) for this stage (looks backward to nearest name)
        let whoFromSheet = '';
        for (let back = stage.plannedCol; back >= 0; back--) {
          const val = String(whoRow[back] ?? '').trim();
          if (val && !['who', 'assignee', 'assigned to', 'given to', 'who?', 'doer'].includes(val.toLowerCase())) {
            whoFromSheet = val;
            break;
          }
        }
        const assignedTo = whoFromSheet || 'Satvik';
        const mappedUser = mapFmsNameToSystemUser(assignedTo);

        // Filter for specific user if requested
        if (options?.targetUserName) {
          if (!assignedTo || !isFmsNameMatchUser(assignedTo, options.targetUserName)) {
            continue;
          }
        }

        tasks.push({
          sheetRow: i + 7,
          productName: productName || `Item #${i + 7}`,
          category,
          subCategory,
          companyName,
          stageName: stage.stageName,
          assignedTo,
          mappedUser,
          plannedDate: planned,
          actualDate: actual,
          status: 'Pending',
          timeDelay,
          score,
          technicianName,
          remarks,
        });
      }
    }

    return tasks;
  } catch (err) {
    console.error('Failed to fetch Product Launch FMS tasks:', err);
    throw err;
  }
}
