import { NextRequest, NextResponse } from 'next/server';
import { adminGetUserByWa } from '@/lib/firebase/users';
import { adminGetTask, adminUpdateTaskStatus, serializeTask } from '@/lib/firebase/tasks';
import { adminIncrementScores, adminLog } from '@/lib/firebase/scores';
import {
  sendWhatsApp,
  msgTaskAccepted,
  msgTaskCompleted,
  msgTaskVerified,
  msgReviseRedirect,
} from '@/lib/waha';
import { Timestamp } from 'firebase-admin/firestore';
import { formatDate } from '@/lib/utils';

export async function POST(req: NextRequest) {
  let rawBody = '';

  try {
    rawBody = await req.text();
    const payload = JSON.parse(rawBody);

    await adminLog('WEBHOOK_RAW', 'Inbound WAHA event', { meta: { payload } });

    // Only handle message events
    const event = payload.event ?? payload.type ?? '';
    if (!event.startsWith('message')) {
      return NextResponse.json({ ok: true });
    }

    const message = payload.payload ?? payload.message ?? payload;

    // Ignore outgoing messages
    if (message.fromMe === true) {
      return NextResponse.json({ ok: true });
    }

    // Extract sender and text
    const from = (
      message.from ??
      message.sender?.id ??
      message._data?.from ??
      ''
    ).replace('@c.us', '').replace('@s.whatsapp.net', '');

    const text: string = (
      message.body ??
      message.text?.body ??
      message.content ??
      ''
    ).trim().toUpperCase();

    if (!from || !text) {
      return NextResponse.json({ ok: true });
    }

    await adminLog('INBOUND_WA', `From ${from}: ${text}`, { meta: { from, text } });

    // Find user by WA number
    const user = await adminGetUserByWa(from);
    if (!user) {
      await sendWhatsApp(from, '❌ Your number is not registered in AHL Task Manager. Please contact admin.');
      return NextResponse.json({ ok: true });
    }

    // ─── Command routing ──────────────────────────────────────────────────
    const extractTaskId = async (inputStr: string): Promise<string | null> => {
      // Direct T-XXXX or TXXXX match
      const directMatch = inputStr.match(/\bT-?(\d{4,6})\b/i);
      if (directMatch) {
        return `T-${directMatch[1].padStart(4, '0')}`;
      }
      // Check positional number e.g. "DONE 1", "1 DONE", "TASK 2 DONE"
      const numMatch = inputStr.replace(/T-?\d+/gi, '').match(/\b(?:TASK\s*)?(\d{1,2})\b/i);
      if (numMatch) {
        const idx = parseInt(numMatch[1], 10);
        if (idx >= 1 && idx <= 50) {
          const { adminGetTasksByAssignee } = await import('@/lib/firebase/tasks');
          const userTasks = await adminGetTasksByAssignee(user.uid);
          const open = userTasks.filter(t => !['Completed', 'Verified', 'Dead', 'Cancelled'].includes(t.status));
          if (open[idx - 1]) {
            return open[idx - 1].taskId;
          }
        }
      }
      return null;
    };

    // DONE / COMPLETE
    if (text.includes('DONE') || text.includes('COMPLETE')) {
      const taskId = await extractTaskId(text);
      if (taskId) {
        await handleDone(from, user.uid, user.name, taskId);
      } else {
        await sendWhatsApp(from, '❌ Please specify a task ID to mark done. Example: *DONE T-6792*');
      }
    }

    // ACCEPT
    else if (text.includes('ACCEPT')) {
      const taskId = await extractTaskId(text);
      if (taskId) {
        await handleAccept(from, user.uid, user.name, taskId);
      } else {
        await sendWhatsApp(from, '❌ Please specify a task ID to accept. Example: *ACCEPT T-6792*');
      }
    }

    // VERIFY
    else if (text.includes('VERIFY')) {
      const taskId = await extractTaskId(text);
      if (taskId) {
        await handleVerify(from, user.uid, user.name, taskId);
      } else {
        await sendWhatsApp(from, '❌ Please specify a task ID to verify. Example: *VERIFY T-6792*');
      }
    }

    // STATUS / TASKS
    else if (text === 'STATUS' || text === 'TASKS' || text === 'MY TASKS') {
      await handleStatus(from, user.uid);
    }

    // REVISE — redirect to portal
    else if (text.includes('REVISE')) {
      const taskId = await extractTaskId(text);
      await sendWhatsApp(from, msgReviseRedirect(taskId ?? ''));
    }

    // Unknown command
    else {
      await sendWhatsApp(from, [
        `👋 Hi ${user.name}! Commands available:`,
        ``,
        `• *DONE T-6792* — Mark task complete`,
        `• *ACCEPT T-6792* — Accept a delegated task`,
        `• *VERIFY T-6792* — Verify completed task`,
        `• *STATUS* — View your open tasks`,
        ``,
        `Portal: ${process.env.NEXT_PUBLIC_APP_URL || 'https://ahl-task-manager.vercel.app'}`,
      ].join('\n'));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error', err);
    await adminLog('WEBHOOK_ERROR', 'Webhook processing failed', {
      meta: { error: String(err), rawBody },
    });
    return NextResponse.json({ ok: true }); // Always return 200 to WAHA
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleAccept(from: string, uid: string, name: string, taskId: string) {
  if (!taskId) { await sendWhatsApp(from, '❌ Please specify a task ID. Example: ACCEPT T-0001'); return; }

  const task = await adminGetTask(taskId);
  if (!task) { await sendWhatsApp(from, `❌ Task ${taskId} not found.`); return; }
  if (task.assignedTo !== uid) { await sendWhatsApp(from, `❌ Task ${taskId} is not assigned to you.`); return; }
  if (task.status === 'In Progress' && (!task.startDate || !task.endDate)) {
    await sendWhatsApp(from, `Task *${taskId}* is already active. Please open the portal and set the start date and due date before work is completed.`);
    return;
  }
  if (task.status !== 'Pending Accept') {
    await sendWhatsApp(from, `ℹ️ Task ${taskId} is already ${task.status}.`); return;
  }

  await sendWhatsApp(from, `Please accept *${taskId}* in the portal so you can set the start date and due date before work begins.`);
}

async function handleDone(from: string, uid: string, name: string, taskId: string) {
  if (!taskId) { await sendWhatsApp(from, '❌ Please specify a task ID. Example: *DONE T-6792*'); return; }

  const task = await adminGetTask(taskId);
  if (!task) { await sendWhatsApp(from, `❌ Task ${taskId} not found.`); return; }
  if (task.assignedTo !== uid) { await sendWhatsApp(from, `❌ Task ${taskId} is not assigned to you.`); return; }
  if (['Completed', 'Verified', 'Dead', 'Cancelled'].includes(task.status)) {
    await sendWhatsApp(from, `ℹ️ Task ${taskId} is already ${task.status}.`); return;
  }

  const now = Timestamp.now();
  await adminUpdateTaskStatus(taskId, 'Completed', { completedAt: now });

  const scoreFields: Parameters<typeof adminIncrementScores>[1] = ['tasksCompleted'];
  const endDate = task.delayedDate ?? task.endDate;
  if (endDate && now.toMillis() <= endDate.toMillis()) {
    scoreFields.push('onTimeCount');
  } else if (endDate) {
    scoreFields.push('lateCount');
  }
  await adminIncrementScores(uid, scoreFields).catch(console.error);

  await sendWhatsApp(from, `✅ *${taskId}* marked as complete. Great work!`);
  if (task.handoffWa) {
    await sendWhatsApp(task.handoffWa, msgTaskCompleted({ taskId, description: task.description, assignedToName: name }), taskId).catch(console.error);
  }
  await adminLog('TASK_DONE', `${taskId} done via WA by ${name}`, { taskId, uid });
}

async function handleVerify(from: string, uid: string, name: string, taskId: string) {
  if (!taskId) { await sendWhatsApp(from, '❌ Please specify a task ID. Example: VERIFY T-0001'); return; }

  const task = await adminGetTask(taskId);
  if (!task) { await sendWhatsApp(from, `❌ Task ${taskId} not found.`); return; }
  if (task.handoffUid !== uid) { await sendWhatsApp(from, `❌ You are not the checker for task ${taskId}.`); return; }
  if (task.status !== 'Completed') {
    await sendWhatsApp(from, `ℹ️ Task ${taskId} is not yet completed (status: ${task.status}).`); return;
  }

  await adminUpdateTaskStatus(taskId, 'Verified', { verifiedAt: Timestamp.now() });
  await sendWhatsApp(task.assignedToWa, msgTaskVerified({ taskId, handoffName: name }), taskId);
  await sendWhatsApp(from, `✅ Task *${taskId}* verified successfully.`);
  await adminLog('TASK_VERIFIED', `${taskId} verified via WA by ${name}`, { taskId, uid });
}

async function handleStatus(from: string, uid: string) {
  const { adminGetTasksByAssignee } = await import('@/lib/firebase/tasks');
  const tasks = await adminGetTasksByAssignee(uid);
  const open  = tasks.filter(t => !['Verified', 'Completed'].includes(t.status));

  if (open.length === 0) {
    await sendWhatsApp(from, '✅ You have no open tasks. Great work!');
    return;
  }

  const lines = open.map(t => {
    const endIso = !t.endDate
      ? null
      : typeof (t.endDate as any).toDate === 'function'
        ? (t.endDate as any).toDate().toISOString()
        : String(t.endDate);
    const dueStr = endIso ? formatDate(endIso) : 'Not set';
    return `• *${t.taskId}* — ${t.description.slice(0, 50)} [${t.status}] Due: ${dueStr}`;
  });

  await sendWhatsApp(from, [`📋 *Your Open Tasks (${open.length}):*`, '', ...lines].join('\n'));
}

