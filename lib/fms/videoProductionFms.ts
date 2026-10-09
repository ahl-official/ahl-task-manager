import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import { uploadFmsSpreadsheetId } from './uploadFms';
import type { UserRole } from '@/types';

export interface VideoProductionTask {
  tab: 'Idea To Shoot FMS' | 'Shoot To Edit FMS';
  sheetRow: number;
  uniqueId: string;
  title: string;
  description: string;
  referenceLink: string;
  category: string;
  companyName: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  actionType: 'done' | 'approval' | 'yes_no' | 'link_only';
  plannedDate: string;
  actualDate: string;
  status: 'Done' | 'Pending' | 'Approved' | 'Rejected' | string;
  formLink: string;
  timeDelay?: string;
  remarks?: string;
}

interface StageDefinition {
  stageName: string;
  stageKey: string;
  defaultWho: string;
  whoCol?: number; // row-level specific override column (e.g., Shoot Done By)
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  formLinkCol?: number;
  timeDelayCol?: number;
  actionType: 'done' | 'approval' | 'yes_no';
}

const IDEA_TO_SHOOT_STAGES: StageDefinition[] = [
  {
    stageName: 'Script Writing',
    stageKey: 'script_writing',
    defaultWho: 'Madhura',
    plannedCol: 7, // Col H
    actualCol: 8,  // Col I
    statusCol: 9,  // Col J
    timeDelayCol: 10,
    actionType: 'done',
  },
  {
    stageName: 'Script Approval',
    stageKey: 'script_approval',
    defaultWho: 'Madhura',
    plannedCol: 11, // Col L
    actualCol: 12,  // Col M
    statusCol: 13,  // Col N
    timeDelayCol: 14,
    actionType: 'approval',
  },
  {
    stageName: 'Model Required ?',
    stageKey: 'model_required',
    defaultWho: 'Madhura',
    plannedCol: 16, // Col Q
    actualCol: 17,  // Col R
    statusCol: 18,  // Col S
    timeDelayCol: 19,
    actionType: 'yes_no',
  },
  {
    stageName: 'Script Ready For Shoot',
    stageKey: 'ready_for_shoot',
    defaultWho: 'Madhura',
    plannedCol: 20, // Col U
    actualCol: 21,  // Col V
    statusCol: 22,  // Col W
    timeDelayCol: 23,
    actionType: 'done',
  },
];

const SHOOT_TO_EDIT_STAGES: StageDefinition[] = [
  {
    stageName: 'Decide Shoot Date with Sir & Check Modal',
    stageKey: 'decide_shoot_date',
    defaultWho: 'Mohit',
    plannedCol: 8,  // Col I
    actualCol: 9,   // Col J
    statusCol: 10,  // Col K
    formLinkCol: 11,// Col L
    timeDelayCol: 13,
    actionType: 'done',
  },
  {
    stageName: 'Shoot Done ?',
    stageKey: 'shoot_done',
    defaultWho: 'Mohit',
    whoCol: 18,     // Col S ("Shoot Done by")
    plannedCol: 14, // Col O
    actualCol: 15,  // Col P
    statusCol: 16,  // Col Q
    formLinkCol: 17,// Col R
    timeDelayCol: 20,
    actionType: 'done',
  },
  {
    stageName: 'Organise Data & Maintain in Sheet',
    stageKey: 'organize_data',
    defaultWho: 'Mohit',
    plannedCol: 21, // Col V
    actualCol: 22,  // Col W
    statusCol: 23,  // Col X
    timeDelayCol: 24,
    actionType: 'done',
  },
  {
    stageName: 'Edit Done & Approved by Sir ?',
    stageKey: 'edit_approved',
    defaultWho: 'Mohit',
    plannedCol: 26, // Col AA
    actualCol: 27,  // Col AB
    statusCol: 28,  // Col AC
    formLinkCol: 31,// Col AF
    timeDelayCol: 29,
    actionType: 'approval',
  },
  {
    stageName: 'Thumbnail Ready ?',
    stageKey: 'thumbnail_ready',
    defaultWho: 'Rohit',
    plannedCol: 32, // Col AG
    actualCol: 33,  // Col AH
    statusCol: 34,  // Col AI
    timeDelayCol: 35,
    actionType: 'done',
  },
];

export async function getVideoProductionFmsTasks(
  tabName: 'Idea To Shoot FMS' | 'Shoot To Edit FMS',
  options?: { targetUserName?: string; role?: UserRole }
): Promise<VideoProductionTask[]> {
  const spreadsheetId = uploadFmsSpreadsheetId();
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  const stages = tabName === 'Idea To Shoot FMS' ? IDEA_TO_SHOOT_STAGES : SHOOT_TO_EDIT_STAGES;

  try {
    const results = await readSpreadsheetValues(
      spreadsheetId,
      `'${tabName}'!A3:AZ500`,
      'FORMATTED_VALUE',
    );
    const allRows = results[0] || [];
    if (allRows.length === 0) return [];

    // Row 3 in Google Sheets is index 0 here ("Who" row)
    const whoRow = allRows[0] || [];

    // Data rows start from row 7 (index 4 in allRows)
    const dataRows = allRows.slice(4);
    const tasks: VideoProductionTask[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!row || row.length === 0) continue;

      const title = String(row[1] ?? '').trim();
      const description = String(row[2] ?? '').trim();
      const referenceLink = String(row[3] ?? '').trim();
      const category = String(row[4] ?? '').trim();
      const companyName = String(row[5] ?? '').trim();
      const uniqueId = String(row[6] ?? '').trim();
      const remarks = tabName === 'Shoot To Edit FMS' ? String(row[7] ?? '').trim() : '';

      if (!title && !uniqueId) continue;

      for (const stage of stages) {
        const planned = String(row[stage.plannedCol] ?? '').trim();
        const actual = String(row[stage.actualCol] ?? '').trim();
        const status = String(row[stage.statusCol] ?? '').trim();
        let formLink = stage.formLinkCol !== undefined ? String(row[stage.formLinkCol] ?? '').trim() : '';
        const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';

        // 1. Planned date requirement: "when planned date is there show only those in fms if no planned date dont fetch for fms"
        if (!planned) continue;

        // Determine assigned user for this specific stage from Row 3 ("Who" row)
        let rawWho = String(whoRow[stage.plannedCol] ?? '').trim() || stage.defaultWho;
        if (stage.whoCol !== undefined && row[stage.whoCol]) {
          rawWho = String(row[stage.whoCol]).trim() || rawWho;
        }

        const mappedUser = mapFmsNameToSystemUser(rawWho);

        // Filter for specific user if requested (never return unassigned to non-admin user)
        if (options?.targetUserName) {
          if (!rawWho || !isFmsNameMatchUser(rawWho, options.targetUserName)) {
            continue;
          }
        }

        const isCompleted = Boolean(
          actual || (status && status.toLowerCase() !== 'pending' && status !== 'false' && status !== '0' && (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase() === 'true'))
        );

        // Only include active pending tasks (planned present, actual/done not present)
        if (actual || isCompleted) continue;

        // Determine action type: if formLink is present, link_only applies
        let actionType = stage.actionType;
        if (formLink && formLink.startsWith('http')) {
          actionType = 'link_only' as any;
        }

        tasks.push({
          tab: tabName,
          sheetRow: i + 7,
          uniqueId: uniqueId || `ID #${i + 7}`,
          title: title || `Idea #${i + 7}`,
          description,
          referenceLink,
          category,
          companyName,
          assignedTo: rawWho,
          mappedUser,
          stageName: stage.stageName,
          stageKey: stage.stageKey,
          actionType,
          plannedDate: planned,
          actualDate: actual,
          status: isCompleted ? (status || 'Done') : 'Pending',
          formLink,
          timeDelay,
          remarks,
        });
      }
    }

    return tasks;
  } catch (err) {
    console.error(`Failed to fetch ${tabName} tasks:`, err);
    throw err;
  }
}
