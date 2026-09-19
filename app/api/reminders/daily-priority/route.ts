import { NextRequest, NextResponse } from 'next/server';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import {
  formatDdMmYyyy,
  isOpenOneTimeTask,
  oneTimeDueOnDay,
} from '@/lib/reminders/oneTime';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import { formatDate } from '@/lib/utils';
import { sendWhatsApp, msgDailyHighPriorityTasks, msgDailyTasksDueToday } from '@/lib/waha';
import type { Task } from '@/types';

/**
 * GET /api/reminders/daily-priority
 * Replaces newdelegation morning reminder (sendDailyTaskReminderMorning).
 *
 * ?mode=today (default) — all open One Time due today (IST), grouped per person
 * ?mode=priority — top 5 open One Time by overdue/priority (legacy digest)
 */
function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = req.headers.get('x-cron-secret');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return headerSecret === secret || bearer === secret;
}

function taskRank(task: Task) {
  const overdueRank = task.status === 'Overdue' ? 0 : 1;
  const priorityRank = task.priority === 'High' ? 0 : task.priority === 'Medium' ? 1 : 2;
  return `${overdueRank}-${priorityRank}-${task.endDate?.toMillis() ?? Number.MAX_SAFE_INTEGER}-${task.createdAt.toMillis()}`;
}

export async function GET(req: NextRequest) {
  const mode = new URL(req.url).searchParams.get('mode') || 'today';
  const sent: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    const [users, tasks] = await Promise.all([
      adminGetAllUsers(),
      adminGetAllTasks({ limit: null }),
    ]);

    const todayKey = indiaTodayKey();
    const dateLabel = (() => {
      const [y, m, d] = todayKey.split('-');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d} ${months[Number(m) - 1]} ${y}`;
    })();

    const activeUsers = users.filter(user => user.isActive !== false && user.waNumber);

    for (const user of activeUsers) {
      try {
        const mine = tasks.filter(task => task.assignedTo === user.uid && isOpenOneTimeTask(task));

        if (mode === 'priority') {
          const topTasks = mine.sort((a, b) => taskRank(a).localeCompare(taskRank(b))).slice(0, 5);
          await sendWhatsApp(
            user.waNumber,
            msgDailyHighPriorityTasks({
              name: user.name,
              tasks: topTasks.map(task => ({
                taskId: task.taskId,
                description: task.description,
                endDate: task.endDate ? formatDate(task.endDate.toDate().toISOString()) : 'Not set yet',
                status: task.status,
              })),
            }),
          );
          await adminLog('REMINDER', `Daily one-time priority summary sent to ${user.name}`, {
            uid: user.uid,
            meta: { mode, taskIds: topTasks.map(task => task.taskId) },
          });
        } else {
          const dueToday = oneTimeDueOnDay(mine, todayKey);
          if (dueToday.length === 0) {
            skipped.push(user.uid);
            continue;
          }
          await sendWhatsApp(
            user.waNumber,
            msgDailyTasksDueToday({
              name: user.name,
              dateLabel,
              tasks: dueToday.map(task => ({
                description: task.description,
                endDate: formatDdMmYyyy(task),
              })),
            }),
          );
          await adminLog('REMINDER', `Daily due-today reminder sent to ${user.name}`, {
            uid: user.uid,
            meta: { mode: 'today', taskIds: dueToday.map(task => task.taskId) },
          });
        }
        sent.push(user.uid);
      } catch (err) {
        errors.push(`${user.uid}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      mode,
      sent: sent.length,
      skipped: skipped.length,
      errors,
    });
  } catch (err) {
    console.error('Daily priority reminder error', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
