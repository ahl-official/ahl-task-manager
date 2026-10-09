import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

export const DEFAULT_ORDER_DELIVERY_SPREADSHEET_ID = '1eG8Ywh9E9DTxwkROozBuKGr8Euw5Bani4JI3J4Oxd8M';
export const SHEET_TITLE = 'FMS_Master';

export interface OrderDeliveryTask {
  sheetRow: number;
  orderId: string;
  clientName: string;
  contactNo: string;
  productionType: string;
  subType: string;
  expectedDeliveryDate: string;
  assignedTo: string;
  mappedUser: string;
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

const ORDER_STAGES: StageDefinition[] = [
  {
    stageName: 'Advance & Order Form',
    stageKey: 'advance_order_form',
    plannedCol: 8,
    actualCol: 9,
    statusCol: 10,
    timeDelayCol: 11,
  },
  {
    stageName: 'Production Checked',
    stageKey: 'production_checked',
    plannedCol: 13,
    actualCol: 14,
    statusCol: 15,
    timeDelayCol: 16,
  },
  {
    stageName: 'Quality Check & Ready for Delivery',
    stageKey: 'quality_check',
    plannedCol: 22,
    actualCol: 23,
    statusCol: 24,
    timeDelayCol: 25,
  },
  {
    stageName: 'Appointment & Client Confirmation',
    stageKey: 'appointment_confirmation',
    plannedCol: 27,
    actualCol: 28,
    statusCol: 29,
    timeDelayCol: 30,
  },
  {
    stageName: 'Client Delivery & Handover',
    stageKey: 'client_delivery',
    plannedCol: 33,
    actualCol: 34,
    statusCol: 35,
    timeDelayCol: 36,
  },
];

export async function getOrderDeliveryFmsTasks(options?: {
  targetUserName?: string;
  role?: UserRole;
}): Promise<OrderDeliveryTask[]> {
  const spreadsheetId = process.env.ORDER_DELIVERY_FMS_SPREADSHEET_ID || DEFAULT_ORDER_DELIVERY_SPREADSHEET_ID;
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  try {
    // Read Users tab to fetch all authorized users for this sheet
    const authorizedUsers: string[] = [];
    try {
      const usersResult = await readSpreadsheetValues(
        spreadsheetId,
        `'Users'!A1:D100`,
        'FORMATTED_VALUE',
      );
      const userRows = usersResult || [];
      for (const uRow of userRows) {
        if (!uRow || uRow.length === 0) continue;
        const username = String(uRow[0] ?? '').trim();
        const name = String(uRow[3] ?? uRow[0] ?? '').trim();
        if (
          username &&
          !['username', 'user', 'name', 'sr', 'no'].includes(username.toLowerCase())
        ) {
          authorizedUsers.push(username);
          if (name && name.toLowerCase() !== username.toLowerCase()) {
            authorizedUsers.push(name);
          }
        }
      }
    } catch (e) {
      console.warn('Could not read Users tab in Order to Delivery FMS:', e);
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
    const tasks: OrderDeliveryTask[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const orderId = String(row[1] ?? '').trim();
      const clientName = String(row[2] ?? '').trim();
      const contactNo = String(row[3] ?? '').trim();
      const productionType = String(row[4] ?? '').trim();
      const subType = String(row[5] ?? '').trim();
      const expectedDeliveryDate = String(row[7] ?? '').trim();

      if (!orderId && !clientName) continue;

      for (const stage of ORDER_STAGES) {
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
        const assignedTo = whoFromSheet || 'Aditi';
        const mappedUser = mapFmsNameToSystemUser(assignedTo);

        if (options?.targetUserName) {
          const isAuthorizedUser =
            authorizedUsers.length > 0
              ? authorizedUsers.some(u => isFmsNameMatchUser(u, options.targetUserName!))
              : isFmsNameMatchUser('Aditi', options.targetUserName);

          const isDirectAssignee = Boolean(assignedTo && isFmsNameMatchUser(assignedTo, options.targetUserName));

          if (!isAuthorizedUser && !isDirectAssignee) {
            continue;
          }
        }

        tasks.push({
          sheetRow: i + 7,
          orderId: orderId || `Order #${i + 7}`,
          clientName: clientName || '—',
          contactNo,
          productionType,
          subType,
          expectedDeliveryDate,
          assignedTo,
          mappedUser,
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
    console.error('Failed to fetch Order Delivery FMS tasks:', err);
    throw err;
  }
}
