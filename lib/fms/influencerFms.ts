import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

export const DEFAULT_INFLUENCER_FMS_SPREADSHEET_ID = '1ih4o0P8QjAvr_9iO8RPfAKV_xGCaoJn95EN9KCtmuR0';

export interface InfluencerFmsTask {
  tab: string;
  sheetRow: number;
  uniqueId: string;
  influencerName: string;
  platform: string;
  instagramId: string;
  contactNo?: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: 'Done' | 'Pending' | string;
  formLink?: string;
  timeDelay?: string;
  remarks?: string;
}

interface StageDef {
  stageName: string;
  stageKey: string;
  defaultWho: string;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  formLinkCol?: number;
  timeDelayCol?: number;
}

const INSTAGRAM_CONTACT_STAGES: StageDef[] = [
  {
    stageName: 'Send DM on Instagram',
    stageKey: 'send_dm',
    defaultWho: 'Baggy',
    plannedCol: 6,
    actualCol: 7,
    statusCol: 8,
    timeDelayCol: 9,
  },
  {
    stageName: 'Reply Follow Up',
    stageKey: 'reply_followup',
    defaultWho: 'Baggy',
    plannedCol: 10,
    actualCol: 11,
    statusCol: 12,
    timeDelayCol: 13,
  },
  {
    stageName: 'Ask for WhatsApp Number',
    stageKey: 'ask_whatsapp',
    defaultWho: 'Baggy',
    plannedCol: 14,
    actualCol: 15,
    statusCol: 16,
    timeDelayCol: 17,
  },
  {
    stageName: 'Handover Number / Offer Email',
    stageKey: 'handover_number',
    defaultWho: 'Baggy',
    plannedCol: 18,
    actualCol: 19,
    statusCol: 20,
    formLinkCol: 22,
    timeDelayCol: 23,
  },
];

const CALL_TO_SHOOT_STAGES: StageDef[] = [
  {
    stageName: 'Call Influencer & Fix Meeting',
    stageKey: 'call_influencer',
    defaultWho: 'Baggy',
    plannedCol: 7,
    actualCol: 8,
    statusCol: 9,
    timeDelayCol: 12,
  },
  {
    stageName: 'Confirm Meeting & Salon Visit',
    stageKey: 'confirm_meeting',
    defaultWho: 'Baggy',
    plannedCol: 13,
    actualCol: 14,
    statusCol: 15,
    formLinkCol: 16,
    timeDelayCol: 17,
  },
  {
    stageName: '3 Times Follow Up',
    stageKey: 'followup_3x',
    defaultWho: 'Baggy',
    plannedCol: 18,
    actualCol: 19,
    statusCol: 20,
    timeDelayCol: 22,
  },
  {
    stageName: 'Schedule Shoot Date & Time',
    stageKey: 'schedule_shoot',
    defaultWho: 'Baggy',
    plannedCol: 23,
    actualCol: 24,
    statusCol: 25,
    formLinkCol: 27,
    timeDelayCol: 33,
  },
];

const SHOOT_TO_UPLOAD_STAGES: StageDef[] = [
  {
    stageName: 'Video Edit Done & Sent to Baggy',
    stageKey: 'video_edit_sent',
    defaultWho: 'Mohit',
    plannedCol: 11,
    actualCol: 12,
    statusCol: 13,
    timeDelayCol: 14,
  },
  {
    stageName: 'Post on Platform & Check Collaboration',
    stageKey: 'post_collaboration',
    defaultWho: 'Baggy',
    plannedCol: 15,
    actualCol: 16,
    statusCol: 17,
    timeDelayCol: 18,
  },
  {
    stageName: 'Follow Up & Escalate to Bhagyashree',
    stageKey: 'followup_escalate',
    defaultWho: 'Baggy',
    plannedCol: 19,
    actualCol: 20,
    statusCol: 21,
    timeDelayCol: 22,
  },
  {
    stageName: 'Process Completed',
    stageKey: 'process_completed',
    defaultWho: 'Baggy',
    plannedCol: 23,
    actualCol: 24,
    statusCol: 25,
    timeDelayCol: 26,
  },
];

export async function getInfluencerFmsTasks(options?: {
  targetUserName?: string;
  role?: UserRole;
}): Promise<InfluencerFmsTask[]> {
  const spreadsheetId = process.env.INFLUENCER_FMS_SPREADSHEET_ID || DEFAULT_INFLUENCER_FMS_SPREADSHEET_ID;
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  const tasks: InfluencerFmsTask[] = [];

  const tabConfigs = [
    {
      tabName: 'Influencer Instagram Contact FMS',
      stages: INSTAGRAM_CONTACT_STAGES,
      range: "'Influencer Instagram Contact FMS'!A3:AZ500",
      influencerNameCol: 1,
      platformCol: 2,
      instagramIdCol: 3,
      uniqueIdCol: 4,
      contactNoCol: 21,
      remarksCol: 5,
    },
    {
      tabName: 'Call to Shoot FMS',
      stages: CALL_TO_SHOOT_STAGES,
      range: "'Call to Shoot FMS'!A3:AZ500",
      influencerNameCol: 1,
      platformCol: 2,
      instagramIdCol: 3,
      uniqueIdCol: 4,
      contactNoCol: 5,
      remarksCol: 6,
    },
  ];

  for (const config of tabConfigs) {
    try {
      const results = await readSpreadsheetValues(spreadsheetId, config.range, 'FORMATTED_VALUE');
      const allRows = results[0] || [];
      if (allRows.length === 0) continue;

      // Row 3 in Google Sheets is index 0 (Who row)
      const whoRow = allRows[0] || [];
      // Data rows start from row 7 (index 4)
      const dataRows = allRows.slice(4);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0) continue;

        const influencerName = String(row[config.influencerNameCol] ?? '').trim();
        const uniqueId = String(row[config.uniqueIdCol] ?? '').trim();
        const platform = String(row[config.platformCol] ?? '').trim();
        const instagramId = config.instagramIdCol >= 0 ? String(row[config.instagramIdCol] ?? '').trim() : '';
        const contactNo = config.contactNoCol >= 0 ? String(row[config.contactNoCol] ?? '').trim() : '';
        const remarks = config.remarksCol >= 0 ? String(row[config.remarksCol] ?? '').trim() : '';

        if (!influencerName && !uniqueId) continue;

        for (const stage of config.stages) {
          const planned = String(row[stage.plannedCol] ?? '').trim();
          const actual = String(row[stage.actualCol] ?? '').trim();
          const status = String(row[stage.statusCol] ?? '').trim();
          const formLink = stage.formLinkCol !== undefined ? String(row[stage.formLinkCol] ?? '').trim() : '';
          const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';

          // 1. Planned date filter
          if (!planned) continue;

          // Assignee directly from Who row (Row 3)
          let rawWho = '';
          for (let back = stage.plannedCol; back >= 0; back--) {
            const val = String(whoRow[back] ?? '').trim();
            if (val && !['who', 'assignee', 'assigned to', 'given to', 'who?', 'doer'].includes(val.toLowerCase())) {
              rawWho = val;
              break;
            }
          }
          if (!rawWho) {
            rawWho = stage.defaultWho;
          }
          const mappedUser = mapFmsNameToSystemUser(rawWho);

          // Filter by user if targetUserName is specified (never return unassigned to non-admin user)
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

          tasks.push({
            tab: config.tabName,
            sheetRow: i + 7,
            uniqueId: uniqueId || `Influ #${i + 7}`,
            influencerName: influencerName || `Influencer #${i + 7}`,
            platform,
            instagramId,
            contactNo,
            assignedTo: rawWho,
            mappedUser,
            stageName: stage.stageName,
            stageKey: stage.stageKey,
            plannedDate: planned,
            actualDate: actual,
            status: isCompleted ? (status || 'Done') : 'Pending',
            formLink,
            timeDelay,
            remarks,
          });
        }
      }
    } catch (err) {
      console.error(`Failed to fetch ${config.tabName} tasks:`, err);
    }
  }

  return tasks;
}
