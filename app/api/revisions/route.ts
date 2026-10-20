import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import {
  adminGetAllRevisions,
  adminGetRevisionsByTask,
  adminGetPendingRevisionsByHandoff,
  serializeRevision,
} from '@/lib/firebase/revisions';
import { adminGetTask } from '@/lib/firebase/tasks';
import { adminLog } from '@/lib/firebase/scores';
import { sendWhatsApp, msgRevisionRequested, msgRevisionApproved, msgRevisionRejected } from '@/lib/waha';
import { formatDate } from '@/lib/utils';
import { canViewTask } from '@/lib/utils/access';
import { cfApi, hasCloudflareApi } from '@/lib/cloudflare/api';
import { cfRevision } from '@/lib/cloudflare/models';

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

    if (!requestedDate || Number.isNaN(Date.parse(requestedDate)) || !String(reason||'').trim()) return NextResponse.json({success:false,error:'Valid date and reason required'},{status:400});
    if (!hasCloudflareApi()) throw new Error('Cloudflare is required for atomic revision requests');
    const revision=cfRevision(await cfApi('/revisions',{method:'POST',body:JSON.stringify({taskId,requestedBy:session.uid,requestedByName:session.name,requestedDate,reason})}))!;

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
    ).catch(()=>{});

    await adminLog('REVISION_REQUESTED_PORTAL', `Revision requested for ${taskId} by ${session.name}`, {
      taskId, uid: session.uid,
    }).catch(()=>{});

    return NextResponse.json({ success: true, data: serializeRevision(revision) }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/revisions error', err);
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 500 });
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

    if (!['approved','rejected'].includes(decision) || !revisionId) return NextResponse.json({success:false,error:'Valid revision ID and decision required'},{status:400});
    if (!hasCloudflareApi()) throw new Error('Cloudflare is required for atomic revision decisions');
    const revision=cfRevision(await cfApi('/revisions',{method:'PATCH',body:JSON.stringify({revisionId,taskId,decision,decidedBy:session.uid,decidedByName:session.name,actorRole:session.role})}))!;
    if (decision === 'approved') {
      await sendWhatsApp(
        task.assignedToWa,
        msgRevisionApproved({
          taskId:  task.taskId,
          newDate: formatDate(revision.requestedDate.toDate().toISOString()),
        }),
        taskId,
      ).catch(()=>{});
    } else {
      await sendWhatsApp(
        task.assignedToWa,
        msgRevisionRejected({ taskId: task.taskId }),
        taskId,
      ).catch(()=>{});
    }

    await adminLog('REVISION_DECIDED_PORTAL', `Revision ${decision} for ${taskId} by ${session.name}`, {
      taskId, uid: session.uid,
    }).catch(()=>{});

    return NextResponse.json({ success: true, data: serializeRevision(revision) });
  } catch (err: any) {
    console.error('PATCH /api/revisions error', err);
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 500 });
  }
}
