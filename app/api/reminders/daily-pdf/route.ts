import { isCronOrAdmin } from "@/lib/utils/cronAuth";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { adminGetReminderTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import { isOpenOneTimeTask, taskEndDateKey } from '@/lib/reminders/oneTime';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import { automatedWhatsAppDisabled, sendWhatsAppFile } from '@/lib/waha';
import { buildDailyPendingTasksPdf } from '@/lib/reminders/pendingTasksPdf';
import type { Task } from '@/types';


function formatTargetDate(task: Task): string {
  const d = task.endDate?.toDate?.() ?? null;
  if (!d) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getDate();
  const mon = months[d.getMonth()];
  const yr = d.getFullYear();
  return `${day}-${mon}-${yr}`;
}

export async function GET(req: NextRequest) {
  if (!await isCronOrAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (automatedWhatsAppDisabled()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'WhatsApp reminders disabled', sent: 0 });
  }

  const targetUid = new URL(req.url).searchParams.get('uid');
  const sent: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    const users = await adminGetAllUsers();

    const todayKey = indiaTodayKey();
    const activeUsers = users.filter(user => {
      if (user.isActive === false) return false;
      const digits = String(user.waNumber || '').replace(/\D/g, '');
      return digits.length >= 10;
    });
    const targetUsers = targetUid
      ? activeUsers.filter(u => u.uid === targetUid)
      : activeUsers;

    if (targetUsers.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        skipped: 0,
        errors: [],
        message: 'No eligible active users with valid WhatsApp numbers found',
      });
    }

    for (const user of targetUsers) {
      try {
        // Include ALL open (not marked done) pending tasks for the user
        const tasks = await adminGetReminderTasks('open', todayKey, user.uid);
        const userPendingTasks = tasks.filter(
          task => task.assignedTo === user.uid && isOpenOneTimeTask(task)
        );

        if (userPendingTasks.length === 0) {
          skipped.push(user.uid);
          continue;
        }

        const pdfBuffer = await buildDailyPendingTasksPdf({
          userName: user.name,
          tasks: userPendingTasks.map((task, idx) => ({
            srNo: idx + 1,
            description: task.description || '',
            remarks: (task as any).remarks || (task as any).remark || '',
            targetDate: formatTargetDate(task),
          })),
        });

        const filename = `Pending_Tasks_${user.name.replace(/\s+/g, '_')}_${todayKey}.pdf`;
        const caption = `Hi ${user.name},\n\nThis is a friendly reminder that above are the lists of All your pending tasks. ⬆️`;

        const result = await sendWhatsAppFile({
          waNumber: user.waNumber,
          filename,
          data: pdfBuffer,
          caption,
          mimetype: 'application/pdf',
        });

        if (result.ok) {
          await adminLog('REMINDER', `Daily pending tasks summary PDF sent to ${user.name}`, {
            uid: user.uid,
            meta: { filename, taskCount: userPendingTasks.length },
          });
          sent.push(user.uid);
        } else {
          errors.push(`${user.uid}: ${result.error || 'Failed to send file'}`);
        }
      } catch (err) {
        errors.push(`${user.uid}: ${String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      sent: sent.length,
      skipped: skipped.length,
      errors,
    });
  } catch (err) {
    console.error('Daily pending tasks PDF reminder error', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
