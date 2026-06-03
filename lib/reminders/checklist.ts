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

export async function handleChecklistReminder(req: NextRequest, forcedCategory?: string) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = forcedCategory ?? searchParams.get('category') ?? 'Daily';
  if (!isRecurringCategory(category)) {
    return NextResponse.json({ success: false, error: 'Invalid checklist category' }, { status: 400 });
  }

  if (category === 'Monthly' && !isLastIndiaCalendarDay()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Not the last calendar day in India' });
  }

  const sent: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    const [users, groups] = await Promise.all([
      adminGetAllUsers(),
      adminGetChecklistTasksForCategory(category as TaskCategory),
    ]);
    const usersByUid = new Map(users.map(user => [user.uid, user]));

    for (const group of groups) {
      const user = usersByUid.get(group.uid);
      if (!user?.isActive || !user.waNumber) {
        skipped.push(group.uid);
        continue;
      }

      const pending = group.tasks
        .filter(row => !row.completed)
        .map(row => row.task);

      if (pending.length === 0) {
        skipped.push(group.uid);
        continue;
      }

      try {
        await sendWhatsApp(
          user.waNumber,
          msgChecklistReminder({
            name: user.name,
            category: category as 'Daily' | 'Weekly' | 'Monthly',
            tasks: pending.map(task => ({
              taskId: task.taskId,
              description: task.description,
              status: task.status,
            })),
          }),
        );

        await adminLog('REMINDER', `${category} checklist reminder sent to ${user.name}`, {
          uid: user.uid,
          meta: { category, taskIds: pending.map(task => task.taskId) },
        });
        sent.push(user.uid);
      } catch (err) {
        errors.push(`${user.uid}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      category,
      sent: sent.length,
      skipped: skipped.length,
      errors,
    });
  } catch (err) {
    console.error('Checklist reminder error', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
