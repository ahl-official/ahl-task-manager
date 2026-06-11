import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetTask, adminUpdateTaskStatus, serializeTask } from '@/lib/firebase/tasks';
import { adminIncrementScore, adminLog } from '@/lib/firebase/scores';
import { sendWhatsApp, msgTaskAccepted, msgTaskCompleted, msgTaskVerified } from '@/lib/waha';
import { Timestamp } from 'firebase-admin/firestore';
import type { TaskStatus } from '@/types';
import { canViewTask } from '@/lib/utils/access';

// GET /api/tasks/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const task = await adminGetTask(params.id);
  if (!task) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  if (!canViewTask(session, task)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ success: true, data: serializeTask(task) });
}

// PATCH /api/tasks/[id]
// Body: { action: 'accept' | 'set-dates' | 'complete' | 'verify' }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const task = await adminGetTask(params.id);
  if (!task) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const { action, startDate, endDate } = await req.json();
  const now = Timestamp.now();

  try {
    if (action === 'accept') {
      if (task.assignedTo !== session.uid) {
        return NextResponse.json({ success: false, error: 'Only assignee can accept' }, { status: 403 });
      }
      if (!startDate || !endDate) {
        return NextResponse.json({ success: false, error: 'Start date and due date are required when accepting' }, { status: 400 });
      }
      if (new Date(endDate) < new Date(startDate)) {
        return NextResponse.json({ success: false, error: 'Due date must be after start date' }, { status: 400 });
      }
      await adminUpdateTaskStatus(params.id, 'In Progress', {
        acceptedAt: now,
        startDate: Timestamp.fromDate(new Date(startDate)),
        endDate: Timestamp.fromDate(new Date(endDate)),
      });
      await adminLog('TASK_ACCEPTED', `${params.id} accepted by ${session.name}`, {
        taskId: params.id, uid: session.uid,
      });
    }

    else if (action === 'set-dates') {
      if (task.assignedTo !== session.uid) {
        return NextResponse.json({ success: false, error: 'Only assignee can set dates' }, { status: 403 });
      }
      if (!startDate || !endDate) {
        return NextResponse.json({ success: false, error: 'Start date and due date are required' }, { status: 400 });
      }
      if (new Date(endDate) < new Date(startDate)) {
        return NextResponse.json({ success: false, error: 'Due date must be after start date' }, { status: 400 });
      }
      await adminUpdateTaskStatus(params.id, 'In Progress', {
        startDate: Timestamp.fromDate(new Date(startDate)),
        endDate: Timestamp.fromDate(new Date(endDate)),
        acceptedAt: task.acceptedAt ?? now,
      });
      await adminLog('TASK_ACCEPTED', `${params.id} dates set by ${session.name}`, {
        taskId: params.id, uid: session.uid,
      });
    }

    else if (action === 'complete') {
      if (task.assignedTo !== session.uid) {
        return NextResponse.json({ success: false, error: 'Only assignee can complete' }, { status: 403 });
      }
      if (!task.startDate || !task.endDate) {
        return NextResponse.json({ success: false, error: 'Set start date and due date before completing this task' }, { status: 400 });
      }
      await adminUpdateTaskStatus(params.id, 'Completed', { completedAt: now });
      await adminIncrementScore(session.uid, 'tasksCompleted');

      // Check on-time vs late
      const endDate = task.delayedDate ?? task.endDate;
      if (endDate && now.toMillis() <= endDate.toMillis()) {
        await adminIncrementScore(session.uid, 'onTimeCount');
      } else if (endDate) {
        await adminIncrementScore(session.uid, 'lateCount');
      }

      // Notify handoff to verify
      await sendWhatsApp(
        task.handoffWa,
        msgTaskCompleted({
          taskId:         task.taskId,
          description:    task.description,
          assignedToName: task.assignedToName,
        }),
        task.taskId,
      );

      await adminLog('TASK_DONE', `${params.id} completed by ${session.name}`, {
        taskId: params.id, uid: session.uid,
      });
    }

    else if (action === 'verify') {
      if (task.handoffUid !== session.uid && session.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Only handoff can verify' }, { status: 403 });
      }
      await adminUpdateTaskStatus(params.id, 'Verified', { verifiedAt: now });

      // Notify assignee
      await sendWhatsApp(
        task.assignedToWa,
        msgTaskVerified({ taskId: task.taskId, handoffName: session.name }),
        task.taskId,
      );

      await adminLog('TASK_VERIFIED', `${params.id} verified by ${session.name}`, {
        taskId: params.id, uid: session.uid,
      });
    }

    else {
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }

    const updated = await adminGetTask(params.id);
    return NextResponse.json({ success: true, data: serializeTask(updated!) });
  } catch (err: any) {
    console.error(`PATCH /api/tasks/${params.id} error`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
