import { NextRequest, NextResponse } from 'next/server';
import {
  adminGetOverdueTasks,
  adminGetTasksDueWithinHours,
  adminUpdateTaskStatus,
} from '@/lib/firebase/tasks';
import { adminLog } from '@/lib/firebase/scores';
import { sendWhatsApp, msgReminder } from '@/lib/waha';
import { formatDate } from '@/lib/utils';

// GET /api/reminders — called by cron (Vercel cron or external)
// Protected by CRON_SECRET header
export async function GET(req: NextRequest) {
  const headerSecret = req.headers.get('x-cron-secret');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || (headerSecret !== process.env.CRON_SECRET && bearer !== process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let sent = 0;
  const errors: string[] = [];

  try {
    // ── Mark overdue ──────────────────────────────────────────────────────
    const overdueTasks = await adminGetOverdueTasks();
    for (const task of overdueTasks) {
      try {
        if (task.status !== 'Overdue') {
          await adminUpdateTaskStatus(task.taskId, 'Overdue');
        }

        await sendWhatsApp(
          task.assignedToWa,
          msgReminder({
            taskId:      task.taskId,
            description: task.description,
            endDate:     formatDate(task.endDate?.toDate().toISOString()),
            urgency:     'overdue',
          }),
          task.taskId,
        );

        await adminLog('REMINDER', `Overdue reminder sent for ${task.taskId}`, { taskId: task.taskId });
        sent++;
      } catch (err) {
        errors.push(`${task.taskId}: ${String(err)}`);
      }
    }

    // ── 48h reminders ─────────────────────────────────────────────────────
    const tasks48h = await adminGetTasksDueWithinHours(48);
    const tasks24h = await adminGetTasksDueWithinHours(24);
    const tasks24hIds = new Set(tasks24h.map(t => t.taskId));

    for (const task of tasks48h) {
      if (tasks24hIds.has(task.taskId)) continue; // Will be caught by 24h
      try {
        await sendWhatsApp(
          task.assignedToWa,
          msgReminder({
            taskId:      task.taskId,
            description: task.description,
            endDate:     formatDate(task.endDate?.toDate().toISOString()),
            urgency:     '48h',
          }),
          task.taskId,
        );
        await adminLog('REMINDER', `48h reminder for ${task.taskId}`, { taskId: task.taskId });
        sent++;
      } catch (err) {
        errors.push(`${task.taskId}: ${String(err)}`);
      }
    }

    // ── 24h reminders ─────────────────────────────────────────────────────
    // Filter tasks due in next 24h but not in next 0-1h (those are "today")
    const tasks1h    = await adminGetTasksDueWithinHours(1);
    const tasks1hIds = new Set(tasks1h.map(t => t.taskId));

    for (const task of tasks24h) {
      if (tasks1hIds.has(task.taskId)) continue;
      try {
        await sendWhatsApp(
          task.assignedToWa,
          msgReminder({
            taskId:      task.taskId,
            description: task.description,
            endDate:     formatDate(task.endDate?.toDate().toISOString()),
            urgency:     '24h',
          }),
          task.taskId,
        );
        await adminLog('REMINDER', `24h reminder for ${task.taskId}`, { taskId: task.taskId });
        sent++;
      } catch (err) {
        errors.push(`${task.taskId}: ${String(err)}`);
      }
    }

    // ── Due today reminders ───────────────────────────────────────────────
    for (const task of tasks1h) {
      try {
        await sendWhatsApp(
          task.assignedToWa,
          msgReminder({
            taskId:      task.taskId,
            description: task.description,
            endDate:     formatDate(task.endDate?.toDate().toISOString()),
            urgency:     'today',
          }),
          task.taskId,
        );
        await adminLog('REMINDER', `Due today reminder for ${task.taskId}`, { taskId: task.taskId });
        sent++;
      } catch (err) {
        errors.push(`${task.taskId}: ${String(err)}`);
      }
    }

    return NextResponse.json({ success: true, sent, errors });
  } catch (err) {
    console.error('Reminders cron error', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
