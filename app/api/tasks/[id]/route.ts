import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetTask, adminUpdateTaskStatus, serializeTask } from '@/lib/firebase/tasks';
import { adminIncrementScores, adminLog } from '@/lib/firebase/scores';
import { sendWhatsApp, msgTaskAccepted, msgTaskCompleted, msgTaskVerified } from '@/lib/waha';
import { Timestamp } from 'firebase-admin/firestore';
import type { TaskPriority, TaskStatus } from '@/types';
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
// Body: { action: 'accept' | 'set-dates' | 'complete' | 'verify' | 'dead' | 'remark' | 'revive' | 'update-priority' }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const task = await adminGetTask(params.id);
  if (!task) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  if (!canViewTask(session, task)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const { action, startDate, endDate, priority, remark = '' } = await req.json();
  const now = Timestamp.now();
  const isAdmin = session.role === 'admin';
  const actorIsAssignee = task.assignedTo === session.uid;
  const actorIsHandoff = task.handoffUid === session.uid;
  const scoreUid = isAdmin ? task.assignedTo : session.uid;
  let updatedTask: Awaited<ReturnType<typeof adminUpdateTaskStatus>> = null;

  try {
    if (action === 'accept') {
      if (!actorIsAssignee && !isAdmin) {
        return NextResponse.json({ success: false, error: 'Only assignee can accept' }, { status: 403 });
      }
      if (!isAdmin && (!startDate || !endDate)) {
        return NextResponse.json({ success: false, error: 'Start date and due date are required when accepting' }, { status: 400 });
      }
      if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
        return NextResponse.json({ success: false, error: 'Due date must be after start date' }, { status: 400 });
      }
      updatedTask = await adminUpdateTaskStatus(params.id, 'In Progress', {
        acceptedAt: now,
        startDate: startDate ? Timestamp.fromDate(new Date(startDate)) : task.startDate,
        endDate: endDate ? Timestamp.fromDate(new Date(endDate)) : task.endDate,
      });
      await adminLog('TASK_ACCEPTED', `${params.id} accepted by ${session.name}`, {
        taskId: params.id, uid: session.uid,
      });
    }

    else if (action === 'set-dates') {
      if (!actorIsAssignee && !isAdmin) {
        return NextResponse.json({ success: false, error: 'Only assignee can set dates' }, { status: 403 });
      }
      if (!startDate || !endDate) {
        return NextResponse.json({ success: false, error: 'Start date and due date are required' }, { status: 400 });
      }
      if (new Date(endDate) < new Date(startDate)) {
        return NextResponse.json({ success: false, error: 'Due date must be after start date' }, { status: 400 });
      }
      updatedTask = await adminUpdateTaskStatus(params.id, 'In Progress', {
        startDate: Timestamp.fromDate(new Date(startDate)),
        endDate: Timestamp.fromDate(new Date(endDate)),
        acceptedAt: task.acceptedAt ?? now,
      });
      await adminLog('TASK_ACCEPTED', `${params.id} dates set by ${session.name}`, {
        taskId: params.id, uid: session.uid,
      });
    }

    else if (action === 'complete') {
      if (!actorIsAssignee && !isAdmin) {
        return NextResponse.json({ success: false, error: 'Only assignee can complete' }, { status: 403 });
      }
      if (!isAdmin && (!task.startDate || !task.endDate)) {
        return NextResponse.json({ success: false, error: 'Set start date and due date before completing this task' }, { status: 400 });
      }
      if (task.status === 'Dead') {
        return NextResponse.json({ success: false, error: 'Revive this task before completing it' }, { status: 400 });
      }
      const shouldCountCompletion = task.status !== 'Completed' && task.status !== 'Verified';

      updatedTask = await adminUpdateTaskStatus(params.id, isAdmin ? 'Verified' : 'Completed', {
        acceptedAt: task.acceptedAt ?? now,
        completedAt: now,
        verifiedAt: isAdmin ? now : task.verifiedAt,
      });
      if (shouldCountCompletion) {
        const scoreFields: Parameters<typeof adminIncrementScores>[1] = ['tasksCompleted'];
        const endDate = task.delayedDate ?? task.endDate;
        if (endDate && now.toMillis() <= endDate.toMillis()) {
          scoreFields.push('onTimeCount');
        } else if (endDate) {
          scoreFields.push('lateCount');
        }
        await adminIncrementScores(scoreUid, scoreFields);
      }

      if (isAdmin) {
        await sendWhatsApp(
          task.assignedToWa,
          msgTaskVerified({ taskId: task.taskId, handoffName: session.name }),
          task.taskId,
        );
      } else {
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
      }

      await adminLog('TASK_DONE', `${params.id} completed by ${session.name}`, {
        taskId: params.id, uid: session.uid,
      });
    }

    else if (action === 'verify') {
      if (task.handoffUid !== session.uid && session.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Only handoff can verify' }, { status: 403 });
      }
      updatedTask = await adminUpdateTaskStatus(params.id, 'Verified', { verifiedAt: now });

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

    else if (action === 'update-priority') {
      const nextPriority = String(priority ?? '') as TaskPriority;
      if (!['High', 'Medium', 'Low'].includes(nextPriority)) {
        return NextResponse.json({ success: false, error: 'Invalid priority' }, { status: 400 });
      }
      if (!actorIsAssignee && !actorIsHandoff && !isAdmin) {
        return NextResponse.json({ success: false, error: 'Only the assignee, checker, or admin can change priority' }, { status: 403 });
      }
      if (task.status === 'Completed' || task.status === 'Verified') {
        return NextResponse.json({ success: false, error: 'Completed tasks cannot be reprioritized' }, { status: 400 });
      }
      updatedTask = await adminUpdateTaskStatus(params.id, task.status, { priority: nextPriority });
      await adminLog('TASK_UPDATED', `${params.id} priority changed to ${nextPriority} by ${session.name}`, {
        taskId: params.id, uid: session.uid, meta: { priority: nextPriority },
      });
    }

    else if (action === 'dead' || action === 'remark' || action === 'revive') {
      const cleanRemark = String(remark).trim();
      if (!cleanRemark) {
        return NextResponse.json({ success: false, error: 'A remark is required' }, { status: 400 });
      }
      if (cleanRemark.length > 1000) {
        return NextResponse.json({ success: false, error: 'Remark must be 1000 characters or fewer' }, { status: 400 });
      }
      if ((action === 'dead' || action === 'revive') && !actorIsAssignee && !actorIsHandoff && !isAdmin) {
        return NextResponse.json({ success: false, error: 'Only the assignee, checker, or admin can change the Dead state' }, { status: 403 });
      }
      if (action === 'dead' && (task.status === 'Completed' || task.status === 'Verified')) {
        return NextResponse.json({ success: false, error: 'Completed tasks cannot be flagged Dead' }, { status: 400 });
      }
      if (action === 'revive' && task.status !== 'Dead') {
        return NextResponse.json({ success: false, error: 'Only Dead tasks can be revived' }, { status: 400 });
      }

      const timestamp = new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date());
      const marker = action === 'dead' ? 'DEAD' : action === 'revive' ? 'REVIVED' : 'REMARK';
      const entry = `[${marker} - ${timestamp}] ${session.name}: ${cleanRemark}`;
      const notes = task.notes ? `${task.notes}\n${entry}` : entry;
      const status: TaskStatus = action === 'dead' ? 'Dead' : action === 'revive' ? 'In Progress' : task.status;
      updatedTask = await adminUpdateTaskStatus(params.id, status, { notes });
      await adminLog('TASK_UPDATED', `${params.id} ${marker.toLowerCase()} by ${session.name}`, {
        taskId: params.id, uid: session.uid, meta: { action },
      });
    }

    else {
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
    }

    const updated = updatedTask ?? await adminGetTask(params.id);
    return NextResponse.json({ success: true, data: serializeTask(updated!) });
  } catch (err: any) {
    console.error(`PATCH /api/tasks/${params.id} error`, err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
