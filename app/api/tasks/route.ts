import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import {
  adminCreateTask,
  adminGetAllTasks,
  adminGetTaskCounts,
  adminGetTasksByAssignee,
  adminGetTasksByHandoff,
  adminSearchTasks,
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
import { hasCloudflareApi } from '@/lib/cloudflare/api';
import { getPersonalTimelyTasks, mergePersonalDashboardTasks } from '@/lib/utils/timelyDashboard';
import { appendTimelyTaskToSheetInput, ChecklistSheetCategory } from '@/lib/google/sheets';

function normalizeRole(role: string) {
  return role === 'user' ? 'member' : role;
}

// GET /api/tasks?scope=all|mine|handoff&status=...&department=...&search=...&counts=true
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scope      = searchParams.get('scope') ?? 'mine';
  const status     = searchParams.get('status') ?? undefined;
  const department = searchParams.get('department') ?? (session.role === 'leader' ? session.department : undefined);
  const searchQuery = searchParams.get('search') ?? searchParams.get('q') ?? undefined;
  const wantCounts = searchParams.get('counts') === 'true';
  const requestedLimit = searchParams.get('limit');
  const limitParam = requestedLimit ? Number(requestedLimit) : null;
  const maxResults = typeof limitParam === 'number' && Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 1000)
    : null;

  try {
    if (wantCounts) {
      const counts = await adminGetTaskCounts(department);
      return NextResponse.json({ success: true, data: counts });
    }

    let tasks;

    if (searchQuery && searchQuery.trim()) {
      tasks = await adminSearchTasks(searchQuery, { department, limit: maxResults ?? 100 });
      tasks = filterTasksForSession(session, tasks);
    } else if (scope === 'all') {
      tasks = await adminGetAllTasks({ status: status as any, department, limit: maxResults });
      tasks = filterTasksForSession(session, tasks);
    } else if (scope === 'handoff') {
      tasks = await adminGetTasksByHandoff(session.uid);
    } else {
      const [databaseTasks, timelyTasks] = await Promise.all([
        adminGetTasksByAssignee(session.uid),
        getPersonalTimelyTasks(session),
      ]);
      tasks = mergePersonalDashboardTasks(databaseTasks, timelyTasks);
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

    if (body.startDate && body.endDate && new Date(body.endDate) < new Date(body.startDate)) {
      return NextResponse.json({
        success: false,
        error: 'Due date must be after start date.',
      }, { status: 400 });
    }

    if (['Daily', 'Weekly', 'Monthly'].includes(body.category)) {
      const timelyResult = await appendTimelyTaskToSheetInput({
        category: body.category as ChecklistSheetCategory,
        description: body.description,
        assignedToUid: body.assignedTo,
        assignedToName: assignee.name,
        assignedToDept: assignee.department,
        startDate: body.startDate,
        endDate: body.endDate,
        session,
      });

      await adminIncrementScore(assignee.uid, 'tasksAssigned').catch(() => {});
      await adminLog('TASK_CREATED', `Timely task created in Google Sheets: ${timelyResult.description}`, {
        taskId: timelyResult.taskId,
        uid: session.uid,
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        data: {
          taskId: timelyResult.taskId,
          description: timelyResult.description,
          assignedTo: assignee.uid,
          assignedToName: assignee.name,
          category: body.category,
          status: 'In Progress',
          priority: body.priority || 'Medium',
          startDate: body.startDate || null,
          endDate: body.endDate || null,
          createdAt: new Date().toISOString(),
          createdBy: session.uid,
          createdByName: session.name,
        },
      }, { status: 201 });
    }

    const skipAcceptance = session.role === 'admin';
    const task = await adminCreateTask(body, session.uid, {
      name: session.name,
      waNumber: session.waNumber,
      department: session.department,
    }, {
      skipAcceptance,
    });

    // Score: tasks assigned
    await adminIncrementScore(task.assignedTo, 'tasksAssigned');

    // WA notifications safely handling string or Timestamp endDate
    const endDateIso = !task.endDate
      ? null
      : typeof (task.endDate as any).toDate === 'function'
        ? (task.endDate as any).toDate().toISOString()
        : String(task.endDate);

    const endDateStr = endDateIso
      ? formatDate(endDateIso)
      : skipAcceptance
        ? 'Set by assignee in portal'
        : 'Set by assignee on accept';

    await sendWhatsApp(
      task.assignedToWa,
      msgTaskAssigned({
        taskId:        task.taskId,
        description:   task.description,
        priority:      task.priority,
        endDate:       endDateStr,
        createdByName: task.createdByName,
        acceptanceRequired: !skipAcceptance,
        datesRequired: skipAcceptance && !task.endDate,
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
    const configSnap = hasCloudflareApi() ? null : await adminDb.collection('config').doc('app').get();
    const coordinatorWa = process.env.COORDINATOR_WA || (configSnap?.exists ? configSnap.data()!.coordinatorWa : '');
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
