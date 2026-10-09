import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

const DEFAULT_BLOG_POSTING_SPREADSHEET_ID = '1tPaUNjLfro9BM55ofnd7n1EeiSJmYVRrJmc6R31OHBM';

export interface BlogPostingTask {
  tab: 'Alchemane_Blog_Posting_FMS' | 'American_Blog_Posting_FMS';
  sheetRow: number;
  blogTitle: string;
  companyName: string;
  authorName: string;
  stageName: string;
  stageKey: string;
  assignedTo: string;
  mappedUser: string;
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

const BLOG_STAGES: StageDefinition[] = [
  {
    stageName: 'Planning Image Assets & Folder Creation',
    stageKey: 'image_assets_planning',
    plannedCol: 6,  // Col G
    actualCol: 7,   // Col H
    statusCol: 8,   // Col I
    timeDelayCol: 9,// Col J
  },
  {
    stageName: 'Assign Task to Riyaz',
    stageKey: 'assign_to_riyaz',
    plannedCol: 10, // Col K
    actualCol: 11,  // Col L
    statusCol: 12,  // Col M
    timeDelayCol: 13,// Col N
  },
  {
    stageName: 'Keyword Planning',
    stageKey: 'keyword_planning',
    plannedCol: 14, // Col O
    actualCol: 15,  // Col P
    statusCol: 16,  // Col Q
    timeDelayCol: 17,// Col R
  },
  {
    stageName: 'Keyword Approval by Manav',
    stageKey: 'keyword_approval_manav',
    plannedCol: 18, // Col S
    actualCol: 19,  // Col T
    statusCol: 20,  // Col U
    timeDelayCol: 21,// Col V
  },
  {
    stageName: 'Generate AI Blog on Hypotype & Humanize Content',
    stageKey: 'generate_ai_blog',
    plannedCol: 22, // Col W
    actualCol: 23,  // Col X
    statusCol: 24,  // Col Y
    timeDelayCol: 25,// Col Z
  },
  {
    stageName: 'Final Blog & Thumbnail Approval',
    stageKey: 'final_blog_approval',
    plannedCol: 26, // Col AA
    actualCol: 27,  // Col AB
    statusCol: 28,  // Col AC
    timeDelayCol: 29,// Col AD
  },
  {
    stageName: 'Final Approval by Vinitt Sir & Manav',
    stageKey: 'final_approval_vinitt_manav',
    plannedCol: 30, // Col AE
    actualCol: 31,  // Col AF
    statusCol: 32,  // Col AG
    timeDelayCol: 33,// Col AH
  },
];

export function blogPostingSpreadsheetId(): string {
  return process.env.BLOG_POSTING_FMS_SPREADSHEET_ID || DEFAULT_BLOG_POSTING_SPREADSHEET_ID;
}

export async function getBlogPostingFmsTasks(
  tabName: 'Alchemane_Blog_Posting_FMS' | 'American_Blog_Posting_FMS' | 'all' = 'all',
  options?: {
    targetUserName?: string;
    role?: UserRole;
  }
): Promise<BlogPostingTask[]> {
  const spreadsheetId = blogPostingSpreadsheetId();
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  const tabs: Array<'Alchemane_Blog_Posting_FMS' | 'American_Blog_Posting_FMS'> =
    tabName === 'all'
      ? ['Alchemane_Blog_Posting_FMS', 'American_Blog_Posting_FMS']
      : [tabName];

  const tasks: BlogPostingTask[] = [];

  for (const currentTab of tabs) {
    try {
      const results = await readSpreadsheetValues(
        spreadsheetId,
        `'${currentTab}'!A7:AH500`,
        'FORMATTED_VALUE',
      );
      const rows = results[0] || [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const blogTitle = String(row[1] ?? '').trim();
        const companyName = String(row[2] ?? '').trim();
        const authorName = String(row[3] ?? '').trim();

        if (!blogTitle && !authorName) continue;

        for (const stage of BLOG_STAGES) {
          const planned = String(row[stage.plannedCol] ?? '').trim();
          const actual = String(row[stage.actualCol] ?? '').trim();
          const status = String(row[stage.statusCol] ?? '').trim();
          const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';

          // Only include if planned date exists and actual date is not completed
          if (!planned) continue;
          if (actual) continue;
          if (status && (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase() === 'true')) continue;

          const assignedTo = authorName || 'Shreyas';
          const mappedUser = mapFmsNameToSystemUser(assignedTo);

          // Filter for target user if requested (entire sheet belongs to Shreyas)
          if (options?.targetUserName) {
            const matches =
              isFmsNameMatchUser(assignedTo, options.targetUserName) ||
              isFmsNameMatchUser('Shreyas', options.targetUserName);
            if (!matches) {
              continue;
            }
          }

          tasks.push({
            tab: currentTab,
            sheetRow: i + 7,
            blogTitle: blogTitle || `Blog #${i + 7}`,
            companyName: companyName || (currentTab.includes('Alchemane') ? 'Alchemane' : 'American Hairline'),
            authorName: authorName || '—',
            stageName: stage.stageName,
            stageKey: stage.stageKey,
            assignedTo,
            mappedUser,
            plannedDate: planned,
            actualDate: actual,
            status: 'Pending',
            timeDelay,
          });
        }
      }
    } catch (err) {
      console.error(`Failed to fetch ${currentTab} tasks:`, err);
    }
  }

  return tasks;
}
