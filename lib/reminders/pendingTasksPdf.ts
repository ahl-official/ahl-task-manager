import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';

export interface PendingTaskPdfItem {
  srNo: number;
  description: string;
  remarks: string;
  targetDate: string;
}

export interface PendingTasksPdfData {
  userName: string;
  tasks: PendingTaskPdfItem[];
}

function cleanPdfText(text: string): string {
  return String(text ?? '')
    .replace(/[^\x20-\x7E\t\n\r]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export async function buildDailyPendingTasksPdf(data: PendingTasksPdfData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();

  // A4 Landscape: 841.89 x 595.28 pt
  const pageWidth = 841.89;
  const pageHeight = 595.28;

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const black = rgb(0, 0, 0);
  const marginX = 36;
  const marginTop = 36;
  const marginBottom = 36;

  // Column definitions matching the exact table layout
  // Total content width = 841.89 - 72 = 769.89 pt
  const colWidths = {
    srNo: 48,
    desc: 470,
    remarks: 130,
    targetDate: 121.89,
  };

  const colX = {
    srNo: marginX,
    desc: marginX + colWidths.srNo,
    remarks: marginX + colWidths.srNo + colWidths.desc,
    targetDate: marginX + colWidths.srNo + colWidths.desc + colWidths.remarks,
    end: marginX + colWidths.srNo + colWidths.desc + colWidths.remarks + colWidths.targetDate,
  };

  const fontSizeHeader = 12.5;
  const fontSizeBody = 11;
  const lineHeight = 15.5;
  const cellPaddingX = 8;
  const cellPaddingY = 8;

  function wrapTextLines(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
    const rawParagraphs = cleanPdfText(text).split('\n');
    const resultLines: string[] = [];

    for (const paragraph of rawParagraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) {
        resultLines.push('');
        continue;
      }
      const rawTokens = trimmed.split(/\s+/);
      const words: string[] = [];

      for (const token of rawTokens) {
        if (font.widthOfTextAtSize(token, size) <= maxWidth) {
          words.push(token);
        } else {
          // Token is wider than column (e.g. long URL or continuous string) -> break into character chunks
          let sub = '';
          for (const char of token) {
            if (font.widthOfTextAtSize(sub + char, size) <= maxWidth) {
              sub += char;
            } else {
              if (sub) words.push(sub);
              sub = char;
            }
          }
          if (sub) words.push(sub);
        }
      }

      let curLine = '';
      for (const word of words) {
        const test = curLine ? `${curLine} ${word}` : word;
        const w = font.widthOfTextAtSize(test, size);
        if (w <= maxWidth) {
          curLine = test;
        } else {
          if (curLine) resultLines.push(curLine);
          curLine = word;
        }
      }
      if (curLine) resultLines.push(curLine);
    }
    return resultLines.length > 0 ? resultLines : [''];
  }

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let curY = pageHeight - marginTop;

  function drawTableHeader(page: PDFPage, y: number): number {
    const headerHeight = 36;
    const bottomY = y - headerHeight;

    // Outer and vertical borders
    page.drawRectangle({
      x: marginX,
      y: bottomY,
      width: colX.end - marginX,
      height: headerHeight,
      borderColor: black,
      borderWidth: 1,
    });

    // Vertical column dividers
    page.drawLine({ start: { x: colX.desc, y }, end: { x: colX.desc, y: bottomY }, color: black, thickness: 1 });
    page.drawLine({ start: { x: colX.remarks, y }, end: { x: colX.remarks, y: bottomY }, color: black, thickness: 1 });
    page.drawLine({ start: { x: colX.targetDate, y }, end: { x: colX.targetDate, y: bottomY }, color: black, thickness: 1 });

    // Text in headers
    // Sr No (multiline: Sr \n No)
    page.drawText('Sr', { x: colX.srNo + cellPaddingX, y: y - 16, size: fontSizeHeader, font: fontBold, color: black });
    page.drawText('No', { x: colX.srNo + cellPaddingX, y: y - 29, size: fontSizeHeader, font: fontBold, color: black });

    // Task Description
    page.drawText('Task Description', { x: colX.desc + cellPaddingX, y: y - 22, size: fontSizeHeader, font: fontBold, color: black });

    // Remarks
    page.drawText('Remarks', { x: colX.remarks + cellPaddingX, y: y - 22, size: fontSizeHeader, font: fontBold, color: black });

    // Target Date
    page.drawText('Target Date', { x: colX.targetDate + cellPaddingX, y: y - 22, size: fontSizeHeader, font: fontBold, color: black });

    return bottomY;
  }

  // Draw initial header
  curY = drawTableHeader(currentPage, curY);

  for (const task of data.tasks) {
    const descLines = wrapTextLines(task.description || '', colWidths.desc - cellPaddingX * 2, fontRegular, fontSizeBody);
    const remarksLines = wrapTextLines(task.remarks || '', colWidths.remarks - cellPaddingX * 2, fontRegular, fontSizeBody);
    const targetDateLines = wrapTextLines(task.targetDate || '', colWidths.targetDate - cellPaddingX * 2, fontRegular, fontSizeBody);

    const maxLineCount = Math.max(descLines.length, remarksLines.length, targetDateLines.length, 1);

    // We can render lines across page boundaries if a task has many lines!
    let lineIdx = 0;

    while (lineIdx < maxLineCount) {
      const remainingPageHeight = curY - marginBottom;
      const linesFit = Math.floor((remainingPageHeight - cellPaddingY * 2) / lineHeight);

      if (linesFit <= 0) {
        // Create new page
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        curY = pageHeight - marginTop;
        curY = drawTableHeader(currentPage, curY);
        continue;
      }

      const chunkLineCount = Math.min(maxLineCount - lineIdx, Math.max(1, linesFit));
      const chunkHeight = chunkLineCount * lineHeight + cellPaddingY * 2;
      const rowBottomY = curY - chunkHeight;

      // Draw row box
      currentPage.drawRectangle({
        x: marginX,
        y: rowBottomY,
        width: colX.end - marginX,
        height: chunkHeight,
        borderColor: black,
        borderWidth: 1,
      });

      // Vertical lines
      currentPage.drawLine({ start: { x: colX.desc, y: curY }, end: { x: colX.desc, y: rowBottomY }, color: black, thickness: 1 });
      currentPage.drawLine({ start: { x: colX.remarks, y: curY }, end: { x: colX.remarks, y: rowBottomY }, color: black, thickness: 1 });
      currentPage.drawLine({ start: { x: colX.targetDate, y: curY }, end: { x: colX.targetDate, y: rowBottomY }, color: black, thickness: 1 });

      // If first chunk of task, print Sr No
      if (lineIdx === 0) {
        currentPage.drawText(String(task.srNo), {
          x: colX.srNo + cellPaddingX,
          y: curY - cellPaddingY - 10,
          size: fontSizeBody,
          font: fontRegular,
          color: black,
        });
      }

      // Draw text for description
      for (let i = 0; i < chunkLineCount; i++) {
        const textIdx = lineIdx + i;
        const textY = curY - cellPaddingY - (i * lineHeight) - 10;

        if (descLines[textIdx]) {
          currentPage.drawText(descLines[textIdx], {
            x: colX.desc + cellPaddingX,
            y: textY,
            size: fontSizeBody,
            font: fontRegular,
            color: black,
          });
        }

        if (remarksLines[textIdx]) {
          currentPage.drawText(remarksLines[textIdx], {
            x: colX.remarks + cellPaddingX,
            y: textY,
            size: fontSizeBody,
            font: fontRegular,
            color: black,
          });
        }

        if (targetDateLines[textIdx]) {
          currentPage.drawText(targetDateLines[textIdx], {
            x: colX.targetDate + cellPaddingX,
            y: textY,
            size: fontSizeBody,
            font: fontRegular,
            color: black,
          });
        }
      }

      lineIdx += chunkLineCount;
      curY = rowBottomY;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
