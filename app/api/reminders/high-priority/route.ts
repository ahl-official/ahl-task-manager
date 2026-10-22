import { isCronOrAdmin } from "@/lib/utils/cronAuth";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { adminGetReminderTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import {
  formatDdMmYyyy,
  indiaHourNow,
  oneTimeHighPriority,
} from '@/lib/reminders/oneTime';
import { automatedWhatsAppDisabled, sendWhatsApp, msgHighPriorityRedBall } from '@/lib/waha';
import { indiaTodayKey } from '@/lib/utils/indiaDate';

/**
 * GET /api/reminders/high-priority
 * Replaces newdelegation 2hourRedBallReminder (High priority 🔴).
 * Only sends during IST 11:00–19:00 unless ?force=1.
 */

export async function GET(req: NextRequest) {
  if (!await isCronOrAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (automatedWhatsAppDisabled()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'WhatsApp reminders disabled', sent: 0 });
  }

  const force = new URL(req.url).searchParams.get('force') === '1';
  const hour = indiaHourNow();
  if (!force && (hour < 11 || hour >= 19)) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: `Outside IST working hours (11–19); hour=${hour}`,
      sent: 0,
    });
  }

  const sent: string[] = [];
  const errors: string[] = [];

  try {
    const [users, tasks] = await Promise.all([
      adminGetAllUsers(),
      adminGetReminderTasks('high', indiaTodayKey()),
    ]);

    const high = oneTimeHighPriority(tasks);
    const byUid = new Map<string, typeof high>();
    for (const task of high) {
      const list = byUid.get(task.assignedTo) ?? [];
      list.push(task);
      byUid.set(task.assignedTo, list);
    }

    const usersByUid = new Map(users.map(user => [user.uid, user]));

    for (const [uid, userTasks] of Array.from(byUid.entries())) {
      const user = usersByUid.get(uid);
      const phone = user?.waNumber || userTasks[0]?.assignedToWa || '';
      const name = user?.name || userTasks[0]?.assignedToName || 'there';
      if (!phone) {
        errors.push(`${uid}: no WhatsApp number`);
        continue;
      }
      try {
        await sendWhatsApp(
          phone,
          msgHighPriorityRedBall({
            name,
            tasks: userTasks.map(task => ({
              taskId: task.taskId,
              description: task.description,
              deadline: formatDdMmYyyy(task),
            })),
          }),
        );
        await adminLog('REMINDER', `High-priority (Red Ball) reminder sent to ${name}`, {
          uid,
          meta: { taskIds: userTasks.map(task => task.taskId) },
        });
        sent.push(uid);
      } catch (err) {
        errors.push(`${uid}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      sent: sent.length,
      people: high.length,
      errors,
    });
  } catch (err) {
    console.error('High-priority reminder error', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
