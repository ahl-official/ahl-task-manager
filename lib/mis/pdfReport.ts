import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { MisMonthlyPersonReport } from '@/lib/mis/types';
import { formatAppsScriptPercent } from '@/lib/mis/sheetFormula';

/**
 * Generates an executive-grade, professional MIS Monthly Performance Report PDF.
 */
export async function buildMonthlyMisPdfAsync(report: MisMonthlyPersonReport): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait in points (210 x 297 mm)

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Palette
  const navyDark = rgb(0.06, 0.10, 0.20);     // #0F1A33 Dark Navy
  const royalBlue = rgb(0.12, 0.40, 0.85);    // #1F66D9 Royal Blue
  const goldAccent = rgb(0.88, 0.62, 0.15);   // #E09E26 Gold
  const textDark = rgb(0.10, 0.14, 0.20);     // #1A2433
  const textMuted = rgb(0.40, 0.45, 0.52);    // #667385
  const bgCard = rgb(0.96, 0.97, 0.99);       // #F5F8FC
  const borderLight = rgb(0.85, 0.89, 0.94);  // #D9E3F0
  const white = rgb(1, 1, 1);
  const greenHighlight = rgb(0.08, 0.62, 0.38); // #149E61

  const { width, height } = page.getSize();

  // 1. Top Header Banner
  page.drawRectangle({
    x: 0,
    y: height - 110,
    width,
    height: 110,
    color: navyDark,
  });

  // Gold accent stripe under header
  page.drawRectangle({
    x: 0,
    y: height - 114,
    width,
    height: 4,
    color: goldAccent,
  });

  page.drawText('AMERICAN HAIRLINE', {
    x: 44,
    y: height - 50,
    size: 20,
    font: fontBold,
    color: white,
  });

  page.drawText(`MONTHLY MIS PERFORMANCE REPORT  |  ${(report.monthName || 'MONTH').toUpperCase()}`, {
    x: 44,
    y: height - 76,
    size: 11,
    font: fontBold,
    color: rgb(0.68, 0.82, 1),
  });

  page.drawText('CONFIDENTIAL PERFORMANCE EVALUATION', {
    x: 44,
    y: height - 94,
    size: 8,
    font: fontRegular,
    color: rgb(0.6, 0.7, 0.82),
  });

  let currentY = height - 150;

  // 2. Employee Details Card
  page.drawRectangle({
    x: 44,
    y: currentY - 70,
    width: width - 88,
    height: 70,
    color: bgCard,
    borderColor: borderLight,
    borderWidth: 1,
  });

  // Left column: Employee Name
  page.drawText('EMPLOYEE NAME', {
    x: 64,
    y: currentY - 26,
    size: 8,
    font: fontBold,
    color: textMuted,
  });

  page.drawText(report.name || 'Staff Member', {
    x: 64,
    y: currentY - 48,
    size: 14,
    font: fontBold,
    color: textDark,
  });

  // Middle column: Department
  page.drawText('DEPARTMENT', {
    x: 240,
    y: currentY - 26,
    size: 8,
    font: fontBold,
    color: textMuted,
  });

  page.drawText(report.department || 'Operations', {
    x: 240,
    y: currentY - 46,
    size: 11,
    font: fontRegular,
    color: textDark,
  });

  // Right column: Evaluation Period
  page.drawText('PERIOD', {
    x: 400,
    y: currentY - 26,
    size: 8,
    font: fontBold,
    color: textMuted,
  });

  page.drawText(report.monthName || 'Current Month', {
    x: 400,
    y: currentY - 46,
    size: 11,
    font: fontBold,
    color: royalBlue,
  });

  currentY -= 105;

  // 3. Section Title
  page.drawText('WEEKLY COMPLETION GAP BREAKDOWN', {
    x: 44,
    y: currentY,
    size: 11,
    font: fontBold,
    color: navyDark,
  });

  currentY -= 18;

  // 4. Weekly Score Table
  const tableX = 44;
  const tableWidth = width - 88;
  const colWidth = tableWidth / 6;

  const columns = [
    { header: 'Week 1', val: formatAppsScriptPercent(report.w1) || '-' },
    { header: 'Week 2', val: formatAppsScriptPercent(report.w2) || '-' },
    { header: 'Week 3', val: formatAppsScriptPercent(report.w3) || '-' },
    { header: 'Week 4', val: formatAppsScriptPercent(report.w4) || '-' },
    { header: 'Week 5', val: formatAppsScriptPercent(report.w5) || '-' },
    { header: 'Monthly (MS)', val: formatAppsScriptPercent(report.ms) || '-' },
  ];

  // Table Header
  const headerHeight = 30;
  page.drawRectangle({
    x: tableX,
    y: currentY - headerHeight,
    width: tableWidth,
    height: headerHeight,
    color: royalBlue,
  });

  columns.forEach((col, idx) => {
    const isMs = idx === 5;
    page.drawText(col.header, {
      x: tableX + idx * colWidth + 10,
      y: currentY - 19,
      size: 9,
      font: fontBold,
      color: isMs ? rgb(1, 0.95, 0.7) : white,
    });
  });

  currentY -= headerHeight;

  // Table Values Row
  const rowHeight = 44;
  page.drawRectangle({
    x: tableX,
    y: currentY - rowHeight,
    width: tableWidth,
    height: rowHeight,
    color: white,
    borderColor: borderLight,
    borderWidth: 1,
  });

  // MS Column highlight background
  page.drawRectangle({
    x: tableX + 5 * colWidth,
    y: currentY - rowHeight,
    width: colWidth,
    height: rowHeight,
    color: rgb(0.92, 0.96, 1),
    borderColor: royalBlue,
    borderWidth: 1,
  });

  columns.forEach((col, idx) => {
    const isMs = idx === 5;
    const font = isMs ? fontBold : fontRegular;
    const fontSize = isMs ? 13 : 10;
    const color = isMs ? royalBlue : textDark;

    page.drawText(col.val, {
      x: tableX + idx * colWidth + 10,
      y: currentY - 26,
      size: fontSize,
      font,
      color,
    });
  });

  currentY -= rowHeight + 40;

  // 5. MIS Score Interpretation Card
  page.drawRectangle({
    x: 44,
    y: currentY - 110,
    width: width - 88,
    height: 110,
    color: bgCard,
    borderColor: borderLight,
    borderWidth: 1,
  });

  page.drawText('UNDERSTANDING YOUR MIS PERFORMANCE SCORE', {
    x: 64,
    y: currentY - 26,
    size: 9,
    font: fontBold,
    color: navyDark,
  });

  const bulletPoints = [
    '• 0.00% : Perfect execution (100% of planned tasks completed on schedule).',
    '• Negative % : Completion gap (e.g. -10.00% indicates a 10% shortfall in planned tasks).',
    '• Dash (-) : Week cycle pending or not recorded.',
    '• Monthly Score (MS) : Calculated as the average performance across all active recorded weeks.',
  ];

  bulletPoints.forEach((bp, index) => {
    page.drawText(bp, {
      x: 64,
      y: currentY - 48 - (index * 17),
      size: 8.5,
      font: fontRegular,
      color: textMuted,
    });
  });

  currentY -= 150;

  // 6. System Seal / Status Box
  page.drawRectangle({
    x: 44,
    y: currentY - 45,
    width: width - 88,
    height: 45,
    color: rgb(0.94, 0.98, 0.95),
    borderColor: greenHighlight,
    borderWidth: 1,
  });

  page.drawText('SYSTEM STATUS: AUTOMATED REPORT GENERATED & VERIFIED', {
    x: 64,
    y: currentY - 20,
    size: 8.5,
    font: fontBold,
    color: greenHighlight,
  });

  page.drawText(`Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} | AHL Task Management Engine`, {
    x: 64,
    y: currentY - 34,
    size: 7.5,
    font: fontRegular,
    color: textMuted,
  });

  // 7. Footer
  page.drawLine({
    start: { x: 44, y: 55 },
    end: { x: width - 44, y: 55 },
    thickness: 1,
    color: borderLight,
  });

  page.drawText('American Hairline • Operations & Task Management System', {
    x: 44,
    y: 40,
    size: 8,
    font: fontBold,
    color: textMuted,
  });

  page.drawText('Page 1 of 1', {
    x: width - 90,
    y: 40,
    size: 8,
    font: fontRegular,
    color: textMuted,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Synchronous wrapper for fallback compatibility.
 */
export function buildMonthlyMisPdf(report: MisMonthlyPersonReport): Buffer {
  // Sync fallback produces safe minimal buffer if async is unavailable
  const lines = [
    `AMERICAN HAIRLINE - MONTHLY MIS PERFORMANCE REPORT`,
    `Employee: ${report.name}`,
    `Month: ${report.monthName}`,
    `Week 1: ${formatAppsScriptPercent(report.w1) || '-'}`,
    `Week 2: ${formatAppsScriptPercent(report.w2) || '-'}`,
    `Week 3: ${formatAppsScriptPercent(report.w3) || '-'}`,
    `Week 4: ${formatAppsScriptPercent(report.w4) || '-'}`,
    `Week 5: ${formatAppsScriptPercent(report.w5) || '-'}`,
    `Monthly Score (MS): ${formatAppsScriptPercent(report.ms) || '-'}`,
  ];
  return Buffer.from(lines.join('\n'), 'utf8');
}

/** Exact Apps Script filename: `<name> <Month> Monthly Report.pdf` */
export function monthlyMisPdfFilename(report: MisMonthlyPersonReport) {
  return `${report.name} ${report.monthName} Monthly Report.pdf`;
}

/** Weekly PDF filename: `<name> Week <weekKey> Weekly Report.pdf` */
export function weeklyMisPdfFilename(name: string, weekKey: string) {
  return `${name} Week ${weekKey} Weekly Report.pdf`;
}

/**
 * Generates the exact Google Sheet MIS Report PDF matching the Apps Script Master layout.
 */
export async function buildWeeklyMisPdfAsync(
  score: {
    name: string;
    department?: string;
    planned: number;
    done: number;
    onTime: number;
    gapPercent: number | null;
    onTimeGapPercent?: number | null;
    checklist?: { planned: number; done: number; onTime: number };
    delegation?: { planned: number; done: number; onTime: number };
    fms?: { planned: number; done: number; onTime: number };
    parameters?: Array<{
      id: string;
      label: string;
      section: string;
      planned: number;
      done: number;
      onTime: number;
      gapPercent: number | null;
    }>;
  },
  weekMeta: { weekKey: string; weekStart: string; weekEnd: string; weekNumber?: number },
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  // Landscape A4: 841.89 x 595.28
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Palette matching Google Sheet MIS Report
  const skyBlueHeader = rgb(0.18, 0.70, 0.93);     // #2EB3EE
  const skyBlueLight = rgb(0.40, 0.78, 0.94);      // #66C7F0
  const checklistBlue = rgb(0.68, 0.89, 0.98);     // #AEE2FB
  const dailyBlue = rgb(0.84, 0.94, 0.99);         // #D6F0FC
  const weeklyBlue = rgb(0.91, 0.97, 0.99);        // #E8F7FD
  const yellowDelegation = rgb(0.98, 0.74, 0.22);  // #F9BC38
  const yellowLight = rgb(0.99, 0.85, 0.46);       // #FED876
  const pinkFms = rgb(0.90, 0.52, 0.71);           // #E685B5
  const pinkLight = rgb(0.95, 0.72, 0.84);          // #F3B7D6
  const redScoreBg = rgb(0.90, 0.05, 0.08);        // #E50914 Red
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);
  const grayBorder = rgb(0.35, 0.35, 0.35);

  // Extract work stream buckets
  const params = score.parameters || [];
  const officeParam = params.find(p => p.id === 'office');
  const salonParam = params.find(p => p.id === 'salon');
  const weeklyParam = params.find(p => p.id === 'weekly');

  const dailyPlanned = (officeParam?.planned ?? 0) + (salonParam?.planned ?? 0);
  const dailyDone = (officeParam?.done ?? 0) + (salonParam?.done ?? 0);
  const dailyOnTime = (officeParam?.onTime ?? 0) + (salonParam?.onTime ?? 0);

  const weeklyPlanned = weeklyParam?.planned ?? (score.checklist?.planned ? score.checklist.planned - dailyPlanned : 0);
  const weeklyDone = weeklyParam?.done ?? (score.checklist?.done ? score.checklist.done - dailyDone : 0);
  const weeklyOnTime = weeklyParam?.onTime ?? (score.checklist?.onTime ? score.checklist.onTime - dailyOnTime : 0);

  const checklistPlanned = score.checklist?.planned ?? (dailyPlanned + weeklyPlanned);
  const checklistDone = score.checklist?.done ?? (dailyDone + weeklyDone);
  const checklistOnTime = score.checklist?.onTime ?? (dailyOnTime + weeklyOnTime);

  const delegationPlanned = score.delegation?.planned ?? 0;
  const delegationDone = score.delegation?.done ?? 0;
  const delegationOnTime = score.delegation?.onTime ?? 0;

  const fmsPlanned = score.fms?.planned ?? 0;
  const fmsDone = score.fms?.done ?? 0;
  const fmsOnTime = score.fms?.onTime ?? 0;

  const totalPlanned = score.planned;
  const totalDone = score.done;
  const totalOnTime = score.onTime;

  function calcGap(d: number, p: number): string {
    if (p <= 0) return d > 0 ? '0%' : '';
    const rawGap = ((d / p) * 100) - 100;
    const rounded = Math.round(rawGap * 100) / 100;
    if (Math.abs(rounded) < 0.001) return '0%';
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2)}%`;
  }

  function formatDateDmy(iso: string) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  const startDateDmy = formatDateDmy(weekMeta.weekStart);
  const endDateDmy = formatDateDmy(weekMeta.weekEnd);
  const weekNumStr = String(weekMeta.weekNumber || weekMeta.weekKey.split('-W')[1] || '').replace(/^0+/, '');

  // Layout boundaries
  const startX = 35;
  const startY = pageHeight - 35;
  const contentWidth = pageWidth - 70; // 771.89

  // ─── 1. TOP HEADER SECTION ──────────────────────────────────────────
  const headerHeight = 65;
  const rightBoxWidth = 145;
  const leftTableWidth = contentWidth - rightBoxWidth; // 626.89

  // Save button icon on far left
  const saveBtnWidth = 75;
  page.drawEllipse({
    x: startX + 38,
    y: startY - 22,
    xScale: 34,
    yScale: 14,
    color: rgb(0.65, 0.82, 0.95),
    borderColor: rgb(0.3, 0.5, 0.8),
    borderWidth: 1.5,
  });
  page.drawText('SAVE', {
    x: startX + 22,
    y: startY - 26,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.25, 0.6),
  });

  // Center MIS Report Title Box
  const misTitleWidth = 320;
  const metaColsWidth = leftTableWidth - (saveBtnWidth + 10) - misTitleWidth; // ~221.89
  const metaColW = metaColsWidth / 3;

  // Draw MIS Report Cyan Banner
  page.drawRectangle({
    x: startX + saveBtnWidth + 10,
    y: startY - headerHeight,
    width: misTitleWidth,
    height: headerHeight,
    color: skyBlueHeader,
    borderColor: grayBorder,
    borderWidth: 1,
  });
  page.drawText('MIS Report', {
    x: startX + saveBtnWidth + 65,
    y: startY - 44,
    size: 28,
    font: fontBold,
    color: white,
  });

  // Draw Week Meta Grid
  const metaGridX = startX + saveBtnWidth + 10 + misTitleWidth;
  const metaRowH = headerHeight / 2;

  // Header row for Week Meta
  const metaHeaders = ['Week Start Date', 'Week End Date', 'Week No'];
  metaHeaders.forEach((mh, i) => {
    page.drawRectangle({
      x: metaGridX + i * metaColW,
      y: startY - metaRowH,
      width: metaColW,
      height: metaRowH,
      color: skyBlueLight,
      borderColor: grayBorder,
      borderWidth: 1,
    });
    page.drawText(mh, {
      x: metaGridX + i * metaColW + 4,
      y: startY - 20,
      size: 7.5,
      font: fontBold,
      color: black,
    });
  });

  // Value row for Week Meta
  const metaValues = [startDateDmy, endDateDmy, weekNumStr];
  metaValues.forEach((mv, i) => {
    page.drawRectangle({
      x: metaGridX + i * metaColW,
      y: startY - headerHeight,
      width: metaColW,
      height: metaRowH,
      color: white,
      borderColor: grayBorder,
      borderWidth: 1,
    });
    page.drawText(mv, {
      x: metaGridX + i * metaColW + 8,
      y: startY - headerHeight + 11,
      size: 8.5,
      font: fontBold,
      color: black,
    });
  });

  // Draw Big Red MIS Score Box on Top Right
  const rightBoxX = startX + leftTableWidth;
  const topScoreRowH = 22;

  // Red Header
  page.drawRectangle({
    x: rightBoxX,
    y: startY - topScoreRowH,
    width: rightBoxWidth,
    height: topScoreRowH,
    color: redScoreBg,
    borderColor: grayBorder,
    borderWidth: 1,
  });
  page.drawText('MIS Score', {
    x: rightBoxX + 40,
    y: startY - 15,
    size: 11,
    font: fontBold,
    color: white,
  });

  // Red Score Body (spanning downwards into the header area)
  const scoreBoxTotalH = 120;
  page.drawRectangle({
    x: rightBoxX,
    y: startY - scoreBoxTotalH,
    width: rightBoxWidth,
    height: scoreBoxTotalH - topScoreRowH,
    color: redScoreBg,
    borderColor: grayBorder,
    borderWidth: 1,
  });

  const mainScoreStr = score.gapPercent != null ? `${score.gapPercent.toFixed(2)}%` : '0.00%';
  page.drawText(mainScoreStr, {
    x: rightBoxX + (mainScoreStr.length > 6 ? 12 : 24),
    y: startY - 80,
    size: 32,
    font: fontBold,
    color: white,
  });

  // ─── 2. MAIN TABLE HEADERS ──────────────────────────────────────────
  let curY = startY - headerHeight;

  // Column Widths for the main table (must sum to leftTableWidth)
  const cols = [
    { header: 'Person Name', w: 105 },
    { header: 'KRA', w: 105 },
    { header: 'KPI', w: 85 },
    { header: 'Last Week\nPlanned\nPercentage', w: 65 },
    { header: 'Current Week\nPlanned No Of\nWorks', w: 70 },
    { header: 'Current Week\nAcutal No of\nWorks', w: 66 },
    { header: 'Current Week\nMIS Score', w: 65 },
    { header: 'Next Week\nPlanned\nPercentage', w: 65.89 },
  ];

  const colHeaderH = 42;
  let colX = startX;

  cols.forEach(c => {
    page.drawRectangle({
      x: colX,
      y: curY - colHeaderH,
      width: c.w,
      height: colHeaderH,
      color: skyBlueLight,
      borderColor: grayBorder,
      borderWidth: 1,
    });

    const lines = c.header.split('\n');
    lines.forEach((l, lIdx) => {
      page.drawText(l, {
        x: colX + 4,
        y: curY - 14 - (lIdx * 10),
        size: 7,
        font: fontBold,
        color: black,
      });
    });

    colX += c.w;
  });

  curY -= colHeaderH;

  // ─── 3. TABLE DATA ROWS ─────────────────────────────────────────────
  const rowH = 26;

  function drawDataRow(
    bgLeft: typeof white,
    bgRight: typeof white,
    labelCol1: string | null,
    kra: string,
    kpi: string,
    lastWeek: string,
    plannedVal: number | string,
    actualVal: number | string,
    misScore: string,
    nextWeek: string,
    isFirstRowOfBlock: boolean = false,
  ) {
    let x = startX;

    // Col 1: Person Name / Category Title
    if (labelCol1 !== null) {
      const blockH = rowH * (isFirstRowOfBlock ? 2 : 1);
      page.drawRectangle({
        x,
        y: curY - blockH,
        width: cols[0].w,
        height: blockH,
        color: bgLeft,
        borderColor: grayBorder,
        borderWidth: 1,
      });

      const fontSize = labelCol1.length > 18 ? 8.5 : (labelCol1.length > 12 ? 9.5 : 12);
      const textWidth = fontBold.widthOfTextAtSize(labelCol1, fontSize);
      const textX = x + Math.max(4, (cols[0].w - textWidth) / 2);
      const textY = curY - (blockH / 2) - (fontSize / 3);

      page.drawText(labelCol1, {
        x: textX,
        y: textY,
        size: fontSize,
        font: fontBold,
        color: black,
      });
    }

    x += cols[0].w;

    // Remaining Columns (Cols 2 through 8)
    const rowValues = [
      { text: kra, w: cols[1].w, font: fontRegular, size: 7.2 },
      { text: kpi, w: cols[2].w, font: fontRegular, size: 7.2 },
      { text: lastWeek, w: cols[3].w, font: fontRegular, size: 7.5 },
      { text: String(plannedVal), w: cols[4].w, font: fontBold, size: 8.5 },
      { text: String(actualVal), w: cols[5].w, font: fontBold, size: 8.5 },
      { text: misScore, w: cols[6].w, font: fontBold, size: 8.5, isScore: true },
      { text: nextWeek, w: cols[7].w, font: fontRegular, size: 7.5 },
    ];

    rowValues.forEach(rv => {
      page.drawRectangle({
        x,
        y: curY - rowH,
        width: rv.w,
        height: rowH,
        color: bgRight,
        borderColor: grayBorder,
        borderWidth: 1,
      });

      if (rv.text.includes('\n')) {
        const lines = rv.text.split('\n');
        lines.forEach((line, lIdx) => {
          page.drawText(line, {
            x: x + 4,
            y: curY - 10 - (lIdx * 9),
            size: rv.size,
            font: rv.font,
            color: black,
          });
        });
      } else {
        const isNumeric = /^[0-9\-%.]+$/.test(rv.text);
        const textX = (isNumeric && rv.w > 45 && rv.text.length <= 8)
          ? x + (rv.w - (rv.font === fontBold ? fontBold : fontRegular).widthOfTextAtSize(rv.text, rv.size)) / 2
          : x + 4;

        page.drawText(rv.text, {
          x: Math.max(x + 2, textX),
          y: curY - 16,
          size: rv.size,
          font: rv.font,
          color: rv.isScore && rv.text !== '' && rv.text !== '0%' ? redScoreBg : black,
        });
      }

      x += rv.w;
    });

    curY -= rowH;
  }

  // 1. PERSON SUMMARY BLOCK (White / Light)
  const onTimeScoreStr = score.onTimeGapPercent != null ? (typeof score.onTimeGapPercent === 'number' ? `${score.onTimeGapPercent.toFixed(2)}%` : String(score.onTimeGapPercent)) : '0.00%';
  drawDataRow(white, white, score.name, 'All work should be done', '% Work Not Done', '', totalPlanned, totalDone, mainScoreStr, '', true);
  drawDataRow(white, white, null, 'All work should be done\nOn-Time', '% Work Not Done\nOn-Time', '', totalDone, totalOnTime, onTimeScoreStr, '', false);

  // 2. CHECKLIST TOTAL TASK BLOCK (Light Blue)
  const clDoneGap = calcGap(checklistDone, checklistPlanned);
  const clOtGap = calcGap(checklistOnTime, checklistDone);
  drawDataRow(checklistBlue, checklistBlue, 'Checklist Total Task', 'All work should be done', '% Work Not Done', '', checklistPlanned, checklistDone, clDoneGap, '', true);
  drawDataRow(checklistBlue, checklistBlue, null, 'All work should be done\nOn-Time', '% Work Not Done\nOn-Time', '', checklistDone, checklistOnTime, clOtGap, '', false);

  // 3. DAILY TASK BLOCK (Daily Blue)
  const dDoneGap = calcGap(dailyDone, dailyPlanned);
  const dOtGap = calcGap(dailyOnTime, dailyDone);
  drawDataRow(dailyBlue, dailyBlue, 'Daily Task', 'All work should be done', '% Work Not Done', '', dailyPlanned, dailyDone, dDoneGap, '', true);
  drawDataRow(dailyBlue, dailyBlue, null, 'All work should be done\nOn-Time', '% Work Not Done\nOn-Time', '', dailyDone, dailyOnTime, dOtGap, '', false);

  // 4. WEEKLY & MONTHLY TASK BLOCK (Weekly Blue)
  const wDoneGap = calcGap(weeklyDone, weeklyPlanned);
  const wOtGap = calcGap(weeklyOnTime, weeklyDone);
  drawDataRow(weeklyBlue, weeklyBlue, 'Weekly & Monthly Task', 'All work should be done', '% Work Not Done', '', weeklyPlanned, weeklyDone, wDoneGap, '', true);
  drawDataRow(weeklyBlue, weeklyBlue, null, 'All work should be done\nOn-Time', '% Work Not Done\nOn-Time', '', weeklyDone, weeklyOnTime, wOtGap, '', false);

  // 5. DELEGATION TOTAL TASK BLOCK (Yellow)
  const delDoneGap = calcGap(delegationDone, delegationPlanned);
  const delOtGap = calcGap(delegationOnTime, delegationDone);
  drawDataRow(yellowDelegation, yellowLight, 'Delegation Total Task', 'All work should be done', '% Work Not Done', '', delegationPlanned, delegationDone, delDoneGap, '', true);
  drawDataRow(yellowDelegation, yellowLight, null, 'All work should be done\nOn-Time', '% Work Not Done\nOn-Time', '', delegationDone, delegationOnTime, delOtGap, '', false);

  // 6. FMS TOTAL TASK BLOCK (Pink)
  const fmsDoneGap = calcGap(fmsDone, fmsPlanned);
  const fmsOtGap = calcGap(fmsOnTime, fmsDone);
  drawDataRow(pinkFms, pinkLight, 'FMS Total Task', 'All work should be done', '% Work Not Done', '', fmsPlanned, fmsDone, fmsDoneGap, '', true);
  drawDataRow(pinkFms, pinkLight, null, 'All work should be done\nOn-Time', '% Work Not Done\nOn-Time', '', fmsDone, fmsOnTime, fmsOtGap, '', false);

  // ─── 4. RIGHT SIDE BOTTOM BLANK GRID FILLER ─────────────────────────
  const remainingH = (startY - scoreBoxTotalH) - (curY);
  if (remainingH > 0) {
    page.drawRectangle({
      x: rightBoxX,
      y: curY,
      width: rightBoxWidth,
      height: remainingH,
      color: rgb(0.96, 0.96, 0.96),
      borderColor: grayBorder,
      borderWidth: 1,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}



