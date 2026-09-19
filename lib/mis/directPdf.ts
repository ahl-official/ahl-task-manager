import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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
  weekStart?: string;
  weekEnd?: string;
  weekKey?: string;
}

export interface MisMasterPersonReportPdf {
  name?: string;
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
    label: string;
    section: string;
    planned: number;
    done: number;
    onTime: number;
    gapPercent: number | null;
  }>;
}

function triggerBrowserDownload(pdfBytes: Uint8Array, filename: string) {
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
 * Generates and directly downloads a PDF for an individual weekly MIS report.
 */
export async function downloadMisWeeklyPdf(person: MisPersonViewPdf, portalMis: number) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait (210 x 297 mm)
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Palette
  const navyDark = rgb(0.06, 0.10, 0.20);     // #0F1A33
  const royalBlue = rgb(0.12, 0.40, 0.85);    // #1F66D9
  const goldAccent = rgb(0.88, 0.62, 0.15);   // #E09E26
  const textDark = rgb(0.10, 0.14, 0.20);
  const textMuted = rgb(0.40, 0.45, 0.52);
  const bgCard = rgb(0.96, 0.97, 0.99);
  const borderLight = rgb(0.85, 0.89, 0.94);
  const white = rgb(1, 1, 1);
  const greenHighlight = rgb(0.08, 0.62, 0.38);

  // 1. Top Header Banner
  page.drawRectangle({
    x: 0,
    y: height - 100,
    width,
    height: 100,
    color: navyDark,
  });

  page.drawRectangle({
    x: 0,
    y: height - 104,
    width,
    height: 4,
    color: goldAccent,
  });

  page.drawText('AMERICAN HAIRLINE', {
    x: 44,
    y: height - 44,
    size: 20,
    font: fontBold,
    color: white,
  });

  page.drawText('WEEKLY MIS PERFORMANCE REPORT', {
    x: 44,
    y: height - 68,
    size: 11,
    font: fontBold,
    color: rgb(0.68, 0.82, 1),
  });

  page.drawText('CONFIDENTIAL PERFORMANCE EVALUATION', {
    x: 44,
    y: height - 84,
    size: 8,
    font: fontRegular,
    color: rgb(0.6, 0.7, 0.82),
  });

  let currentY = height - 135;

  // 2. Employee Details Card
  page.drawRectangle({
    x: 44,
    y: currentY - 55,
    width: width - 88,
    height: 55,
    color: bgCard,
    borderColor: borderLight,
    borderWidth: 1,
  });

  page.drawText('EMPLOYEE NAME', {
    x: 60,
    y: currentY - 20,
    size: 8,
    font: fontBold,
    color: textMuted,
  });

  page.drawText(person.name || 'Staff Member', {
    x: 60,
    y: currentY - 38,
    size: 13,
    font: fontBold,
    color: textDark,
  });

  page.drawText('DEPARTMENT', {
    x: 230,
    y: currentY - 20,
    size: 8,
    font: fontBold,
    color: textMuted,
  });

  page.drawText(person.department || 'General', {
    x: 230,
    y: currentY - 38,
    size: 11,
    font: fontRegular,
    color: textDark,
  });

  page.drawText('EVALUATION PERIOD', {
    x: 390,
    y: currentY - 20,
    size: 8,
    font: fontBold,
    color: textMuted,
  });

  const periodLabel = person.weekStart && person.weekEnd
    ? `${person.weekStart} -> ${person.weekEnd}`
    : person.weekKey || 'Current Week';
  page.drawText(periodLabel, {
    x: 390,
    y: currentY - 38,
    size: 10,
    font: fontBold,
    color: royalBlue,
  });

  currentY -= 85;

  // 3. Summary Metric Cards
  const cardWidth = (width - 88 - 36) / 4;
  const metrics = [
    { label: 'PLANNED WORKS', value: String(person.planned ?? 0), color: textDark },
    { label: 'ACTUAL DONE', value: String(person.done ?? 0), color: royalBlue },
    { label: 'ON-TIME DONE', value: String(person.onTime ?? 0), color: greenHighlight },
    { label: 'PDF MIS (GAP)', value: person.gapLabel || '0.00%', color: textDark },
  ];

  metrics.forEach((m, idx) => {
    const cardX = 44 + idx * (cardWidth + 12);
    page.drawRectangle({
      x: cardX,
      y: currentY - 50,
      width: cardWidth,
      height: 50,
      color: bgCard,
      borderColor: borderLight,
      borderWidth: 1,
    });

    page.drawText(m.label, {
      x: cardX + 10,
      y: currentY - 18,
      size: 7,
      font: fontBold,
      color: textMuted,
    });

    page.drawText(m.value, {
      x: cardX + 10,
      y: currentY - 40,
      size: 14,
      font: fontBold,
      color: m.color,
    });
  });

  currentY -= 75;

  // 4. Breakdown Table
  page.drawText('TASK EXECUTION BREAKDOWN BY BUCKET', {
    x: 44,
    y: currentY,
    size: 10,
    font: fontBold,
    color: navyDark,
  });

  currentY -= 15;

  const tableX = 44;
  const tableWidth = width - 88;
  const cols = [
    { name: 'Workflow Bucket', width: tableWidth * 0.46, align: 'left' },
    { name: 'Planned', width: tableWidth * 0.18, align: 'center' },
    { name: 'Actual Done', width: tableWidth * 0.18, align: 'center' },
    { name: 'On-Time', width: tableWidth * 0.18, align: 'center' },
  ];

  // Header row
  const rowHeight = 24;
  page.drawRectangle({
    x: tableX,
    y: currentY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: royalBlue,
  });

  let curX = tableX;
  cols.forEach(col => {
    page.drawText(col.name, {
      x: curX + 10,
      y: currentY - 16,
      size: 8.5,
      font: fontBold,
      color: white,
    });
    curX += col.width;
  });

  currentY -= rowHeight;

  const rows = [
    { label: 'Checklist (timely routine sheets)', data: person.checklist },
    { label: 'Delegation (one-time tasks)', data: person.delegation },
    { label: 'FMS (workflow processes)', data: person.fms },
  ];

  rows.forEach((r, idx) => {
    const isEven = idx % 2 === 0;
    page.drawRectangle({
      x: tableX,
      y: currentY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: isEven ? white : bgCard,
      borderColor: borderLight,
      borderWidth: 0.5,
    });

    let rowX = tableX;
    page.drawText(r.label, {
      x: rowX + 10,
      y: currentY - 16,
      size: 8.5,
      font: fontRegular,
      color: textDark,
    });
    rowX += cols[0].width;

    page.drawText(String(r.data?.planned ?? 0), {
      x: rowX + 10,
      y: currentY - 16,
      size: 8.5,
      font: fontRegular,
      color: textDark,
    });
    rowX += cols[1].width;

    page.drawText(String(r.data?.done ?? 0), {
      x: rowX + 10,
      y: currentY - 16,
      size: 8.5,
      font: fontRegular,
      color: textDark,
    });
    rowX += cols[2].width;

    page.drawText(String(r.data?.onTime ?? 0), {
      x: rowX + 10,
      y: currentY - 16,
      size: 8.5,
      font: fontRegular,
      color: textDark,
    });

    currentY -= rowHeight;
  });

  // Total summary row
  page.drawRectangle({
    x: tableX,
    y: currentY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: rgb(0.92, 0.96, 1),
    borderColor: royalBlue,
    borderWidth: 1,
  });

  let totalX = tableX;
  page.drawText('TOTAL WORK DONE', {
    x: totalX + 10,
    y: currentY - 16,
    size: 8.5,
    font: fontBold,
    color: royalBlue,
  });
  totalX += cols[0].width;

  page.drawText(String(person.planned ?? 0), {
    x: totalX + 10,
    y: currentY - 16,
    size: 8.5,
    font: fontBold,
    color: royalBlue,
  });
  totalX += cols[1].width;

  page.drawText(String(person.done ?? 0), {
    x: totalX + 10,
    y: currentY - 16,
    size: 8.5,
    font: fontBold,
    color: royalBlue,
  });
  totalX += cols[2].width;

  page.drawText(String(person.onTime ?? 0), {
    x: totalX + 10,
    y: currentY - 16,
    size: 8.5,
    font: fontBold,
    color: royalBlue,
  });

  currentY -= rowHeight + 35;

  // 5. Formula & Note Card
  page.drawRectangle({
    x: 44,
    y: currentY - 80,
    width: width - 88,
    height: 80,
    color: bgCard,
    borderColor: borderLight,
    borderWidth: 1,
  });

  page.drawText('UNDERSTANDING THE METRICS', {
    x: 60,
    y: currentY - 20,
    size: 8.5,
    font: fontBold,
    color: navyDark,
  });

  const notes = [
    '• PDF MIS (Gap %): ROUND((Done / Planned) * 100 - 100, 2). 0% = 100% planned work achieved.',
    `• Portal Score: ${portalMis}% on-time task completion rate. 100% is perfect on-time performance.`,
    '• On-Time Rate: Reflects percentage of assigned tasks closed on or before the due date.',
  ];

  notes.forEach((n, idx) => {
    page.drawText(n, {
      x: 60,
      y: currentY - 38 - idx * 16,
      size: 8,
      font: fontRegular,
      color: textMuted,
    });
  });

  // Footer
  page.drawLine({
    start: { x: 44, y: 45 },
    end: { x: width - 44, y: 45 },
    thickness: 1,
    color: borderLight,
  });

  page.drawText('American Hairline • Operations & Task Management System', {
    x: 44,
    y: 30,
    size: 8,
    font: fontBold,
    color: textMuted,
  });

  page.drawText(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, {
    x: width - 160,
    y: 30,
    size: 8,
    font: fontRegular,
    color: textMuted,
  });

  const pdfBytes = await pdfDoc.save();
  const filename = `${sanitizeFileName(person.name || 'MIS_Report')}_Weekly_MIS.pdf`;
  triggerBrowserDownload(pdfBytes, filename);
}

/**
 * Generates and directly downloads a PDF for the Master MIS Report.
 */
export async function downloadMisMasterPdf(report: MisMasterPersonReportPdf) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Palette
  const navyDark = rgb(0.06, 0.10, 0.20);
  const royalBlue = rgb(0.12, 0.40, 0.85);
  const goldAccent = rgb(0.88, 0.62, 0.15);
  const textDark = rgb(0.10, 0.14, 0.20);
  const textMuted = rgb(0.40, 0.45, 0.52);
  const bgCard = rgb(0.96, 0.97, 0.99);
  const borderLight = rgb(0.85, 0.89, 0.94);
  const white = rgb(1, 1, 1);

  // Header Banner
  page.drawRectangle({
    x: 0,
    y: height - 90,
    width,
    height: 90,
    color: navyDark,
  });

  page.drawRectangle({
    x: 0,
    y: height - 94,
    width,
    height: 4,
    color: goldAccent,
  });

  page.drawText('AMERICAN HAIRLINE', {
    x: 44,
    y: height - 40,
    size: 18,
    font: fontBold,
    color: white,
  });

  page.drawText(`MASTER MIS PERFORMANCE REPORT  |  ${report.weekNumber ? `WEEK ${report.weekNumber}` : 'WEEKLY'}`, {
    x: 44,
    y: height - 64,
    size: 10,
    font: fontBold,
    color: rgb(0.68, 0.82, 1),
  });

  let currentY = height - 120;

  // Header Details Box
  page.drawRectangle({
    x: 44,
    y: currentY - 50,
    width: width - 88,
    height: 50,
    color: bgCard,
    borderColor: borderLight,
    borderWidth: 1,
  });

  page.drawText('PERSON NAME', {
    x: 56,
    y: currentY - 18,
    size: 7.5,
    font: fontBold,
    color: textMuted,
  });

  page.drawText(report.name || 'Staff Member', {
    x: 56,
    y: currentY - 36,
    size: 12,
    font: fontBold,
    color: textDark,
  });

  page.drawText('WEEK DATES', {
    x: 210,
    y: currentY - 18,
    size: 7.5,
    font: fontBold,
    color: textMuted,
  });

  const weekText = `${report.weekStartLabel || '—'}  to  ${report.weekEndLabel || '—'}`;
  page.drawText(weekText, {
    x: 210,
    y: currentY - 36,
    size: 9.5,
    font: fontRegular,
    color: textDark,
  });

  page.drawText('MIS GAP SCORE', {
    x: 390,
    y: currentY - 18,
    size: 7.5,
    font: fontBold,
    color: textMuted,
  });

  page.drawText(report.gapLabel || '0.00%', {
    x: 390,
    y: currentY - 36,
    size: 13,
    font: fontBold,
    color: royalBlue,
  });

  currentY -= 75;

  // Rollup Table
  page.drawText('SUMMARY ROLLUPS', {
    x: 44,
    y: currentY,
    size: 9.5,
    font: fontBold,
    color: navyDark,
  });

  currentY -= 14;

  const tableX = 44;
  const tableWidth = width - 88;
  const colWidths = [
    tableWidth * 0.26, // Section
    tableWidth * 0.22, // KRA
    tableWidth * 0.22, // KPI
    tableWidth * 0.10, // Planned
    tableWidth * 0.10, // Done
    tableWidth * 0.10, // Gap %
  ];

  // Rollups header
  const rowHeight = 22;
  page.drawRectangle({
    x: tableX,
    y: currentY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: royalBlue,
  });

  const headers = ['Section / Label', 'KRA', 'KPI', 'Planned', 'Done', 'Gap %'];
  let colX = tableX;
  headers.forEach((h, i) => {
    page.drawText(h, {
      x: colX + 6,
      y: currentY - 15,
      size: 7.5,
      font: fontBold,
      color: white,
    });
    colX += colWidths[i];
  });

  currentY -= rowHeight;

  report.rollups.forEach((r: { label: string; kra: string; kpi: string; planned: number; done: number; gapPercent: number | null }, idx: number) => {
    const isEven = idx % 2 === 0;
    page.drawRectangle({
      x: tableX,
      y: currentY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: isEven ? white : bgCard,
      borderColor: borderLight,
      borderWidth: 0.5,
    });

    let curCellX = tableX;
    const values = [
      r.label || '—',
      r.kra || '—',
      r.kpi || '—',
      String(r.planned ?? 0),
      String(r.done ?? 0),
      r.gapPercent != null ? `${r.gapPercent.toFixed(1)}%` : '—',
    ];

    values.forEach((v, i) => {
      const isGap = i === 5;
      page.drawText(v.slice(0, 24), {
        x: curCellX + 6,
        y: currentY - 15,
        size: 7.5,
        font: isGap ? fontBold : fontRegular,
        color: isGap ? royalBlue : textDark,
      });
      curCellX += colWidths[i];
    });

    currentY -= rowHeight;
  });

  currentY -= 20;

  // Parameters Table (if exists)
  if (report.parameters && report.parameters.length > 0) {
    page.drawText('PARAMETER DETAILS', {
      x: 44,
      y: currentY,
      size: 9.5,
      font: fontBold,
      color: navyDark,
    });

    currentY -= 14;

    page.drawRectangle({
      x: tableX,
      y: currentY - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: royalBlue,
    });

    const paramHeaders = ['Parameter', 'Section', 'Planned', 'Done', 'On-Time', 'Gap %'];
    const pColWidths = [
      tableWidth * 0.35,
      tableWidth * 0.21,
      tableWidth * 0.11,
      tableWidth * 0.11,
      tableWidth * 0.11,
      tableWidth * 0.11,
    ];

    let pX = tableX;
    paramHeaders.forEach((h, i) => {
      page.drawText(h, {
        x: pX + 6,
        y: currentY - 15,
        size: 7.5,
        font: fontBold,
        color: white,
      });
      pX += pColWidths[i];
    });

    currentY -= rowHeight;

    // Show up to 14 parameters to fit cleanly on single A4 page
    const visibleParams = report.parameters.slice(0, 14);
    visibleParams.forEach((p: { label: string; section: string; planned: number; done: number; onTime: number; gapPercent: number | null }, idx: number) => {
      const isEven = idx % 2 === 0;
      page.drawRectangle({
        x: tableX,
        y: currentY - 18,
        width: tableWidth,
        height: 18,
        color: isEven ? white : bgCard,
        borderColor: borderLight,
        borderWidth: 0.5,
      });

      let cellX = tableX;
      const vals = [
        p.label || '—',
        p.section || '—',
        String(p.planned ?? 0),
        String(p.done ?? 0),
        String(p.onTime ?? 0),
        p.gapPercent != null ? `${p.gapPercent.toFixed(1)}%` : '—',
      ];

      vals.forEach((v, i) => {
        page.drawText(v.slice(0, 32), {
          x: cellX + 6,
          y: currentY - 13,
          size: 7,
          font: i === 5 ? fontBold : fontRegular,
          color: textDark,
        });
        cellX += pColWidths[i];
      });

      currentY -= 18;
    });
  }

  // Footer
  page.drawLine({
    start: { x: 44, y: 45 },
    end: { x: width - 44, y: 45 },
    thickness: 1,
    color: borderLight,
  });

  page.drawText('American Hairline • Operations & Task Management System', {
    x: 44,
    y: 30,
    size: 8,
    font: fontBold,
    color: textMuted,
  });

  page.drawText(`Generated on: ${new Date().toLocaleDateString('en-GB')}`, {
    x: width - 160,
    y: 30,
    size: 8,
    font: fontRegular,
    color: textMuted,
  });

  const pdfBytes = await pdfDoc.save();
  const filename = `${sanitizeFileName(report.name || 'MIS_Report')}_Master_MIS.pdf`;
  triggerBrowserDownload(pdfBytes, filename);
}
