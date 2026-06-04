import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import {
  adminCreateTask,
  adminGetAllTasks,
  adminGetTasksByAssignee,
  adminGetTasksByHandoff,
  serializeTask,
} from '@/lib/firebase/tasks';
import { adminIncrementScore, adminLog } from '@/lib/firebase/scores';
import {
  sendWhatsApp,
  msgTaskAssigned,
  msgCoordinatorNotification,
} from '@/lib/waha';
import { formatDate } from '@/lib/utils';
import { canAssignTask } from '@/lib/utils/hierarchy';
import { filterTasksForSession } from '@/lib/utils/access';
import { adminDb } from '@/lib/firebase/admin';
import { adminGetUserByUid } from '@/lib/firebase/users';

function normalizeRole(role: string) {
  return role === 'user' ? 'member' : role;
}

// GET /api/tasks?scope=all|mine|handoff&status=...&department=...
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scope      = searchParams.get('scope') ?? 'mine';
  const status     = searchParams.get('status') ?? undefined;
  const department = searchParams.get('department') ?? undefined;

  try {
    let tasks;

    if (scope === 'all') {
      tasks = await adminGetAllTasks({ status: status as any, department });
      tasks = filterTasksForSession(session, tasks);
    } else if (scope === 'handoff') {
      tasks = await adminGetTasksByHandoff(session.uid);
    } else {
      tasks = await adminGetTasksByAssignee(session.uid);
    }

    return NextResponse.json({ success: true, data: tasks.map(serializeTask) });
  } catch (err) {
    console.error('GET /api/tasks error', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/tasks — create task (admin only)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    body.handoffUid = body.handoffUid || session.uid;
    const [creator, assignee] = await Promise.all([
      adminGetUserByUid(session.uid),
      adminGetUserByUid(body.assignedTo),
    ]);

    const creatorForRules = creator ?? {
      uid: session.uid,
      role: normalizeRole(session.role),
      department: session.department,
    };

    if (!assignee) {
      throw new Error(`Selected assignee was not found: ${body.assignedTo}`);
    }

    const assigneeForRules = {
      ...assignee,
      role: normalizeRole(assignee.role),
    };

    if (!canAssignTask(creatorForRules as any, assigneeForRules as any)) {
      return NextResponse.json({
        success: false,
        error: 'This assignment is not allowed by the department hierarchy.',
      }, { status: 403 });
    }

    const task = await adminCreateTask(body, session.uid, {
      name: session.name,
      waNumber: session.waNumber,
      department: session.department,
    });

    // Score: tasks assigned
    await adminIncrementScore(task.assignedTo, 'tasksAssigned');

    // WA notifications
    const endDateStr = task.endDate ? formatDate(task.endDate.toDate().toISOString()) : 'Set by assignee on accept';

    await sendWhatsApp(
      task.assignedToWa,
      msgTaskAssigned({
        taskId:        task.taskId,
        description:   task.description,
        priority:      task.priority,
        endDate:       endDateStr,
        createdByName: task.createdByName,
      }),
      task.taskId,
    );

    await sendWhatsApp(
      task.handoffWa,
      msgCoordinatorNotification({
        taskId:         task.taskId,
        description:    task.description,
        assignedToName: task.assignedToName,
        priority:       task.priority,
      }),
      task.taskId,
    );

    // Notify coordinator WA if configured
    const configSnap = await adminDb.collection('config').doc('app').get();
    const coordinatorWa = configSnap.exists ? configSnap.data()!.coordinatorWa : '';
    if (coordinatorWa && coordinatorWa !== task.handoffWa) {
      await sendWhatsApp(
        coordinatorWa,
        msgCoordinatorNotification({
          taskId:         task.taskId,
          description:    task.description,
          assignedToName: task.assignedToName,
          priority:       task.priority,
        }),
        task.taskId,
      );
    }

    await adminLog('TASK_CREATED', `Task ${task.taskId} created`, {
      taskId: task.taskId,
      uid:    session.uid,
    });

    return NextResponse.json({ success: true, data: serializeTask(task) }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/tasks error', err);
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to create task' }, { status: 500 });
  }
}
