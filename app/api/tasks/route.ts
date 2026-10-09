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
import { clearFirestoreReadCache } from '@/lib/firebase/readCache';
import {
  sendWhatsApp,
  msgTaskAssigned,
  msgRecurringTaskAssigned,
  msgCoordinatorNotification,
} from '@/lib/waha';
import { formatDate } from '@/lib/utils';
import { canAssignTask } from '@/lib/utils/hierarchy';
import { filterTasksForSession } from '@/lib/utils/access';
import { adminGetUserByUid, adminGetAllUsers } from '@/lib/firebase/users';
import type { AHLUser } from '@/types';
import { getPersonalTimelyTasks, mergePersonalDashboardTasks } from '@/lib/utils/timelyDashboard';
import { hasCloudflareApi } from '@/lib/cloudflare/api';
import { createRecurringTemplate } from '@/lib/cloudflare/recurring';
import { indiaTodayKey } from '@/lib/utils/indiaDate';


export const dynamic = 'force-dynamic';
export const revalidate = 0;

function normalizeRole(role: string) {
  return role === 'user' ? 'member' : role;
}

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

// GET /api/tasks?scope=all|mine|handoff&status=...&department=...&search=...&counts=true&fresh=true
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const isAdmin = session.role === 'admin';
  const isLeader = session.role === 'leader';
  
  // Non-admins can only see their own tasks or their department (if leader)
  const defaultScope = isAdmin ? 'all' : 'mine';
  const requestedScope = searchParams.get('scope') ?? defaultScope;
  const scope = (!isAdmin && !isLeader) ? (requestedScope === 'handoff' ? 'handoff' : 'mine') : requestedScope;
  
  const status     = searchParams.get('status') ?? undefined;
  const department = isLeader ? session.department : (isAdmin ? (searchParams.get('department') ?? undefined) : undefined);
  const searchQuery = searchParams.get('search') ?? searchParams.get('q') ?? undefined;
  const wantCounts = searchParams.get('counts') === 'true';
  const isFresh    = searchParams.get('fresh') === 'true' || searchParams.get('sync') === 'true';
  const requestedLimit = searchParams.get('limit');
  const limitParam = requestedLimit ? (requestedLimit === 'all' ? null : Number(requestedLimit)) : 1000;
  const maxResults = typeof limitParam === 'number' && Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 1000)
    : (limitParam === null ? null : 1000);

  if (isFresh) {
    clearFirestoreReadCache('tasks:');
    clearFirestoreReadCache('scores:');
  }

  const responseHeaders = isFresh ? NO_CACHE_HEADERS : {
    'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
  };

  try {
    if (wantCounts) {
      const counts = await adminGetTaskCounts(department);
      return NextResponse.json({ success: true, data: counts }, { headers: responseHeaders });
    }

    let tasks;

    if (searchQuery && searchQuery.trim()) {
      tasks = await adminSearchTasks(searchQuery, { department, limit: maxResults ?? 100 });
      tasks = filterTasksForSession(session, tasks);
    } else if (scope === 'all' && (isAdmin || isLeader)) {
      tasks = await adminGetAllTasks({ status: status as any, department, limit: maxResults, fresh: isFresh });
      tasks = filterTasksForSession(session, tasks);
    } else if (scope === 'handoff') {
      tasks = await adminGetTasksByHandoff(session.uid, status as any);
    } else {
      const [databaseTasks, timelyTasks] = await Promise.all([
        adminGetTasksByAssignee(session.uid),
        getPersonalTimelyTasks(session),
      ]);
      tasks = mergePersonalDashboardTasks(databaseTasks, timelyTasks);
    }

    return NextResponse.json({ success: true, data: tasks.map(serializeTask) }, { headers: responseHeaders });
  } catch (err) {
    console.error('GET /api/tasks error', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch tasks' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

// POST /api/tasks — create task (admin only)
export async function POST(req: NextRequest) {
  const apiSecret = process.env.API_SHARED_SECRET || 'Americanhairline@1234';
  const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.headers.get('x-api-secret');
  let session = await getSession();

  if (!session && authHeader === apiSecret) {
    session = {
      uid: 'automation-system',
      name: 'Consultation Automation',
      waNumber: '',
      role: 'admin',
      department: 'Management',
    };
  }

  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();

    const [creator, allUsers] = await Promise.all([
      adminGetUserByUid(session.uid),
      adminGetAllUsers(),
    ]);

    // ONLY for automated tasks, set default checker to Tejal
    if (session.uid === 'automation-system') {
      const tejalUser = allUsers.find((u: AHLUser) => u.name.trim().toLowerCase() === 'tejal' || u.uid === 'user-tejal');
      body.handoffUid = body.handoffUid || (tejalUser ? tejalUser.uid : session.uid);
    } else {
      body.handoffUid = body.handoffUid || session.uid;
    }

    const targetAssignee = String(body.assignedTo || body.assignedToName || '').trim().toLowerCase();
    const assignee = allUsers.find((u: AHLUser) => {
      const uName = (u.name || '').trim().toLowerCase();
      const uUid = (u.uid || '').trim().toLowerCase();
      const uRaw = ((u as any).rawName || '').trim().toLowerCase();
      return uUid === targetAssignee || uName === targetAssignee || (uRaw && uRaw === targetAssignee);
    }) || (await adminGetUserByUid(body.assignedTo));

    if (!assignee) {
      throw new Error(`Selected assignee was not found: ${body.assignedTo || body.assignedToName}`);
    }
    body.assignedTo = assignee.uid;

    const creatorForRules = creator ?? {
      uid: session.uid,
      role: normalizeRole(session.role),
      department: session.department,
    };

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
      const todayKey = indiaTodayKey();
      let calculatedStartDate = body.startDate || todayKey;
      let calculatedEndDate = body.endDate || todayKey;
      let dayOfWeek: number | null = null;
      let dayOfMonth: number | null = null;

      if (body.category === 'Daily') {
        calculatedStartDate = body.startDate || todayKey;
        calculatedEndDate = body.endDate || todayKey;
      } else if (body.category === 'Weekly') {
        calculatedStartDate = body.startDate || todayKey;
        calculatedEndDate = body.endDate || todayKey;
        if (body.dayOfWeek != null) {
          dayOfWeek = Number(body.dayOfWeek);
        } else {
          const [y, m, d] = calculatedEndDate.split('-').map(Number);
          const dt = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
          const dow = dt.getUTCDay();
          dayOfWeek = dow === 0 ? 7 : dow; // 1=Mon...7=Sun
        }
      } else if (body.category === 'Monthly') {
        const [y, m] = todayKey.split('-').map(Number);
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const endOfMonthKey = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        calculatedStartDate = body.startDate || `${y}-${String(m).padStart(2, '0')}-01`;
        calculatedEndDate = body.endDate || endOfMonthKey;
        dayOfMonth = body.dayOfMonth != null ? Number(body.dayOfMonth) : lastDay;
      }

      let createdTaskRecord: any = null;
      try {
        createdTaskRecord = await adminCreateTask(
          {
            description: body.description,
            assignedTo: assignee.uid,
            department: assignee.department || body.department || '',
            category: body.category,
            priority: body.priority || 'Medium',
            startDate: calculatedStartDate,
            endDate: calculatedEndDate,
            handoffUid: body.handoffUid || session.uid,
          },
          session.uid,
          { name: session.name, waNumber: session.waNumber || '', department: session.department || '' },
          { skipAcceptance: true }
        );
      } catch (createErr) {
        console.warn('Failed to create recurring task record', createErr);
      }

      let d1Template = null;
      if (hasCloudflareApi()) {
        try {
          const descText = String(body.description || '').trim();
          const firstLine = descText.split('\n')[0].slice(0, 100).trim();
          d1Template = await createRecurringTemplate({
            title: firstLine || 'Recurring Task',
            description: descText,
            category: body.category,
            frequency: body.category,
            assignedTo: assignee.uid,
            assignedToName: assignee.name,
            department: assignee.department || body.department || '',
            dayOfWeek,
            dayOfMonth,
            timeOfDay: body.timeOfDay || '10:00',
            isActive: true,
          });
        } catch (cfErr) {
          console.warn('Failed to save recurring template to Cloudflare D1', cfErr);
        }
      }

      const effectiveTaskId = createdTaskRecord?.taskId || d1Template?.id || `T-${Date.now().toString().slice(-4)}`;
      const effectiveDescription = body.description;

      await adminIncrementScore(assignee.uid, 'tasksAssigned').catch(() => {});
      await adminLog('TASK_CREATED', `Recurring task created: ${effectiveDescription}`, {
        taskId: effectiveTaskId,
        uid: session.uid,
      }).catch(() => {});

      if (assignee.waNumber) {
        await sendWhatsApp(
          assignee.waNumber,
          msgRecurringTaskAssigned({
            taskId: effectiveTaskId,
            category: body.category,
            description: effectiveDescription,
            assignedToName: assignee.name,
            priority: body.priority || 'Medium',
            createdByName: session.name,
            startDate: calculatedStartDate,
            endDate: calculatedEndDate,
          }),
          effectiveTaskId,
        ).catch(err => console.error('[Tasks API] Recurring task WAHA notification failed', err));
      }

      return NextResponse.json({
        success: true,
        data: {
          taskId: effectiveTaskId,
          description: effectiveDescription,
          assignedTo: assignee.uid,
          assignedToName: assignee.name,
          category: body.category,
          status: 'In Progress',
          priority: body.priority || 'Medium',
          startDate: calculatedStartDate,
          endDate: calculatedEndDate,
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
    const coordinatorWa = process.env.COORDINATOR_WA || '';
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
