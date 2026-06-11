import { adminLog } from '@/lib/firebase/scores';

const WAHA_URL     = process.env.WAHA_URL!;
const WAHA_SESSION = process.env.WAHA_SESSION ?? 'default';
const WAHA_API_KEY = process.env.WAHA_API_KEY ?? '';
const PORTAL_URL   = process.env.NEXT_PUBLIC_APP_URL ?? '';

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (WAHA_API_KEY) headers['X-Api-Key'] = WAHA_API_KEY;
  return headers;
}

function formatWaId(waNumber: string): string {
  // WAHA expects "919876543210@c.us"
  const digits = waNumber.replace(/\D/g, '');
  return `${digits}@c.us`;
}

export async function sendWhatsApp(
  waNumber: string,
  text: string,
  taskId?: string,
): Promise<void> {
  const chatId = formatWaId(waNumber);
  const url    = `${WAHA_URL}/api/sendText`;

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        session: WAHA_SESSION,
        chatId,
        text,
      }),
    });

    const body = await res.text();
    await adminLog('SEND_WA', `Sent to ${waNumber}`, {
      taskId,
      meta: { chatId, status: res.status, body },
    });

    if (!res.ok) {
      console.error(`WAHA send failed: ${res.status}`, body);
    }
  } catch (err) {
    console.error('WAHA sendWhatsApp error', err);
    await adminLog('SEND_WA', `FAILED send to ${waNumber}`, {
      taskId,
      meta: { error: String(err) },
    });
  }
}

// ─── Message templates ──────────────────────────────────────────────────────

export function msgTaskAssigned(task: {
  taskId: string;
  description: string;
  priority: string;
  endDate: string;
  createdByName: string;
  acceptanceRequired?: boolean;
  datesRequired?: boolean;
}): string {
  const actionLines = task.datesRequired
    ? [
      `Please open the portal and set the start date and due date before completing this task.`,
      `Portal: ${PORTAL_URL}`,
    ]
    : task.acceptanceRequired === false
      ? [
        `This task is active. Acceptance is not required.`,
        `Open the portal: ${PORTAL_URL}`,
      ]
      : [
        `Reply *ACCEPT ${task.taskId}* to accept`,
        `Or open the portal: ${PORTAL_URL}`,
      ];

  return [
    `📋 *New Task Assigned: ${task.taskId}*`,
    ``,
    `*Description:* ${task.description}`,
    `*Priority:* ${task.priority}`,
    `*Due:* ${task.endDate}`,
    `*Assigned by:* ${task.createdByName}`,
    ``,
    ...actionLines,
  ].join('\n');
}

export function msgLoginOtp(otp: string): string {
  return [
    `*AHL Task Manager Login OTP*`,
    ``,
    `Your verification code is: *${otp}*`,
    ``,
    `This code expires in 5 minutes. Do not share it with anyone.`,
  ].join('\n');
}

export function msgTaskAccepted(task: { taskId: string; assignedToName: string }): string {
  return `✅ *${task.taskId}* accepted by ${task.assignedToName}. Task is now In Progress.`;
}

export function msgTaskCompleted(task: {
  taskId: string;
  description: string;
  assignedToName: string;
}): string {
  return [
    `🏁 *Task Completed: ${task.taskId}*`,
    ``,
    `${task.assignedToName} has marked this task as complete.`,
    ``,
    `*Task:* ${task.description}`,
    ``,
    `Please verify: Reply *VERIFY ${task.taskId}* or open the portal: ${PORTAL_URL}`,
  ].join('\n');
}

export function msgTaskVerified(task: { taskId: string; handoffName: string }): string {
  return `🎉 *Task ${task.taskId}* has been verified by ${task.handoffName}. Great work!`;
}

export function msgRevisionRequested(task: {
  taskId: string;
  description: string;
  requestedByName: string;
  requestedDate: string;
  reason: string;
}): string {
  return [
    `📅 *Revision Requested: ${task.taskId}*`,
    ``,
    `*Requested by:* ${task.requestedByName}`,
    `*New date requested:* ${task.requestedDate}`,
    `*Reason:* ${task.reason}`,
    ``,
    `Please review and approve/reject in the portal: ${PORTAL_URL}`,
  ].join('\n');
}

export function msgRevisionApproved(task: {
  taskId: string;
  newDate: string;
}): string {
  return `✅ Your revision request for *${task.taskId}* has been *approved*. New due date: ${task.newDate}`;
}

export function msgRevisionRejected(task: { taskId: string }): string {
  return `❌ Your revision request for *${task.taskId}* has been *rejected*. Original due date remains. Open portal for details: ${PORTAL_URL}`;
}

export function msgReminder(task: {
  taskId: string;
  description: string;
  endDate: string;
  urgency: '48h' | '24h' | 'today' | 'overdue';
}): string {
  const urgencyText = {
    '48h':    '⏰ Due in 48 hours',
    '24h':    '⚠️ Due tomorrow',
    'today':  '🔴 Due TODAY',
    'overdue':'🚨 OVERDUE',
  }[task.urgency];

  return [
    `${urgencyText}: *${task.taskId}*`,
    ``,
    `${task.description}`,
    `*Due:* ${task.endDate}`,
    ``,
    `Reply *DONE ${task.taskId}* when complete, or open portal for revised dates: ${PORTAL_URL}`,
  ].join('\n');
}

export function msgDailyHighPriorityTasks(input: {
  name: string;
  tasks: {
    taskId: string;
    description: string;
    endDate: string;
    status: string;
  }[];
}): string {
  if (input.tasks.length === 0) {
    return [
      `Good morning ${input.name},`,
      ``,
      `You have no open one-time tasks right now.`,
      ``,
      `Portal: ${PORTAL_URL}`,
    ].join('\n');
  }

  const lines = input.tasks.map((task, index) =>
    `${index + 1}. *${task.taskId}* - ${task.description}\n   Due: ${task.endDate} | ${task.status}`
  );

  return [
    `Good morning ${input.name},`,
    ``,
    `*Your first ${input.tasks.length} one-time tasks for today:*`,
    ``,
    ...lines,
    ``,
    `Please check the rest of your tasks on the portal: ${PORTAL_URL}`,
  ].join('\n');
}

export function msgChecklistReminder(input: {
  name: string;
  category: 'Daily' | 'Weekly' | 'Monthly';
  tasks: {
    taskId: string;
    description: string;
    status: string;
  }[];
}): string {
  const label = input.category === 'Daily'
    ? 'daily tasks'
    : input.category === 'Weekly'
      ? 'weekly tasks'
      : 'monthly tasks';

  if (input.tasks.length === 0) {
    return [
      `Hi ${input.name},`,
      ``,
      `Your ${label} are already marked complete for this period.`,
      ``,
      `Portal: ${PORTAL_URL}/portal/checklist?category=${encodeURIComponent(input.category)}`,
    ].join('\n');
  }

  const lines = input.tasks.slice(0, 5).map((task, index) =>
    `${index + 1}. *${task.taskId}* - ${task.description}\n   ${task.status}`
  );

  return [
    `Hi ${input.name},`,
    ``,
    `Please mark your ${label} complete on the portal:`,
    ``,
    ...lines,
    ``,
    `Open checklist: ${PORTAL_URL}/portal/checklist?category=${encodeURIComponent(input.category)}`,
  ].join('\n');
}

export function msgReviseRedirect(taskId: string): string {
  return [
    `To request a revised date for *${taskId}*, please use the portal:`,
    ``,
    `${PORTAL_URL}`,
    ``,
    `Open the task → Date Management → Request Revised Date`,
  ].join('\n');
}

export function msgCoordinatorNotification(task: {
  taskId: string;
  description: string;
  assignedToName: string;
  priority: string;
}): string {
  return [
    `📌 *Task Created: ${task.taskId}*`,
    ``,
    `*Task:* ${task.description}`,
    `*Assigned to:* ${task.assignedToName}`,
    `*Priority:* ${task.priority}`,
  ].join('\n');
}
