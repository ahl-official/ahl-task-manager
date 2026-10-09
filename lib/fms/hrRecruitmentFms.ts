import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

export const DEFAULT_HR_RECRUITMENT_SPREADSHEET_ID = '1nhVkF5OYNLEjoMwcaoByxU5S6mKuxWUfR9cee-rOcps';
export const SHEET_TITLE = 'Recruitment_to_Exit_Fms';

export interface HrRecruitmentTask {
  sheetRow: number;
  recruitmentId: string;
  candidateName: string;
  contactNo: string;
  department: string;
  hiringManager: string;
  jobTitle: string;
  candidateId: string;
  deadline: string;
  assignedTo: string;
  mappedUser: string;
  stageName: string;
  stageKey: string;
  plannedDate: string;
  actualDate: string;
  status: string;
  timeDelay?: string;
  formLink?: string;
}

interface StageDefinition {
  stageName: string;
  stageKey: string;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  timeDelayCol?: number;
  formLinkCol?: number;
}

const HR_STAGES: StageDefinition[] = [
  {
    stageName: 'Application Status',
    stageKey: 'app_status',
    plannedCol: 9,
    actualCol: 10,
    statusCol: 11,
    formLinkCol: 12,
    timeDelayCol: 15,
  },
  {
    stageName: 'Pre-screening (HR interview)',
    stageKey: 'prescreening',
    plannedCol: 16,
    actualCol: 17,
    statusCol: 18,
    timeDelayCol: 20,
    formLinkCol: 21,
  },
  {
    stageName: 'Confirmation Call',
    stageKey: 'confirmation_call',
    plannedCol: 22,
    actualCol: 23,
    statusCol: 24,
    timeDelayCol: 25,
  },
  {
    stageName: 'Joining Date',
    stageKey: 'joining_date',
    plannedCol: 26,
    actualCol: 27,
    statusCol: 28,
    formLinkCol: 30,
    timeDelayCol: 31,
  },
  {
    stageName: 'Onboarding',
    stageKey: 'onboarding',
    plannedCol: 32,
    actualCol: 33,
    statusCol: 34,
    formLinkCol: 36,
    timeDelayCol: 37,
  },
  {
    stageName: 'Exit Notification & HR Formalities',
    stageKey: 'exit_formalities',
    plannedCol: 40,
    actualCol: 41,
    statusCol: 42,
    formLinkCol: 44,
    timeDelayCol: 45,
  },
  {
    stageName: 'Assets & HR Documents Clearance',
    stageKey: 'assets_clearance',
    plannedCol: 46,
    actualCol: 47,
    statusCol: 48,
    formLinkCol: 49,
    timeDelayCol: 50,
  },
];

export async function getHrRecruitmentFmsTasks(options?: {
  targetUserName?: string;
  role?: UserRole;
}): Promise<HrRecruitmentTask[]> {
  const spreadsheetId = process.env.HR_RECRUITMENT_FMS_SPREADSHEET_ID || DEFAULT_HR_RECRUITMENT_SPREADSHEET_ID;
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  try {
    const results = await readSpreadsheetValues(
      spreadsheetId,
      `'${SHEET_TITLE}'!A7:BA500`,
      'FORMATTED_VALUE',
    );
    const rows = results[0] || [];
    const tasks: HrRecruitmentTask[] = [];

    // HR FMS is shared by Rakesh, Sanjana, and Amit
    const hrTeam = ['Rakesh', 'Sanjana', 'Amit'];

    if (options?.targetUserName) {
      const isHrUser = hrTeam.some(u => isFmsNameMatchUser(u, options.targetUserName!));
      if (!isHrUser) {
        return [];
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const recruitmentId = String(row[1] ?? '').trim();
      const candidateName = String(row[2] ?? '').trim();
      const contactNo = String(row[3] ?? '').trim();
      const department = String(row[4] ?? '').trim();
      const hiringManager = String(row[5] ?? '').trim();
      const jobTitle = String(row[6] ?? '').trim();
      const candidateId = String(row[7] ?? '').trim();
      const deadline = String(row[8] ?? '').trim();

      if (!recruitmentId && !candidateName) continue;

      for (const stage of HR_STAGES) {
        const planned = String(row[stage.plannedCol] ?? '').trim();
        const actual = String(row[stage.actualCol] ?? '').trim();
        const status = String(row[stage.statusCol] ?? '').trim();
        const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';
        const formLink = stage.formLinkCol !== undefined ? String(row[stage.formLinkCol] ?? '').trim() : '';

        // Only include if planned date exists and actual date is not completed
        if (!planned) continue;
        if (actual) continue;
        if (status && (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase() === 'true')) continue;

        const assignedTo = 'Rakesh / Sanjana / Amit';
        const mappedUser = 'Rakesh / Sanjana / Amit';

        tasks.push({
          sheetRow: i + 7,
          recruitmentId: recruitmentId || `REC #${i + 7}`,
          candidateName: candidateName || '—',
          contactNo,
          department,
          hiringManager,
          jobTitle,
          candidateId,
          deadline,
          assignedTo,
          mappedUser,
          stageName: stage.stageName,
          stageKey: stage.stageKey,
          plannedDate: planned,
          actualDate: actual,
          status: 'Pending',
          timeDelay,
          formLink,
        });
      }
    }

    return tasks;
  } catch (err) {
    console.error('Failed to fetch HR Recruitment FMS tasks:', err);
    throw err;
  }
}
