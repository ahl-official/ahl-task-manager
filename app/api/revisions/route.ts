import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import {
  adminCreateRevision,
  adminDecideRevision,
  adminGetPendingRevisionsByHandoff,
  serializeRevision,
} from '@/lib/firebase/revisions';
import { adminGetTask, adminUpdateTaskStatus } from '@/lib/firebase/tasks';
import { adminLog } from '@/lib/firebase/scores';
import { sendWhatsApp, msgRevisionRequested, msgRevisionApproved, msgRevisionRejected } from '@/lib/waha';
import { Timestamp } from 'firebase-admin/firestore';
import { formatDate } from '@/lib/utils';

// GET /api/revisions — get pending revisions for handoff user
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const revisions = await adminGetPendingRevisionsByHandoff(session.uid);
  return NextResponse.json({ success: true, data: revisions.map(serializeRevision) });
}

// POST /api/revisions — request revision (assignee)
// Body: { taskId, requestedDate (ISO), reason }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { taskId, requestedDate, reason } = await req.json();

    const task = await adminGetTask(taskId);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });

    if (task.assignedTo !== session.uid) {
      return NextResponse.json({ success: false, error: 'Only assignee can request revision' }, { status: 403 });
    }

    const revision = await adminCreateRevision({
      taskId,
      requestedBy:     session.uid,
      requestedByName: session.name,
      requestedDate,
      reason,
    });

    // Update task status to Delay Requested
    await adminUpdateTaskStatus(taskId, 'Delay Requested', {
      revisionStatus: 'requested',
    });

    // Notify handoff
    await sendWhatsApp(
      task.handoffWa,
      msgRevisionRequested({
        taskId:          task.taskId,
        description:     task.description,
        requestedByName: session.name,
        requestedDate:   formatDate(requestedDate),
        reason,
      }),
      taskId,
    );

    await adminLog('REVISION_REQUESTED_PORTAL', `Revision requested for ${taskId} by ${session.name}`, {
      taskId, uid: session.uid,
    });

    return NextResponse.json({ success: true, data: serializeRevision(revision) }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/revisions error', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH /api/revisions — decide on revision (handoff)
// Body: { revisionId, decision: 'approved'|'rejected', taskId }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { revisionId, decision, taskId } = await req.json();

    const task = await adminGetTask(taskId);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });

    if (task.handoffUid !== session.uid && session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Only handoff can decide revision' }, { status: 403 });
    }

    const revision = await adminDecideRevision(revisionId, decision, session.uid, session.name);

    if (decision === 'approved') {
      // Update task with new date
      await adminUpdateTaskStatus(taskId, 'In Progress', {
        revisionStatus: 'accepted',
        delayedDate:    Timestamp.fromDate(new Date(revision.requestedDate.toDate())),
        delayReason:    revision.reason,
        endDate:        Timestamp.fromDate(new Date(revision.requestedDate.toDate())),
      });

      await sendWhatsApp(
        task.assignedToWa,
        msgRevisionApproved({
          taskId:  task.taskId,
          newDate: formatDate(revision.requestedDate.toDate().toISOString()),
        }),
        taskId,
      );
    } else {
      await adminUpdateTaskStatus(taskId, 'In Progress', {
        revisionStatus: 'rejected',
      });

      await sendWhatsApp(
        task.assignedToWa,
        msgRevisionRejected({ taskId: task.taskId }),
        taskId,
      );
    }

    await adminLog('REVISION_DECIDED_PORTAL', `Revision ${decision} for ${taskId} by ${session.name}`, {
      taskId, uid: session.uid,
    });

    return NextResponse.json({ success: true, data: serializeRevision(revision) });
  } catch (err: any) {
    console.error('PATCH /api/revisions error', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
