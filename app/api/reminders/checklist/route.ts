import { NextRequest, NextResponse } from 'next/server';
// import { handleChecklistReminder } from '@/lib/reminders/checklist';

/**
 * GET /api/reminders/checklist
 * Disabled — Checklist reminders stay in Google Sheets (Apps Script).
 * Preserved for future reference if needed.
 */
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Checklist reminders are disabled in Next.js (handled via Google Sheets Apps Script).',
  });
  // return handleChecklistReminder(req);
}

