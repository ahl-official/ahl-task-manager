import type { MisMonthlyPersonReport } from '@/lib/mis/types';
import { formatAppsScriptPercent } from '@/lib/mis/sheetFormula';

/**
 * Fallback PDF when Google Doc template is unavailable.
 * Uses the same Apps Script percent display: (decimal * 100).toFixed(2) + '%'
 */
export function buildMonthlyMisPdf(report: MisMonthlyPersonReport): Buffer {
  const lines = [
    `${report.name} ${report.monthName} Monthly Report`,
    '',
    `<<name>> → ${report.name}`,
    `<<w1>> → ${formatAppsScriptPercent(report.w1) || '—'}`,
    `<<w2>> → ${formatAppsScriptPercent(report.w2) || '—'}`,
    `<<w3>> → ${formatAppsScriptPercent(report.w3) || '—'}`,
    `<<w4>> → ${formatAppsScriptPercent(report.w4) || '—'}`,
    `<<w5>> → ${formatAppsScriptPercent(report.w5) || '—'}`,
    `<<ms>> → ${formatAppsScriptPercent(report.ms) || '—'}`,
  ];

  const contentLines: string[] = ['BT', '/F1 14 Tf', '50 750 Td', '18 TL'];
  lines.forEach((line, index) => {
    const safe = pdfEscape(line);
    if (index === 0) contentLines.push(`(${safe}) Tj`);
    else contentLines.push('T*', `(${safe}) Tj`);
  });
  contentLines.push('ET');
  const stream = contentLines.join('\n');

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
  );
  objects.push(`4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`);
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

/** Exact Apps Script filename: `<name> <Month> Monthly Report.pdf` */
export function monthlyMisPdfFilename(report: MisMonthlyPersonReport) {
  return `${report.name} ${report.monthName} Monthly Report.pdf`;
}

function pdfEscape(value: string) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}
