import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import {
  adminGetAllRevisions,
  adminGetRevisionsByTask,
  adminGetPendingRevisionsByHandoff,
  serializeRevision,
} from '@/lib/firebase/revisions';
import { adminGetTask, serializeTask } from '@/lib/firebase/tasks';
import { adminDb } from '@/lib/firebase/admin';
import { adminLog } from '@/lib/firebase/scores';
import { sendWhatsApp, msgRevisionRequested, msgRevisionApproved, msgRevisionRejected } from '@/lib/waha';
import { formatDate } from '@/lib/utils';
import { canViewTask } from '@/lib/utils/access';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { cfRevision } from '@/lib/cloudflare/models';
import { updateTaskInReadCache } from '@/lib/firebase/readCache';

// GET /api/revisions — get pending revisions for handoff user
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const taskId=new URL(req.url).searchParams.get('taskId');
  if(taskId){
    const task=await adminGetTask(taskId);
    if(!task||!canViewTask(session,task))return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const revisions=await adminGetRevisionsByTask(taskId,100);
    return NextResponse.json({success:true,data:revisions.map(serializeRevision)});
  }
  if (session.role === 'admin' || session.role === 'leader') {
    if(session.role === 'leader' && !session.department) return NextResponse.json({ success:false,error:'Department required' }, { status:403 });
    const revisions = await adminGetAllRevisions({ status: 'pending', limit: 1000, department: session.role === 'leader' ? session.department : undefined });
    return NextResponse.json({ success: true, data: revisions.map(serializeRevision) });
  }

  const revisions = await adminGetPendingRevisionsByHandoff(session.uid);
  return NextResponse.json({ success: true, data: revisions.map(serializeRevision) });
}

// POST /api/revisions — request revision (assignee or dead status request)
// Body: { taskId, requestedDate (ISO), reason, type?: 'delay' | 'dead' }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { taskId, requestedDate, reason, type = 'delay' } = await req.json();

    const task = await adminGetTask(taskId);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });

    const isDead = type === 'dead';

    if (isDead) {
      const canRequestDead = task.assignedTo === session.uid || task.handoffUid === session.uid || session.role === 'admin';
      if (!canRequestDead) {
        return NextResponse.json({ success: false, error: 'Only assignee, checker, or admin can request Dead approval' }, { status: 403 });
      }
      if (task.status === 'Completed' || task.status === 'Verified') {
        return NextResponse.json({ success: false, error: 'Completed tasks cannot be flagged Dead' }, { status: 400 });
      }
    } else {
      if (task.assignedTo !== session.uid && session.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Only assignee can request date revision' }, { status: 403 });
      }
      if (!requestedDate || Number.isNaN(Date.parse(requestedDate))) {
        return NextResponse.json({ success: false, error: 'Valid date required' }, { status: 400 });
      }
    }

    const cleanReason = String(reason || '').trim();
    if (!cleanReason) {
      return NextResponse.json({
        success: false,
        error: isDead ? 'A remark explaining why the task is dead is required' : 'A reason for revision is required',
      }, { status: 400 });
    }

    if (!hasCloudflareApi()) throw new Error('Cloudflare is required for atomic revision requests');

    const reqDate = isDead ? (task.endDate ? task.endDate.toDate().toISOString() : new Date().toISOString()) : requestedDate;
    const revision = cfRevision(await cfApi('/revisions', {
      method: 'POST',
      body: JSON.stringify({
        taskId,
        requestedBy: session.uid,
        requestedByName: session.name,
        requestedDate: reqDate,
        reason: cleanReason,
        type: isDead ? 'dead' : 'delay',
        actorRole: session.role,
      }),
    }))!;

    const requestedDateStr = isDead ? null : String(requestedDate).slice(0, 10);
    const newStatus = isDead ? 'Dead Requested' : (task.status === 'In Progress' ? 'Delay Requested' : task.status);

    const timestamp = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(new Date());
    const marker = isDead ? 'DEAD REQUESTED' : 'REVISION REQUESTED';
    const entry = `[${marker} - ${timestamp}] ${session.name}: ${cleanReason}`;
    const notes = task.notes ? `${task.notes}\n${entry}` : entry;

    // Persist revision status and reason directly to Cloudflare D1
    await cfApi(`/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        revisionStatus: 'requested',
        delayedDate: requestedDateStr,
        delayReason: cleanReason,
        status: newStatus,
        notes,
      }),
    }).catch(err => console.error('Failed to update task revision in D1:', err));

    updateTaskInReadCache(taskId, {
      revisionStatus: 'requested',
      delayedDate: requestedDateStr,
      delayReason: cleanReason,
      status: newStatus,
      notes,
    });

    // Also sync Firestore if available
    try {
      await adminDb.collection('tasks').doc(taskId).update({
        revisionStatus: 'requested',
        delayedDate: requestedDate ? new Date(requestedDate) : null,
        delayReason: cleanReason,
        status: newStatus,
        notes,
        updatedAt: new Date(),
      });
    } catch {}

    if (isDead) {
      await adminLog('REVISION_REQUESTED_PORTAL', `Dead status requested for ${taskId} by ${session.name}`, {
        taskId, uid: session.uid, meta: { type: 'dead' },
      }).catch(() => {});
    } else {
      // Notify handoff for date extension
      await sendWhatsApp(
        task.handoffWa,
        msgRevisionRequested({
          taskId:          task.taskId,
          description:     task.description,
          requestedByName: session.name,
          requestedDate:   formatDate(requestedDate),
          reason:          cleanReason,
        }),
        taskId,
      ).catch(() => {});

      await adminLog('REVISION_REQUESTED_PORTAL', `Revision requested for ${taskId} by ${session.name}`, {
        taskId, uid: session.uid,
      }).catch(() => {});
    }

    const updatedTask = await adminGetTask(taskId);

    return NextResponse.json({
      success: true,
      data: serializeRevision(revision),
      task: updatedTask ? serializeTask(updatedTask) : undefined,
    }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/revisions error', err);
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 500 });
  }
}

// PATCH /api/revisions — decide on revision (handoff or admin)
// Body: { revisionId, decision: 'approved'|'rejected', taskId }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { revisionId, decision, taskId } = await req.json();

    const task = await adminGetTask(taskId);
    if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });

    if (!['approved','rejected'].includes(decision) || !revisionId) return NextResponse.json({success:false,error:'Valid revision ID and decision required'},{status:400});
    if (!hasCloudflareApi()) throw new Error('Cloudflare is required for atomic revision decisions');

    const revision=cfRevision(await cfApi('/revisions',{method:'PATCH',body:JSON.stringify({revisionId,taskId,decision,decidedBy:session.uid,decidedByName:session.name,actorRole:session.role})}))!;

    const isDeadRequest = revision.type === 'dead' || task.status === 'Dead Requested';

    if (isDeadRequest) {
      if (session.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Only admin can approve or reject dead task requests' }, { status: 403 });
      }
    } else {
      if (task.handoffUid !== session.uid && session.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Only handoff or admin can decide revision' }, { status: 403 });
      }
    }

    const timestamp = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(new Date());

    if (isDeadRequest) {
      if (decision === 'approved') {
        const marker = `[DEAD APPROVED - ${timestamp}] Approved by Admin ${session.name}${revision.reason ? `: ${revision.reason}` : ''}`;
        const notes = task.notes ? `${task.notes}\n${marker}` : marker;

        await cfApi(`/tasks/${encodeURIComponent(taskId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'Dead',
            revisionStatus: 'accepted',
            delayReason: null,
            notes,
          }),
        }).catch(err => console.error('Failed to apply approved dead task in D1:', err));

        updateTaskInReadCache(taskId, {
          status: 'Dead',
          revisionStatus: 'accepted',
          delayReason: null,
          notes,
        });

        try {
          await adminDb.collection('tasks').doc(taskId).update({
            status: 'Dead',
            revisionStatus: 'accepted',
            delayReason: null,
            notes,
            updatedAt: new Date(),
          });
        } catch {}

        await adminLog('REVISION_DECIDED_PORTAL', `Dead request approved for ${taskId} by ${session.name}`, {
          taskId, uid: session.uid, meta: { decision: 'approved', type: 'dead' },
        }).catch(() => {});
      } else {
        const marker = `[DEAD REJECTED - ${timestamp}] Dead status rejected by Admin ${session.name}`;
        const notes = task.notes ? `${task.notes}\n${marker}` : marker;

        await cfApi(`/tasks/${encodeURIComponent(taskId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'In Progress',
            revisionStatus: 'rejected',
            delayReason: null,
            notes,
          }),
        }).catch(err => console.error('Failed to apply rejected dead task in D1:', err));

        updateTaskInReadCache(taskId, {
          status: 'In Progress',
          revisionStatus: 'rejected',
          delayReason: null,
          notes,
        });

        try {
          await adminDb.collection('tasks').doc(taskId).update({
            status: 'In Progress',
            revisionStatus: 'rejected',
            delayReason: null,
            notes,
            updatedAt: new Date(),
          });
        } catch {}

        await adminLog('REVISION_DECIDED_PORTAL', `Dead request rejected for ${taskId} by ${session.name}`, {
          taskId, uid: session.uid, meta: { decision: 'rejected', type: 'dead' },
        }).catch(() => {});
      }
    } else if (decision === 'approved') {
      const newEndDate = revision.requestedDate?.toDate().toISOString().slice(0, 10) || task.delayedDate?.toDate().toISOString().slice(0, 10);
      await cfApi(`/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          endDate: newEndDate,
          revisionStatus: 'accepted',
          delayedDate: null,
          delayReason: null,
          status: task.status === 'Delay Requested' ? 'In Progress' : task.status,
        }),
      }).catch(err => console.error('Failed to apply approved revision in D1:', err));
      updateTaskInReadCache(taskId, {
        endDate: newEndDate,
        revisionStatus: 'accepted',
        delayedDate: null,
        delayReason: null,
        status: task.status === 'Delay Requested' ? 'In Progress' : task.status,
      });

      try {
        await adminDb.collection('tasks').doc(taskId).update({
          endDate: newEndDate ? new Date(newEndDate) : task.endDate?.toDate(),
          revisionStatus: 'accepted',
          delayedDate: null,
          delayReason: null,
          status: task.status === 'Delay Requested' ? 'In Progress' : task.status,
          updatedAt: new Date(),
        });
      } catch {}

      await sendWhatsApp(
        task.assignedToWa,
        msgRevisionApproved({
          taskId:  task.taskId,
          newDate: formatDate(revision.requestedDate.toDate().toISOString()),
        }),
        taskId,
      ).catch(()=>{});

      await adminLog('REVISION_DECIDED_PORTAL', `Revision approved for ${taskId} by ${session.name}`, {
        taskId, uid: session.uid,
      }).catch(()=>{});
    } else {
      await cfApi(`/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          revisionStatus: 'rejected',
          delayedDate: null,
          delayReason: null,
          status: task.status === 'Delay Requested' ? 'In Progress' : task.status,
        }),
      }).catch(err => console.error('Failed to apply rejected revision in D1:', err));
      updateTaskInReadCache(taskId, {
        revisionStatus: 'rejected',
        delayedDate: null,
        delayReason: null,
        status: task.status === 'Delay Requested' ? 'In Progress' : task.status,
      });

      try {
        await adminDb.collection('tasks').doc(taskId).update({
          revisionStatus: 'rejected',
          delayedDate: null,
          delayReason: null,
          status: task.status === 'Delay Requested' ? 'In Progress' : task.status,
          updatedAt: new Date(),
        });
      } catch {}

      await sendWhatsApp(
        task.assignedToWa,
        msgRevisionRejected({ taskId: task.taskId }),
        taskId,
      ).catch(()=>{});

      await adminLog('REVISION_DECIDED_PORTAL', `Revision rejected for ${taskId} by ${session.name}`, {
        taskId, uid: session.uid,
      }).catch(()=>{});
    }

    const updatedTask = await adminGetTask(taskId);

    return NextResponse.json({
      success: true,
      data: serializeRevision(revision),
      task: updatedTask ? serializeTask(updatedTask) : undefined,
    });
  } catch (err: any) {
    console.error('PATCH /api/revisions error', err);
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 500 });
  }
}

