import { NextRequest } from 'next/server';
import { handleChecklistReminder } from '@/lib/reminders/checklist';

export async function GET(
  req: NextRequest,
  { params }: { params: { category: string } },
) {
  return handleChecklistReminder(req, params.category);
}
