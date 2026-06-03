import { NextRequest, NextResponse } from 'next/server';
import { adminGetUserByWa } from '@/lib/firebase/users';
import { adminGetTask, adminUpdateTaskStatus, serializeTask } from '@/lib/firebase/tasks';
import { adminIncrementScore, adminLog } from '@/lib/firebase/scores';
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

    // ACCEPT T-0001
    if (text.startsWith('ACCEPT ')) {
      const taskId = text.split(' ')[1]?.trim();
      await handleAccept(from, user.uid, user.name, taskId);
    }

    // DONE T-0001
    else if (text.startsWith('DONE ')) {
      const taskId = text.split(' ')[1]?.trim();
      await handleDone(from, user.uid, user.name, taskId);
    }

    // VERIFY T-0001
    else if (text.startsWith('VERIFY ')) {
      const taskId = text.split(' ')[1]?.trim();
      await handleVerify(from, user.uid, user.name, taskId);
    }

    // STATUS
    else if (text === 'STATUS') {
      await handleStatus(from, user.uid);
    }

    // REVISE T-0001 — redirect to portal
    else if (text.startsWith('REVISE ')) {
      const taskId = text.split(' ')[1]?.trim();
      await sendWhatsApp(from, msgReviseRedirect(taskId ?? ''));
    }

    // Unknown command
    else {
      await sendWhatsApp(from, [
        `👋 Hi ${user.name}! Commands available:`,
        ``,
        `• *ACCEPT T-0001* — Accept a task`,
        `• *DONE T-0001* — Mark complete`,
        `• *VERIFY T-0001* — Verify completion`,
        `• *STATUS* — View your open tasks`,
        ``,
        `For revised dates, use the portal: ${process.env.NEXT_PUBLIC_APP_URL}`,
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
  if (task.status !== 'Pending Accept') {
    await sendWhatsApp(from, `ℹ️ Task ${taskId} is already ${task.status}.`); return;
  }

  await adminUpdateTaskStatus(taskId, 'In Progress', { acceptedAt: Timestamp.now() });
  await sendWhatsApp(from, msgTaskAccepted({ taskId, assignedToName: name }));
  await adminLog('TASK_ACCEPTED', `${taskId} accepted via WA by ${name}`, { taskId, uid });
}

async function handleDone(from: string, uid: string, name: string, taskId: string) {
  if (!taskId) { await sendWhatsApp(from, '❌ Please specify a task ID. Example: DONE T-0001'); return; }

  const task = await adminGetTask(taskId);
  if (!task) { await sendWhatsApp(from, `❌ Task ${taskId} not found.`); return; }
  if (task.assignedTo !== uid) { await sendWhatsApp(from, `❌ Task ${taskId} is not assigned to you.`); return; }
  if (!['In Progress', 'Delay Requested'].includes(task.status)) {
    await sendWhatsApp(from, `ℹ️ Task ${taskId} cannot be completed from status: ${task.status}.`); return;
  }

  const now = Timestamp.now();
  await adminUpdateTaskStatus(taskId, 'Completed', { completedAt: now });
  await adminIncrementScore(uid, 'tasksCompleted');

  const endDate = task.delayedDate ?? task.endDate;
  if (now.toMillis() <= endDate.toMillis()) {
    await adminIncrementScore(uid, 'onTimeCount');
  } else {
    await adminIncrementScore(uid, 'lateCount');
  }

  await sendWhatsApp(from, `✅ *${taskId}* marked as complete. Your checker has been notified.`);
  await sendWhatsApp(task.handoffWa, msgTaskCompleted({ taskId, description: task.description, assignedToName: name }), taskId);
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

  const lines = open.map(t =>
    `• *${t.taskId}* — ${t.description.slice(0, 50)} [${t.status}] Due: ${formatDate(t.endDate.toDate().toISOString())}`
  );

  await sendWhatsApp(from, [`📋 *Your Open Tasks (${open.length}):*`, '', ...lines].join('\n'));
}
