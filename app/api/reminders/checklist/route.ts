import { NextRequest } from 'next/server';
import { handleChecklistReminder } from '@/lib/reminders/checklist';

export async function GET(req: NextRequest) {
  return handleChecklistReminder(req);
}
