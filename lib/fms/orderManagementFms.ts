import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';

export interface OrderManagementTaskItem {
  tabName: string;
  sheetRow: number;
  orderDate: string;
  clientName: string;
  contactNo: string;
  city: string;
  orderNo: string;
  branchOrType: string;
  existingWearer: string;
  deliveryDate: string;
  patchNo?: string;
  totalAmount?: string;
  advancePaid?: string;
  balanceAmount?: string;
  pdfLink?: string;
  orderStatus?: string;
  stepNum: string;
  stepName: string;
  taskDescription: string;
  assignedTo: string;
  mappedUser: string;
  when?: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
}

const ORDER_MANAGEMENT_SPREADSHEET_ID = '1BWQb_mxcwH6XCRpNYWCM_J3fYgZZ3Uq5hshqM0_d0l0';

const O2D_TABS = [
  'Mumbai O2D',
  'Bangalore/Delhi O2D',
  'Local Custom O2D',
  'Online O2D',
  'Mexico Slightly Custom O2D',
];

interface StepDefinition {
  stepNum: string;
  stepName: string;
  taskDescription: string;
  assignedTo: string;
  when: string;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  delayCol: number;
}

function getStr(row: unknown[] | undefined, colIdx: number): string {
  if (!row || colIdx < 0 || colIdx >= row.length) return '';
  const val = row[colIdx];
  return typeof val === 'string' ? val.trim() : (val != null ? String(val).trim() : '');
}

export async function fetchOrderManagementTasks(requestedUser?: string): Promise<OrderManagementTaskItem[]> {
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  const allTasks: OrderManagementTaskItem[] = [];

  for (const tabName of O2D_TABS) {
    try {
      const rawRows = await readSpreadsheetValues(ORDER_MANAGEMENT_SPREADSHEET_ID, `'${tabName}'!A1:AZ2000`, 'FORMATTED_VALUE');
      const rows: unknown[][] = (rawRows && rawRows[0]) || [];
      if (rows.length < 7) continue;

      const rWhat = rows[1] || [];
      const rWho = rows[2] || [];
      const rWhen = rows[4] || [];
      const rHeaders = rows[5] || [];

      const isMumbai = tabName === 'Mumbai O2D';
      const stepStartCol = isMumbai ? 9 : 16;

      const stepDefs: StepDefinition[] = [];
      for (let colIdx = stepStartCol; colIdx < rHeaders.length; colIdx++) {
        const header = getStr(rHeaders, colIdx);
        if (/^step\s*\d+\s*planned$/i.test(header) || (header.includes('Step') && header.includes('Planned') && !header.toLowerCase().includes('completion date'))) {
          const stepMatch = header.match(/Step\s*(\d+)/i);
          const stepNum = stepMatch ? stepMatch[1] : '';
          const taskDescription = getStr(rWhat, colIdx) || header;
          const when = getStr(rWhen, colIdx);

          // Extract assignee directly from Who row (Row 3) for this specific step/stage
          let assignedTo = getStr(rWho, colIdx);
          if (!assignedTo) {
            for (let back = colIdx; back >= stepStartCol; back--) {
              const prevWho = getStr(rWho, back);
              if (prevWho && !['who', 'assignee', 'assigned to', 'given to', 'who?', 'doer'].includes(prevWho.toLowerCase())) {
                assignedTo = prevWho;
                break;
              }
            }
          }

          // Fallback who if still empty based on users permission tab
          if (!assignedTo) {
            if (tabName.includes('Bangalore/Delhi')) {
              if (stepNum === '1' || stepNum === '6') assignedTo = 'Sejal / Zoya';
              else if (stepNum === '2' || stepNum === '3' || stepNum === '4') assignedTo = 'Prashant / Anthony';
              else if (stepNum === '5') assignedTo = 'Parth / Divya';
              else if (stepNum === '7') assignedTo = 'Jagruti';
            }
          }

          // Find actual, status, time delay cols specifically for this step
          let actualCol = colIdx + 1;
          let statusCol = colIdx + 2;
          let delayCol = -1;
          const stepRegex = stepNum ? new RegExp(`step\\s*${stepNum}`, 'i') : null;

          for (let j = colIdx + 1; j < Math.min(colIdx + 8, rHeaders.length); j++) {
            const h = getStr(rHeaders, j).toLowerCase();
            if (h.includes('planned') && !h.includes('completion date')) {
              // Reached next step's planned column
              break;
            }
            if (h.includes('actual') && (!stepRegex || stepRegex.test(h))) {
              actualCol = j;
            }
            if (h.includes('status') && !h.includes('whatsapp') && (!stepRegex || stepRegex.test(h))) {
              statusCol = j;
            }
            if (h.includes('time delay') && (!stepRegex || stepRegex.test(h))) {
              delayCol = j;
            }
          }

          stepDefs.push({
            stepNum,
            stepName: `Step ${stepNum}`,
            taskDescription,
            assignedTo: assignedTo || 'Unassigned',
            when,
            plannedCol: colIdx,
            actualCol,
            statusCol,
            delayCol,
          });
        }
      }

      // Parse data rows starting from row 7 (index 6)
      for (let r = 6; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        const sheetRow = r + 1;

        let orderDate = '';
        let clientName = '';
        let contactNo = '';
        let city = '';
        let orderNo = '';
        let branchOrType = '';
        let existingWearer = '';
        let deliveryDate = '';
        let patchNo = '';
        let totalAmount = '';
        let advancePaid = '';
        let balanceAmount = '';
        let pdfLink = '';
        let orderStatus = '';

        if (isMumbai) {
          orderDate = getStr(row, 0);
          clientName = getStr(row, 1);
          contactNo = getStr(row, 2);
          city = getStr(row, 3);
          orderNo = getStr(row, 4);
          existingWearer = getStr(row, 5);
          deliveryDate = getStr(row, 6);
          pdfLink = getStr(row, 7);
          orderStatus = getStr(row, 8);
          patchNo = getStr(row, 46);
          totalAmount = getStr(row, 47);
          advancePaid = getStr(row, 48);
          balanceAmount = getStr(row, 49);
        } else {
          orderDate = getStr(row, 0);
          clientName = getStr(row, 1);
          contactNo = getStr(row, 2);
          city = getStr(row, 3);
          orderNo = getStr(row, 4);
          branchOrType = getStr(row, 5);
          existingWearer = getStr(row, 6);
          deliveryDate = getStr(row, 7);
          patchNo = getStr(row, 8);
          totalAmount = getStr(row, 9);
          advancePaid = getStr(row, 10);
          balanceAmount = getStr(row, 11);
          pdfLink = getStr(row, 14);
          orderStatus = getStr(row, 15);
        }

        if (!clientName && !orderNo) continue;

        for (const step of stepDefs) {
          const plannedDate = getStr(row, step.plannedCol);
          const actualDate = getStr(row, step.actualCol);
          const rawStatus = getStr(row, step.statusCol);
          const timeDelay = step.delayCol !== -1 ? getStr(row, step.delayCol) : '';

          if (!plannedDate) continue;

          const isCompleted = rawStatus.toLowerCase().includes('complete') || rawStatus.toLowerCase().includes('done') || rawStatus.toLowerCase() === 'true' || rawStatus.toLowerCase() === 'yes' || !!actualDate;
          if (isCompleted) continue; // Only pending tasks (actual date or done must not be present)

          const assignedTo = step.assignedTo;
          const mappedUser = mapFmsNameToSystemUser(assignedTo);

          // User filter if requested (strictly based on stage assignee from Who row)
          if (requestedUser && requestedUser !== 'all') {
            if (!assignedTo || !isFmsNameMatchUser(assignedTo, requestedUser)) {
              continue;
            }
          }

          allTasks.push({
            tabName,
            sheetRow,
            orderDate,
            clientName,
            contactNo,
            city,
            orderNo,
            branchOrType,
            existingWearer,
            deliveryDate,
            patchNo,
            totalAmount,
            advancePaid,
            balanceAmount,
            pdfLink,
            orderStatus,
            stepNum: step.stepNum,
            stepName: step.stepName,
            taskDescription: step.taskDescription,
            assignedTo,
            mappedUser,
            when: step.when,
            plannedDate,
            actualDate,
            status: 'Pending',
            timeDelay,
          });
        }
      }
    } catch (err) {
      console.error(`Error fetching tasks from ${tabName}:`, err);
    }
  }

  return allTasks;
}
