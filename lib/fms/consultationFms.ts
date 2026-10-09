import { hasGoogleSheetsAuth, readSpreadsheetValues } from '@/lib/google/sheets';
import { isFmsNameMatchUser, mapFmsNameToSystemUser } from './userMapping';
import type { UserRole } from '@/types';

const DEFAULT_CONSULTATION_SPREADSHEET_ID = '1QG47SeCSSEGSUrtw1OorA9RkzEqoxr4o2IxIM6h9e6Y';

export interface ConsultationFmsTask {
  tab: string;
  sheetRow: number;
  uniqueId: string;
  clientName: string;
  contactNo: string;
  city: string;
  consultant: string;
  mappedUser: string;
  consultType: string;
  stageName: string;
  plannedDate: string;
  actualDate: string;
  status: 'Done' | 'Pending' | string;
  formLink: string;
  timeDelay?: string;
  remarks?: string;
}

export function consultationFmsSpreadsheetId(): string {
  return process.env.CONSULTATION_FMS_SPREADSHEET_ID || DEFAULT_CONSULTATION_SPREADSHEET_ID;
}

function parseYear(dateStr: string): number | null {
  if (!dateStr) return null;
  // Match 4-digit years like 2026, 2027, etc.
  const m = dateStr.match(/\b(202[0-9]|203[0-9])\b/);
  return m ? parseInt(m[1], 10) : null;
}

interface StageConfig {
  stageName: string;
  plannedCol: number;
  actualCol: number;
  statusCol: number;
  formLinkCol: number;
  timeDelayCol?: number;
}

interface TabConfig {
  tab: string;
  uniqueIdCol: number;
  clientNameCol: number;
  contactCol: number;
  cityCol: number;
  consultantCol: number;
  typeCol: number;
  remarksCol?: number;
  stages: StageConfig[];
}

const TAB_CONFIGS: TabConfig[] = [
  {
    tab: 'Consultation FMS',
    uniqueIdCol: 4,
    clientNameCol: 1,
    contactCol: 2,
    cityCol: 3,
    consultantCol: 6,
    typeCol: 7,
    remarksCol: 5,
    stages: [
      { stageName: 'Fill the After Consultation Form', plannedCol: 8, actualCol: 9, statusCol: 10, formLinkCol: 12, timeDelayCol: 11 },
      { stageName: 'Order Booking Confirmation', plannedCol: 14, actualCol: 15, statusCol: 16, formLinkCol: 12, timeDelayCol: 17 },
      { stageName: 'Follow up Consultation', plannedCol: 18, actualCol: 19, statusCol: 20, formLinkCol: 25, timeDelayCol: 22 },
    ],
  },
  {
    tab: 'Bangalore Consultation FMS',
    uniqueIdCol: 4,
    clientNameCol: 1,
    contactCol: 2,
    cityCol: 3,
    consultantCol: 5,
    typeCol: 7,
    remarksCol: 6,
    stages: [
      { stageName: 'Bangalore After Consultation Form', plannedCol: 8, actualCol: 9, statusCol: 10, formLinkCol: 13, timeDelayCol: 11 },
      { stageName: 'Not Booked Follow Up', plannedCol: 15, actualCol: 16, statusCol: 17, formLinkCol: 13, timeDelayCol: 18 },
    ],
  },
  {
    tab: 'Video Consultation FMS',
    uniqueIdCol: 4,
    clientNameCol: 1,
    contactCol: 2,
    cityCol: 3,
    consultantCol: 6,
    typeCol: 7,
    remarksCol: 5,
    stages: [
      { stageName: 'Video After Consultation Form', plannedCol: 9, actualCol: 10, statusCol: 11, formLinkCol: 14, timeDelayCol: 12 },
      { stageName: 'Order Booking Confirmation', plannedCol: 16, actualCol: 17, statusCol: 18, formLinkCol: 14, timeDelayCol: 19 },
      { stageName: 'Follow up (Video)', plannedCol: 20, actualCol: 21, statusCol: 22, formLinkCol: 26, timeDelayCol: 24 },
    ],
  },
  {
    tab: 'Delhi Consultation FMS',
    uniqueIdCol: 4,
    clientNameCol: 1,
    contactCol: 2,
    cityCol: 3,
    consultantCol: 5,
    typeCol: 7,
    remarksCol: 6,
    stages: [
      { stageName: 'Delhi After Consultation Form', plannedCol: 8, actualCol: 9, statusCol: 10, formLinkCol: 13, timeDelayCol: 11 },
      { stageName: 'Not Booked Follow Up', plannedCol: 15, actualCol: 16, statusCol: 17, formLinkCol: 13, timeDelayCol: 18 },
    ],
  },
];

/**
 * Generate standard pre-filled Google Form URL if link is formula/placeholder
 */
function buildFallbackFormLink(tab: string, stageName: string, uniqueId: string, clientName: string, contactNo: string, city: string, type: string): string {
  if (stageName.toLowerCase().includes('follow up')) {
    return `https://docs.google.com/forms/d/e/1FAIpQLSdKQxPfYxuR96yU2SbZf2S8R4-2hm6YCK0tPEZcVYgXEzcEPw/viewform?usp=pp_url&entry.1575519302=${encodeURIComponent(clientName)}&entry.570216793=${encodeURIComponent(contactNo)}&entry.780571802=${encodeURIComponent(city)}&entry.1105398794=${encodeURIComponent(uniqueId)}`;
  }
  return `https://docs.google.com/forms/d/e/1FAIpQLScWN-zBCrTpG2Zxto0I7BTfiJBymae5M4OIGEesGwYlb0x1xQ/viewform?usp=pp_url&entry.1554094439=${encodeURIComponent(clientName)}&entry.363072579=${encodeURIComponent(contactNo)}&entry.1563603820=${encodeURIComponent(city)}&entry.1697361740=${encodeURIComponent(uniqueId)}&entry.1191741934=${encodeURIComponent(type || 'In-person')}`;
}

/**
 * Fetch all Consultation FMS tasks (2026 and after) with valid planned dates.
 */
export async function getConsultationFmsTasks(options?: {
  targetUserName?: string;
  role?: UserRole;
}): Promise<ConsultationFmsTask[]> {
  const spreadsheetId = consultationFmsSpreadsheetId();
  if (!hasGoogleSheetsAuth()) {
    console.warn('Google Sheets authentication is not configured');
    return [];
  }

  const tasks: ConsultationFmsTask[] = [];

  for (const cfg of TAB_CONFIGS) {
    try {
      const results = await readSpreadsheetValues(
        spreadsheetId,
        `'${cfg.tab}'!A7:AC1500`,
        'FORMATTED_VALUE',
      );
      const rows = results[0] || [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const uniqueId = String(row[cfg.uniqueIdCol] ?? '').trim();
        const clientName = String(row[cfg.clientNameCol] ?? '').trim();
        const contactNo = String(row[cfg.contactCol] ?? '').trim();
        const city = String(row[cfg.cityCol] ?? '').trim();
        const consultantRaw = String(row[cfg.consultantCol] ?? '').trim();
        const consultType = String(row[cfg.typeCol] ?? '').trim();
        const remarks = cfg.remarksCol !== undefined ? String(row[cfg.remarksCol] ?? '').trim() : '';

        // Skip rows without basic info
        if (!uniqueId && !clientName) continue;

        const mappedUser = mapFmsNameToSystemUser(consultantRaw);

        // Filter for specific consultant if requested (never return unassigned to non-admin user)
        if (options?.targetUserName) {
          if (!consultantRaw || !isFmsNameMatchUser(consultantRaw, options.targetUserName)) {
            continue;
          }
        }

        for (const stage of cfg.stages) {
          const planned = String(row[stage.plannedCol] ?? '').trim();
          const actual = String(row[stage.actualCol] ?? '').trim();
          const status = String(row[stage.statusCol] ?? '').trim();
          let formLink = String(row[stage.formLinkCol] ?? '').trim();
          const timeDelay = stage.timeDelayCol !== undefined ? String(row[stage.timeDelayCol] ?? '').trim() : '';

          // 1. MUST HAVE PLANNED DATE: "when planned date is there show only those in fms if no planned date dont fetch for fms"
          if (!planned) continue;

          // 2. YEAR 2026 AND AFTER: "also show in fms 2026 and after this year fms tasks"
          const plannedYear = parseYear(planned) || parseYear(String(row[0] ?? ''));
          if (plannedYear !== null && plannedYear < 2026) {
            continue;
          }

          // If form link is empty or generic placeholder "Click Here", build standard form URL
          if (!formLink.startsWith('http')) {
            formLink = buildFallbackFormLink(cfg.tab, stage.stageName, uniqueId, clientName, contactNo, city, consultType);
          }

          const isCompleted = Boolean(
            actual || (status && status.toLowerCase() !== 'pending' && status !== 'false' && status !== '0' && (status.toLowerCase().includes('done') || status.toLowerCase().includes('complete') || status.toLowerCase() === 'true'))
          );

          // Only include active pending tasks (actualDate is empty)
          if (actual || isCompleted) continue;

          tasks.push({
            tab: cfg.tab,
            sheetRow: i + 7,
            uniqueId,
            clientName: clientName || `Client ${uniqueId}`,
            contactNo,
            city,
            consultant: consultantRaw,
            mappedUser,
            consultType: consultType || cfg.tab.replace(' FMS', ''),
            stageName: stage.stageName,
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
      console.error(`Error reading ${cfg.tab}:`, err);
    }
  }

  // Sort tasks by planned date (newest/upcoming first)
  return tasks;
}


