import { buildWeeklyMisPdfAsync, weeklyMisPdfFilename } from '@/lib/mis/pdfReport';
import { getMisWeekPeriod } from '@/lib/mis/week';
import { isVinittUser } from '@/lib/utils/names';

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
  weekStart?: string;
  weekEnd?: string;
  gapLabel?: string;
  lastWeekPlannedPercent?: string;
  nextWeekPlannedPercent?: string;
  rollups: Array<{
    label: string;
    kra: string;
    kpi: string;
    planned: number;
    done: number;
    onTime?: number;
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
  const onTimeRollup = report.rollups?.find(r => /on.time/i.test(r.label));
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

  const weekStart = report.weekStart || report.weekStartLabel || defaultPeriod.weekStart;
  const weekEnd = report.weekEnd || report.weekEndLabel || defaultPeriod.weekEnd;

  const pdfBuffer = await buildWeeklyMisPdfAsync(
    {
      name: report.name || 'Staff Member',
      department: report.department,
      planned: totalPlanned,
      done: totalDone,
      onTime: overall?.onTime ?? onTimeRollup?.done ?? 0,
      gapPercent,
      onTimeGapPercent: onTimeRollup?.gapPercent ?? null,
      checklist: checklistRollup ? { planned: checklistRollup.planned, done: checklistRollup.done, onTime: checklistRollup.onTime ?? 0 } : undefined,
      delegation: delegationRollup ? { planned: delegationRollup.planned, done: delegationRollup.done, onTime: delegationRollup.onTime ?? 0 } : undefined,
      fms: fmsRollup ? { planned: fmsRollup.planned, done: fmsRollup.done, onTime: fmsRollup.onTime ?? 0 } : undefined,
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

export interface MisMonthlyPersonReportPdf {
  name?: string;
  department?: string;
  w1?: number | null;
  w2?: number | null;
  w3?: number | null;
  w4?: number | null;
  w5?: number | null;
  ms?: number | null;
  monthName?: string;
  year?: number;
}

/**
 * Generates and directly downloads the official executive-grade Monthly MIS Report PDF.
 */
export async function downloadMisMonthlyPdf(report: MisMonthlyPersonReportPdf) {
  const { buildMonthlyMisPdfAsync, monthlyMisPdfFilename } = await import('@/lib/mis/pdfReport');
  const fullReport = {
    name: report.name || 'Staff Member',
    department: report.department || 'Operations',
    w1: report.w1 ?? null,
    w2: report.w2 ?? null,
    w3: report.w3 ?? null,
    w4: report.w4 ?? null,
    w5: report.w5 ?? null,
    ms: report.ms ?? null,
    monthKey: `${report.year || new Date().getFullYear()}-${report.monthName || ''}`,
    monthName: report.monthName || 'Month',
    year: report.year || new Date().getFullYear(),
  };

  const pdfBuffer = await buildMonthlyMisPdfAsync(fullReport as any);
  const filename = monthlyMisPdfFilename(fullReport as any);
  triggerBrowserDownload(pdfBuffer, filename);
}

/**
 * Generates and downloads the complete Monthly Leaderboard Summary Table as a landscape PDF.
 */
export async function downloadMonthlySummaryTablePdf(
  rawRows: Array<{
    uid?: string | null;
    name: string;
    department?: string;
    w1Label?: string;
    w2Label?: string;
    w3Label?: string;
    w4Label?: string;
    w5Label?: string;
    msLabel?: string;
  }>,
  monthName: string,
  year: number,
) {
  const rows = rawRows.filter(r => !isVinittUser({ uid: r.uid, name: r.name }));
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // A4 Landscape: 841.89 x 595.28
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const rowsPerPage = 18;
  const totalPages = Math.ceil(rows.length / rowsPerPage) || 1;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const { width, height } = page.getSize();

    // Navy header banner
    page.drawRectangle({
      x: 0,
      y: height - 60,
      width,
      height: 60,
      color: rgb(0.06, 0.10, 0.20),
    });

    // Gold stripe
    page.drawRectangle({
      x: 0,
      y: height - 63,
      width,
      height: 3,
      color: rgb(0.88, 0.62, 0.15),
    });

    page.drawText('AMERICAN HAIRLINE', {
      x: 36,
      y: height - 32,
      size: 14,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText(`MONTHLY MIS PERFORMANCE REPORT  |  ${monthName.toUpperCase()} ${year}`, {
      x: 36,
      y: height - 48,
      size: 10,
      font: fontBold,
      color: rgb(0.68, 0.82, 1),
    });

    page.drawText(`Page ${pageIdx + 1} of ${totalPages}`, {
      x: width - 110,
      y: height - 38,
      size: 9,
      font: fontRegular,
      color: rgb(0.8, 0.85, 0.95),
    });

    // Table Header
    const tableTop = height - 85;
    page.drawRectangle({
      x: 36,
      y: tableTop - 22,
      width: width - 72,
      height: 22,
      color: rgb(0.93, 0.95, 0.98),
      borderColor: rgb(0.82, 0.86, 0.92),
      borderWidth: 1,
    });

    const colX = {
      rank: 46,
      name: 90,
      dept: 280,
      w1: 430,
      w2: 490,
      w3: 550,
      w4: 610,
      w5: 670,
      ms: 740,
    };

    page.drawText('#', { x: colX.rank, y: tableTop - 15, size: 8, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
    page.drawText('PERSON NAME', { x: colX.name, y: tableTop - 15, size: 8, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
    page.drawText('DEPARTMENT', { x: colX.dept, y: tableTop - 15, size: 8, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
    page.drawText('WEEK 1', { x: colX.w1, y: tableTop - 15, size: 8, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
    page.drawText('WEEK 2', { x: colX.w2, y: tableTop - 15, size: 8, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
    page.drawText('WEEK 3', { x: colX.w3, y: tableTop - 15, size: 8, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
    page.drawText('WEEK 4', { x: colX.w4, y: tableTop - 15, size: 8, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
    page.drawText('WEEK 5', { x: colX.w5, y: tableTop - 15, size: 8, font: fontBold, color: rgb(0.2, 0.25, 0.35) });
    page.drawText('MONTHLY (MS)', { x: colX.ms, y: tableTop - 15, size: 8, font: fontBold, color: rgb(0.12, 0.40, 0.85) });

    const pageRows = rows.slice(pageIdx * rowsPerPage, (pageIdx + 1) * rowsPerPage);
    let rowY = tableTop - 22;

    for (let rIdx = 0; rIdx < pageRows.length; rIdx++) {
      const row = pageRows[rIdx];
      const rank = pageIdx * rowsPerPage + rIdx + 1;
      const isAlt = rIdx % 2 === 1;

      if (isAlt) {
        page.drawRectangle({
          x: 36,
          y: rowY - 22,
          width: width - 72,
          height: 22,
          color: rgb(0.98, 0.99, 1),
        });
      }

      page.drawLine({
        start: { x: 36, y: rowY - 22 },
        end: { x: width - 36, y: rowY - 22 },
        thickness: 0.5,
        color: rgb(0.88, 0.90, 0.94),
      });

      page.drawText(String(rank), { x: colX.rank, y: rowY - 15, size: 8, font: fontRegular, color: rgb(0.4, 0.45, 0.55) });
      page.drawText((row.name || '—').slice(0, 26), { x: colX.name, y: rowY - 15, size: 8.5, font: fontBold, color: rgb(0.1, 0.15, 0.25) });
      page.drawText((row.department || '—').slice(0, 20), { x: colX.dept, y: rowY - 15, size: 8, font: fontRegular, color: rgb(0.4, 0.45, 0.55) });

      page.drawText(row.w1Label || '—', { x: colX.w1, y: rowY - 15, size: 8, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });
      page.drawText(row.w2Label || '—', { x: colX.w2, y: rowY - 15, size: 8, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });
      page.drawText(row.w3Label || '—', { x: colX.w3, y: rowY - 15, size: 8, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });
      page.drawText(row.w4Label || '—', { x: colX.w4, y: rowY - 15, size: 8, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });
      page.drawText(row.w5Label || '—', { x: colX.w5, y: rowY - 15, size: 8, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });

      page.drawText(row.msLabel || '—', { x: colX.ms, y: rowY - 15, size: 9, font: fontBold, color: rgb(0.12, 0.40, 0.85) });

      rowY -= 22;
    }
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `Monthly_Scores_${monthName}_${year}.pdf`;
  triggerBrowserDownload(pdfBytes, filename);
}
