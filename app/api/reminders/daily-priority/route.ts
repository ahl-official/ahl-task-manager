import { NextRequest, NextResponse } from 'next/server';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import { formatDate } from '@/lib/utils';
import { sendWhatsApp, msgDailyHighPriorityTasks } from '@/lib/waha';
import type { Task } from '@/types';

const OPEN_STATUSES = new Set(['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue']);

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const headerSecret = req.headers.get('x-cron-secret');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return headerSecret === secret || bearer === secret;
}

function taskRank(task: Task) {
  const overdueRank = task.status === 'Overdue' ? 0 : 1;
  return `${overdueRank}-${task.endDate.toMillis()}-${task.createdAt.toMillis()}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const sent: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    const [users, tasks] = await Promise.all([
      adminGetAllUsers(),
      adminGetAllTasks(),
    ]);

    const activeUsers = users.filter(user => user.isActive && user.waNumber);

    for (const user of activeUsers) {
      try {
        const topTasks = tasks
          .filter(task =>
            task.assignedTo === user.uid &&
            task.priority === 'High' &&
            OPEN_STATUSES.has(task.status)
          )
          .sort((a, b) => taskRank(a).localeCompare(taskRank(b)))
          .slice(0, 5);

        await sendWhatsApp(
          user.waNumber,
          msgDailyHighPriorityTasks({
            name: user.name,
            tasks: topTasks.map(task => ({
              taskId: task.taskId,
              description: task.description,
              endDate: formatDate(task.endDate.toDate().toISOString()),
              status: task.status,
            })),
          }),
        );

        await adminLog('REMINDER', `Daily high-priority summary sent to ${user.name}`, {
          uid: user.uid,
          meta: { taskIds: topTasks.map(task => task.taskId) },
        });
        sent.push(user.uid);
      } catch (err) {
        errors.push(`${user.uid}: ${String(err)}`);
      }
    }

    users
      .filter(user => !user.isActive || !user.waNumber)
      .forEach(user => skipped.push(user.uid));

    return NextResponse.json({
      success: true,
      sent: sent.length,
      skipped: skipped.length,
      errors,
    });
  } catch (err) {
    console.error('Daily priority reminder error', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
