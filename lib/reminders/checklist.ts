/*
import { NextRequest, NextResponse } from 'next/server';
import { adminGetChecklistTasksForCategory, isRecurringCategory } from '@/lib/firebase/checklist';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import { sendWhatsApp, msgChecklistReminder } from '@/lib/waha';
import type { TaskCategory } from '@/types';

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const headerSecret = req.headers.get('x-cron-secret');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return headerSecret === secret || bearer === secret;
}

function getIndiaDateParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 330 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function isLastIndiaCalendarDay(date = new Date()) {
  const { year, month, day } = getIndiaDateParts(date);
  const tomorrow = new Date(Date.UTC(year, month, day + 1));
  return tomorrow.getUTCMonth() !== month;
}
*/

import { NextRequest, NextResponse } from 'next/server';

/**
 * DISABLED / COMMENTED OUT FOR FUTURE REFERENCE:
 * Checklist reminders are handled in Google Sheets (Apps Script).
 */
export async function handleChecklistReminder(_req: NextRequest, forcedCategory?: string) {
  return NextResponse.json({
    success: true,
    category: forcedCategory ?? 'Daily',
    message: 'Checklist reminders are disabled in Next.js (handled via Google Sheets Apps Script).',
  });
}

