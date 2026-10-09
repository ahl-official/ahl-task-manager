import { hasGoogleSheetsAuth, readSpreadsheetValues, getSpreadsheetSheetTitles } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

export const TEJAL_FMS_SPREADSHEET_ID = '1ygs0AvyGn6nMyPFq9tMbi8VYcEEkiMW3VT4FSSz9c8w';
export const SEJAL_FMS_SPREADSHEET_ID = '1KFSG0OYgVDokymSK0uBW4iZ6VK0KFrzX-9GByIAn1CM';

export interface StaffWorkflowTask {
  workflowKey: 'tejal-fms' | 'sejal-fms';
  sheetRow: number;
  itemTitle: string;
  category: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
  remarks?: string;
}

interface DynamicStage {
  stageName: string;
  assignedTo: string;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  timeDelayCol?: number;
}

export async function getStaffWorkflowFmsTasks(
  workflowKey: 'tejal-fms' | 'sejal-fms',
  options?: {
    targetUserName?: string;
    role?: UserRole;
  }
): Promise<StaffWorkflowTask[]> {
  const spreadsheetId =
    workflowKey === 'tejal-fms'
      ? process.env.TEJAL_FMS_SPREADSHEET_ID || TEJAL_FMS_SPREADSHEET_ID
      : process.env.SEJAL_FMS_SPREADSHEET_ID || SEJAL_FMS_SPREADSHEET_ID;

  const defaultUser = workflowKey === 'tejal-fms' ? 'Tejal' : 'Sejal';

  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  try {
    // Read header rows A1:AZ6 to detect stages dynamically
    const headerData = await readSpreadsheetValues(
      spreadsheetId,
      `'FMS'!A1:AZ6`,
      'FORMATTED_VALUE',
    );

    const rows = headerData || [];
    const whatRow = rows[1] || []; // Row 2
    const whoRow = rows[2] || [];  // Row 3
    const headerRow = rows[5] || []; // Row 6

    const dynamicStages: DynamicStage[] = [];

    for (let c = 0; c < headerRow.length; c++) {
      const colLabel = String(headerRow[c] ?? '').trim().toLowerCase();
      if (colLabel === 'planned') {
        // Find stage name from "What" row (or previous filled cell in whatRow)
        let stageName = '';
        for (let back = c; back >= 0; back--) {
          if (whatRow[back] && String(whatRow[back]).trim()) {
            stageName = String(whatRow[back]).trim();
            break;
          }
        }
        if (!stageName) {
          stageName = `Stage at Col ${c + 1}`;
        }

        // Find "Who" assignment (looks backward to nearest assigned name, ignoring the 'Who' label)
        let who = '';
        for (let back = c; back >= 0; back--) {
          const val = String(whoRow[back] ?? '').trim();
          if (val && !['who', 'assignee', 'assigned to', 'given to', 'who?', 'doer'].includes(val.toLowerCase())) {
            who = val;
            break;
          }
        }
        if (!who) {
          who = defaultUser;
        }

        dynamicStages.push({
          stageName,
          assignedTo: who,
          plannedCol: c,
          actualCol: c + 1,
          statusCol: c + 2,
          timeDelayCol: c + 3,
        });
      }
    }

    // Now read data rows
    const dataRowsResult = await readSpreadsheetValues(
      spreadsheetId,
      `'FMS'!A7:AZ500`,
      'FORMATTED_VALUE',
    );
    const dataRows = dataRowsResult[0] || [];
    const tasks: StaffWorkflowTask[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!row || row.length === 0) continue;

      const itemTitle = String(row[1] ?? row[2] ?? '').trim();
      const category = String(row[2] ?? row[3] ?? '').trim();

      if (!itemTitle && !category) continue;

      for (const stage of dynamicStages) {
        const planned = String(row[stage.plannedCol] ?? '').trim();
        const actual = String(row[stage.actualCol] ?? '').trim();
        const status = String(row[stage.statusCol] ?? '').trim();
        const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';

        // Only include if planned date exists and actual date is not completed
        if (!planned) continue;
        if (actual) continue;
        if (status && (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase() === 'true')) continue;

        const assignedTo = stage.assignedTo || defaultUser;
        const mappedUser = mapFmsNameToSystemUser(assignedTo);

        if (options?.targetUserName) {
          const matches =
            (assignedTo && isFmsNameMatchUser(assignedTo, options.targetUserName)) ||
            (defaultUser && isFmsNameMatchUser(defaultUser, options.targetUserName));
          if (!matches) {
            continue;
          }
        }

        tasks.push({
          workflowKey,
          sheetRow: i + 7,
          itemTitle: itemTitle || `Task #${i + 7}`,
          category,
          assignedTo,
          mappedUser,
          stageName: stage.stageName,
          plannedDate: planned,
          actualDate: actual,
          status: 'Pending',
          timeDelay,
        });
      }
    }

    return tasks;
  } catch (err: any) {
    console.warn(`Could not load ${workflowKey} FMS (check Google Sheet permissions):`, err?.message || err);
    return [];
  }
}
