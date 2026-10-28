import { isCronOrAdmin } from "@/lib/utils/cronAuth";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { getRecurringChecklist } from '@/lib/cloudflare/recurring';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import { namesEqual } from '@/lib/utils/names';
import { automatedWhatsAppDisabled, sendWhatsApp, msgUnifiedRecurringReminder } from '@/lib/waha';


export async function GET(req: NextRequest) {
  if (!await isCronOrAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (automatedWhatsAppDisabled()) {
    return NextResponse.json({ success: true, skipped: true, reason: 'WhatsApp reminders disabled', sent: 0 });
  }

  const todayKey = indiaTodayKey();
  const dateLabel = (() => {
    const [y, m, d] = todayKey.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[Number(m) - 1]} ${y}`;
  })();

  const sent: Array<{ name: string; waNumber: string; taskCount: number }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const errors: Array<{ name: string; error: string }> = [];

  try {
    const users = await adminGetAllUsers();
    const activeUsers = users.filter(u => {
      if (u.isActive === false) return false;
      const digits = String(u.waNumber || '').replace(/\D/g, '');
      return digits.length >= 10;
    });

    if (activeUsers.length === 0) {
      return NextResponse.json({
        success: true,
        sentCount: 0,
        skippedCount: 0,
        errorCount: 0,
        message: 'No active users with valid WhatsApp numbers found',
      });
    }

    const checklistItems = await getRecurringChecklist({ date: todayKey });

    for (const user of activeUsers) {
      try {
        // Find tasks for this user scheduled for today
        const userTasks = checklistItems.filter(item => {
          const matchUser = namesEqual(item.userName, user.name) || item.userId === user.uid;
          return matchUser && !item.completed && !item.dead;
        });

        if (userTasks.length === 0) {
          skipped.push({ name: user.name, reason: 'No pending recurring tasks for today' });
          continue;
        }

        const msg = msgUnifiedRecurringReminder({
          name: user.name,
          dateLabel,
          tasks: userTasks.map(t => ({
            category: t.category,
            description: t.description || t.title,
          })),
        });


        const res = await sendWhatsApp(user.waNumber, msg);
        if (res.ok) {
          sent.push({ name: user.name, waNumber: user.waNumber, taskCount: userTasks.length });
        } else {
          errors.push({ name: user.name, error: res.error || 'Failed to send WhatsApp message' });
        }
      } catch (userErr: any) {
        errors.push({ name: user.name, error: userErr.message || 'Unknown error' });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dateLabel,
      todayKey,
      sentCount: sent.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      sent,
      skipped,
      errors,
    });
  } catch (err: any) {
    console.error('Failed to run recurring morning reminders cron', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Internal server error in recurring reminders cron',
    }, { status: 500 });
  }
}
