import { isCronOrAdmin } from "@/lib/utils/cronAuth";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import {
  adminGetReminderTasks,
  adminUpdateTaskStatus,
} from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import {
  formatDdMmYyyy,
  isOpenOneTimeTask,
  taskEndDateKey,
} from '@/lib/reminders/oneTime';
import { indiaDayOffset, indiaTodayKey } from '@/lib/utils/indiaDate';
import { automatedWhatsAppDisabled, sendWhatsApp, msgRecentOverdueTasks } from '@/lib/waha';
import type { Task } from '@/types';

/**
 * GET /api/reminders — One Time escalation cron.
 * Checks last 2 days' due dates for open/overdue tasks per person and sends grouped alert.
 * Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (!await isCronOrAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (automatedWhatsAppDisabled()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'WhatsApp reminders disabled', sent: 0 });
  }
  const errors: string[] = [];
  let sent = 0;

  try {
    const users = await adminGetAllUsers();
    const activeUsers = users.filter(u => {
      if (u.isActive === false) return false;
      const digits = String(u.waNumber || '').replace(/\D/g, '');
      return digits.length >= 10;
    });

    if (activeUsers.length === 0) {
      return NextResponse.json({ success: true, sent: 0, errors: [], scope: 'One Time Overdue', message: 'No active users with valid WhatsApp numbers' });
    }

    const tasks = await adminGetReminderTasks('recent', indiaTodayKey());
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
      if (user?.isActive === false) continue;
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

    return NextResponse.json({ success: true, sent, errors, scope: 'One Time Overdue' });
  } catch (err) {
    console.error('Reminders cron error', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
