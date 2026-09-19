import { buildWeeklyMisPdfAsync, weeklyMisPdfFilename } from '@/lib/mis/pdfReport';
import { getMisWeekPeriod } from '@/lib/mis/week';

export interface MisPersonViewPdf {
  uid?: string | null;
  name?: string;
  department?: string;
  planned?: number;
  done?: number;
  onTime?: number;
  gapPercent?: number | null;
  gapLabel?: string;
  onTimeGapPercent?: number | null;
  checklist?: { planned: number; done: number; onTime: number };
  delegation?: { planned: number; done: number; onTime: number };
  fms?: { planned: number; done: number; onTime: number };
  parameters?: Array<{
    id?: string;
    label: string;
    section: string;
    planned: number;
    done: number;
    onTime: number;
    gapPercent: number | null;
  }>;
  weekStart?: string;
  weekEnd?: string;
  weekKey?: string;
}

export interface MisMasterPersonReportPdf {
  name?: string;
  department?: string;
  weekNumber?: string | number;
  weekStartLabel?: string;
  weekEndLabel?: string;
  gapLabel?: string;
  lastWeekPlannedPercent?: string;
  nextWeekPlannedPercent?: string;
  rollups: Array<{
    label: string;
    kra: string;
    kpi: string;
    planned: number;
    done: number;
    gapPercent: number | null;
  }>;
  parameters?: Array<{
    id?: string;
    label: string;
    section: string;
    planned: number;
    done: number;
    onTime: number;
    gapPercent: number | null;
  }>;
}

function triggerBrowserDownload(pdfBytes: Uint8Array | Buffer, filename: string) {
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function sanitizeFileName(name: string) {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim();
}

/**
 * Generates and directly downloads the official Google Sheet layout MIS report PDF.
 */
export async function downloadMisWeeklyPdf(person: MisPersonViewPdf, _portalMis?: number) {
  const defaultPeriod = getMisWeekPeriod(person.weekStart || undefined);
  const weekStart = person.weekStart || defaultPeriod.weekStart;
  const weekEnd = person.weekEnd || defaultPeriod.weekEnd;
  const weekKey = person.weekKey || defaultPeriod.weekKey;
  const weekNumber = defaultPeriod.weekNumber;

  const pdfBuffer = await buildWeeklyMisPdfAsync(
    {
      name: person.name || 'Staff Member',
      department: person.department,
      planned: person.planned ?? 0,
      done: person.done ?? 0,
      onTime: person.onTime ?? 0,
      gapPercent: person.gapPercent ?? null,
      onTimeGapPercent: person.onTimeGapPercent ?? null,
      checklist: person.checklist,
      delegation: person.delegation,
      fms: person.fms,
      parameters: person.parameters as any,
    },
    {
      weekKey: weekKey || defaultPeriod.weekKey,
      weekStart,
      weekEnd,
      weekNumber,
    },
  );

  const filename = weeklyMisPdfFilename(person.name || 'MIS_Report', weekKey || 'Report');
  triggerBrowserDownload(pdfBuffer, filename);
}

/**
 * Generates and directly downloads the official Google Sheet layout MIS report PDF from Master report data.
 */
export async function downloadMisMasterPdf(report: MisMasterPersonReportPdf) {
  const defaultPeriod = getMisWeekPeriod();
  const overall = report.rollups?.[0];
  const checklistRollup = report.rollups?.find(r => /checklist/i.test(r.label) || /checklist/i.test(r.kra));
  const delegationRollup = report.rollups?.find(r => /delegation|one.time/i.test(r.label) || /delegation|one.time/i.test(r.kra));
  const fmsRollup = report.rollups?.find(r => /fms/i.test(r.label) || /fms/i.test(r.kra));

  const totalPlanned = overall?.planned ?? 0;
  const totalDone = overall?.done ?? 0;
  const gapPercent = overall?.gapPercent ?? null;

  const weekNum = typeof report.weekNumber === 'number'
    ? report.weekNumber
    : report.weekNumber && String(report.weekNumber).trim() && String(report.weekNumber) !== 'undefined'
      ? Number(String(report.weekNumber).replace(/\D/g, '')) || defaultPeriod.weekNumber
      : defaultPeriod.weekNumber;

  const weekStart = report.weekStartLabel || defaultPeriod.weekStart;
  const weekEnd = report.weekEndLabel || defaultPeriod.weekEnd;

  const pdfBuffer = await buildWeeklyMisPdfAsync(
    {
      name: report.name || 'Staff Member',
      department: report.department,
      planned: totalPlanned,
      done: totalDone,
      onTime: totalDone,
      gapPercent,
      checklist: checklistRollup ? { planned: checklistRollup.planned, done: checklistRollup.done, onTime: checklistRollup.done } : undefined,
      delegation: delegationRollup ? { planned: delegationRollup.planned, done: delegationRollup.done, onTime: delegationRollup.done } : undefined,
      fms: fmsRollup ? { planned: fmsRollup.planned, done: fmsRollup.done, onTime: fmsRollup.done } : undefined,
      parameters: report.parameters as any,
    },
    {
      weekKey: `W${weekNum}`,
      weekStart,
      weekEnd,
      weekNumber: weekNum,
    },
  );

  const filename = `${sanitizeFileName(report.name || 'MIS_Report')}_MIS_Report.pdf`;
  triggerBrowserDownload(pdfBuffer, filename);
}
