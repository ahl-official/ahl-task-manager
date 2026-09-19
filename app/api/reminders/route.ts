import { NextRequest, NextResponse } from 'next/server';
import {
  adminGetAllTasks,
  adminGetTasksDueWithinHours,
  adminUpdateTaskStatus,
} from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import {
  formatDdMmYyyy,
  isOpenOneTimeTask,
  isOneTimeTask,
  taskEndDateKey,
} from '@/lib/reminders/oneTime';
import { indiaDayOffset, indiaTodayKey } from '@/lib/utils/indiaDate';
import { sendWhatsApp, msgReminder, msgRecentOverdueTasks } from '@/lib/waha';
import { formatDate } from '@/lib/utils';
import type { Task } from '@/types';

/**
 * GET /api/reminders — One Time escalation cron (replaces newdelegation proximity nudges).
 * Checks last 2 days' due dates for open/overdue tasks per person and sends grouped alert.
 * Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const errors: string[] = [];
  let sent = 0;

  try {
    const [tasks, users] = await Promise.all([
      adminGetAllTasks({ limit: null }),
      adminGetAllUsers(),
    ]);

    const todayKey = indiaTodayKey();
    const usersByUid = new Map(users.map(u => [u.uid, u]));
    const recentOverdueByUid = new Map<string, Array<{ task: Task; daysOverdue: number; dueDateFormatted: string }>>();

    const openTasks = tasks.filter(isOpenOneTimeTask);
    for (const task of openTasks) {
      const endKey = taskEndDateKey(task);
      if (!endKey) continue;
      const offset = indiaDayOffset(todayKey, endKey);

      // Check tasks due within the last 2 days (yesterday: -1, day before yesterday: -2)
      if (offset === -1 || offset === -2) {
        if (task.status !== 'Overdue') {
          await adminUpdateTaskStatus(task.taskId, 'Overdue').catch(console.error);
        }
        const list = recentOverdueByUid.get(task.assignedTo) ?? [];
        list.push({
          task,
          daysOverdue: Math.abs(offset),
          dueDateFormatted: formatDdMmYyyy(task),
        });
        recentOverdueByUid.set(task.assignedTo, list);
      }
    }

    for (const [uid, items] of Array.from(recentOverdueByUid.entries())) {
      const user = usersByUid.get(uid);
      const phone = user?.waNumber || items[0].task.assignedToWa;
      const name = user?.name || items[0].task.assignedToName || 'there';
      if (!phone) {
        errors.push(`${uid}: no WhatsApp number`);
        continue;
      }
      try {
        await sendWhatsApp(
          phone,
          msgRecentOverdueTasks({
            name,
            tasks: items.map(item => ({
              taskId: item.task.taskId,
              description: item.task.description,
              dueDate: item.dueDateFormatted,
              daysOverdue: item.daysOverdue,
            })),
          }),
          items.map(item => item.task.taskId).join(', '),
        );
        await adminLog('REMINDER', `Recent 2-day overdue reminder sent to ${name} (${items.length} tasks)`, {
          uid,
          meta: { taskIds: items.map(item => item.task.taskId) },
        });
        sent++;
      } catch (err) {
        errors.push(`${name} (${uid}): ${String(err)}`);
      }
    }

    const tasks48h = (await adminGetTasksDueWithinHours(48)).filter(isOneTimeTask);
    const tasks24h = (await adminGetTasksDueWithinHours(24)).filter(isOneTimeTask);
    const tasks24hIds = new Set(tasks24h.map(t => t.taskId));

    for (const task of tasks48h) {
      if (tasks24hIds.has(task.taskId)) continue;
      try {
        await sendWhatsApp(
          task.assignedToWa,
          msgReminder({
            taskId: task.taskId,
            description: task.description,
            endDate: formatDate(task.endDate?.toDate().toISOString()),
            urgency: '48h',
          }),
          task.taskId,
        );
        await adminLog('REMINDER', `48h reminder for ${task.taskId}`, { taskId: task.taskId });
        sent++;
      } catch (err) {
        errors.push(`${task.taskId}: ${String(err)}`);
      }
    }

    const tasks1h = (await adminGetTasksDueWithinHours(1)).filter(isOneTimeTask);
    const tasks1hIds = new Set(tasks1h.map(t => t.taskId));

    for (const task of tasks24h) {
      if (tasks1hIds.has(task.taskId)) continue;
      try {
        await sendWhatsApp(
          task.assignedToWa,
          msgReminder({
            taskId: task.taskId,
            description: task.description,
            endDate: formatDate(task.endDate?.toDate().toISOString()),
            urgency: '24h',
          }),
          task.taskId,
        );
        await adminLog('REMINDER', `24h reminder for ${task.taskId}`, { taskId: task.taskId });
        sent++;
      } catch (err) {
        errors.push(`${task.taskId}: ${String(err)}`);
      }
    }

    for (const task of tasks1h) {
      try {
        await sendWhatsApp(
          task.assignedToWa,
          msgReminder({
            taskId: task.taskId,
            description: task.description,
            endDate: formatDate(task.endDate?.toDate().toISOString()),
            urgency: 'today',
          }),
          task.taskId,
        );
        await adminLog('REMINDER', `Due today reminder for ${task.taskId}`, { taskId: task.taskId });
        sent++;
      } catch (err) {
        errors.push(`${task.taskId}: ${String(err)}`);
      }
    }

    return NextResponse.json({ success: true, sent, errors, scope: 'One Time' });
  } catch (err) {
    console.error('Reminders cron error', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
