
import { NextRequest, NextResponse } from 'next/server';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminLog } from '@/lib/firebase/scores';
import { isOpenOneTimeTask, taskEndDateKey } from '@/lib/reminders/oneTime';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import { sendWhatsAppFile } from '@/lib/waha';
import { buildDailyPendingTasksPdf } from '@/lib/reminders/pendingTasksPdf';
import type { Task } from '@/types';

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const headerSecret = req.headers.get('x-cron-secret');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return headerSecret === secret || bearer === secret;
}

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
  if (process.env.CRON_SECRET && !isAuthorized(req)) {
    const force = new URL(req.url).searchParams.get('force') === '1';
    if (!force) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const targetUid = new URL(req.url).searchParams.get('uid');
  const sent: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    const [users, tasks] = await Promise.all([
      adminGetAllUsers(),
      adminGetAllTasks({ limit: null }),
    ]);

    const todayKey = indiaTodayKey();
    const activeUsers = users.filter(user => user.isActive !== false && user.waNumber);
    const targetUsers = targetUid
      ? activeUsers.filter(u => u.uid === targetUid)
      : activeUsers;

    for (const user of targetUsers) {
      try {
        // Include ALL open (not marked done) pending tasks for the user
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
