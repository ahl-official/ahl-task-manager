import { NextRequest, NextResponse } from 'next/server';
import { withRecurringTaskDates } from '@/lib/cloudflare/recurringTaskDates';
import { getSession } from '@/lib/utils/auth';
import {
  adminCreateTask,
  adminGetAllTasks,
  adminGetTaskCounts,
  adminGetTasksByAssignee,
  adminGetTasksByHandoff,
  adminSearchTasks,
  generateTaskId,
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
import { normalizePersonName, isMisDeliveryExcluded } from '@/lib/utils/names';


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
  if (isLeader && !session.department?.trim()) return NextResponse.json({success:false,error:'Department is required'}, {status:403});
  
  // Non-admins can only see their own tasks or their department (if leader)
  const defaultScope = isAdmin ? 'all' : 'mine';
  const requestedScope = searchParams.get('scope') ?? defaultScope;
  const scope = (!isAdmin && !isLeader) ? (requestedScope === 'handoff' ? 'handoff' : 'mine') : requestedScope;
  
  const status     = searchParams.get('status') ?? undefined;
  const department = isLeader ? session.department : (isAdmin ? (searchParams.get('department') ?? undefined) : undefined);
  const searchQuery = searchParams.get('search') ?? searchParams.get('q') ?? undefined;
  const wantCounts = searchParams.get('counts') === 'true';
  const isFresh    = searchParams.get('fresh') === 'true' || searchParams.get('sync') === 'true';
  const isSearch = Boolean(searchQuery?.trim());
  const requestedLimit = searchParams.get('limit');
  const limitParam = requestedLimit === null || requestedLimit.trim() === '' ? NaN : Number(requestedLimit);
  const memberRecurringFilter = !isAdmin && !isLeader && searchParams.get('filter') === 'true' &&
    ['Daily', 'Weekly', 'Monthly'].includes(searchParams.get('category') || '');
  // Search bar results have no 100 limit; standard lookups keep the 100 limit
  const maxResults = isSearch
    ? (Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 5000) : 100)
    : (Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), memberRecurringFilter ? 5000 : 100) : 100);

  if (isFresh) {
    clearFirestoreReadCache('tasks:');
    clearFirestoreReadCache('scores:');
  }

  const responseHeaders = isFresh ? NO_CACHE_HEADERS : {
    'Cache-Control': 'private, no-cache, must-revalidate',
  };

  try {
    if (wantCounts) {
      const counts = await adminGetTaskCounts(department, {
        fresh: isFresh,
        scope: isAdmin || isLeader ? (scope === 'mine' ? 'mine' : scope === 'handoff' ? 'handoff' : 'all') : (scope === 'handoff' ? 'handoff' : 'mine'),
        uid: session.uid,
        assignedTo: searchParams.get('assignedTo') || undefined,
        category: searchParams.get('category') || undefined,
        priority: searchParams.get('priority') || undefined,
        status,
        excludeRecurring: !isAdmin && !isLeader,
        includeChecklist: false,
      });
      return NextResponse.json({ success: true, data: counts }, { headers: responseHeaders });
    }

    let tasks;

    if (searchQuery?.trim() || searchParams.get('filter') === 'true') {
      tasks = await adminSearchTasks(searchQuery || '', {
        department, limit: maxResults, status,
        scope: isAdmin || isLeader ? (scope === 'mine' ? 'mine' : scope === 'handoff' ? 'handoff' : 'all') : (scope === 'handoff' ? 'handoff' : 'visible'),
        uid: session.uid, assignedTo: searchParams.get('assignedTo') || undefined,
        category: searchParams.get('category') || undefined, priority: searchParams.get('priority') || undefined,
        excludeRecurring: searchParams.get('excludeRecurring') === 'true',
        verificationPending: searchParams.get('verificationPending') === 'true',
        weekStart: searchParams.get('weekStart') || undefined,
        weekEnd: searchParams.get('weekEnd') || undefined,
        fresh: isFresh,
      });
      tasks = filterTasksForSession(session, tasks);
    } else if (scope === 'all' && (isAdmin || isLeader)) {
      tasks = await adminGetAllTasks({ status: status as any, department, limit: maxResults, fresh: isFresh });
      tasks = filterTasksForSession(session, tasks);
    } else if (scope === 'handoff') {
      tasks = await adminGetTasksByHandoff(session.uid, status as any);
    } else {
      const [databaseTasks, timelyTasks] = await Promise.all([
        adminGetTasksByAssignee(session.uid, true),
        getPersonalTimelyTasks(session),
      ]);
      tasks = mergePersonalDashboardTasks(databaseTasks, timelyTasks);
    }

    const page = tasks.slice(0, maxResults);
    const displayedTasks = searchParams.get('recurringSummary') === 'true' ? await withRecurringTaskDates(page, isFresh) : page;
    return NextResponse.json({ success: true, data: displayedTasks.map(serializeTask) }, { headers: responseHeaders });
  } catch (err) {
    console.error('GET /api/tasks error', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch tasks' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

// POST /api/tasks — create task (admin only)
export async function POST(req: NextRequest) {
  const apiSecret = process.env.API_SHARED_SECRET;
  const taskCreationSecret = process.env.TASK_CREATION_SECRET;
  const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || req.headers.get('x-api-secret');
  const isAutomation = Boolean(
    (apiSecret && authHeader === apiSecret) ||
    (taskCreationSecret && authHeader === taskCreationSecret)
  );
  // A valid server credential takes precedence over browser cookies.
  let session = isAutomation
    ? {
      uid: 'automation-system',
      name: 'Automation',
      waNumber: '',
      role: 'admin' as const,
      department: 'Management',
    }
    : await getSession();

  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();

    const desc = String(body.description || '').toLowerCase();
    const notes = String(body.notes || '').toLowerCase();
    const src = String(body.source || body.automationType || body.automationName || '').toLowerCase();

    const isOpenSalonTask = isAutomation && (
      src.includes('zenoti') ||
      src.includes('open salon') ||
      notes.includes('open salon') ||
      notes.includes('zenoti') ||
      notes.includes('fixing payment status') ||
      desc.includes('open salon') ||
      desc.includes('zenoti') ||
      (desc.includes('fixing on') && desc.includes('order invoice'))
    );

    const isConsultationTask = isAutomation && !isOpenSalonTask && (
      src.includes('consultation') ||
      desc.includes('visited for consultation') ||
      desc.includes('has not booked the order') ||
      body.department === 'Consultant'
    );

    if (isAutomation) {
      if (isOpenSalonTask) {
        session.name = 'Open Salon Automation';
      } else if (isConsultationTask) {
        session.name = 'Consultation Automation';
      } else {
        session.name = body.createdByName || 'Automation';
      }
    }

    const [creator, allUsers] = await Promise.all([
      isAutomation ? Promise.resolve(null) : adminGetUserByUid(session.uid).catch(() => null),
      adminGetAllUsers().catch(() => []),
    ]);

    // Names from automated callers must resolve to one active user. Never guess a UID.
    const resolveActiveName = (value: unknown, field: string) => {
      const normalized = normalizePersonName(value);
      if (!normalized) return { error: `${field} is required`, status: 400 } as const;
      const matches = allUsers.filter((user: AHLUser) => {
        if (user.isActive === false) return false;
        const names = [user.name, user.rawName];
        // Legacy user IDs/display names may be stored as "user-shreeya".
        if (/^user[-_]/i.test(user.uid)) names.push(user.uid.replace(/^user[-_]/i, ''));
        if (/^user[-_]/i.test(user.name)) names.push(user.name.replace(/^user[-_]/i, ''));
        return names.some(name => name && normalizePersonName(name) === normalized);
      });
      if (matches.length === 0) return { error: `${field} was not found among active users`, status: 400 } as const;
      if (matches.length > 1) return { error: `${field} matches multiple active users`, status: 409 } as const;
      return { user: matches[0] } as const;
    };

    let resolvedAssignee = allUsers.find((user: AHLUser) =>
      user.isActive !== false && user.uid === String(body.assignedTo || '').trim()
    );
    if (!resolvedAssignee && body.assignedTo) {
      resolvedAssignee = await adminGetUserByUid(String(body.assignedTo).trim()).catch(() => null) ?? undefined;
    }
    if (!resolvedAssignee && body.assignedToName) {
      const match = resolveActiveName(body.assignedToName, 'assignedTo');
      if ('error' in match) return NextResponse.json({ success: false, error: match.error }, { status: match.status });
      resolvedAssignee = match.user;
    }
    if (!resolvedAssignee || resolvedAssignee.isActive === false) {
      return NextResponse.json({ success: false, error: 'Selected assignee could not be verified. Please refresh users and try again.' }, { status: 503 });
    }

    if (!body.handoffUid && (body.handoffName || body.handoff)) {
      const match = resolveActiveName(body.handoffName || body.handoff, 'handoff');
      if ('error' in match) return NextResponse.json({ success: false, error: match.error }, { status: match.status });
      body.handoffUid = match.user.uid;
    }

    // ONLY for automated tasks, set default checker to Yusra
    if (session.uid === 'automation-system') {
      const yusraUser = allUsers.find((u: AHLUser) => u.isActive !== false && (u.uid === 'user-yusra' || normalizePersonName(u.name) === 'yusra'));
      body.handoffUid = body.handoffUid || (yusraUser ? yusraUser.uid : 'user-yusra');
    } else {
      body.handoffUid = body.handoffUid || session.uid;
    }

    const assignee = resolvedAssignee;
    const checker = allUsers.find((user: AHLUser) => user.uid === body.handoffUid)
      ?? await adminGetUserByUid(String(body.handoffUid)).catch(() => null);
    if (!checker || checker.isActive === false) {
      return NextResponse.json({ success: false, error: 'Selected checker could not be verified. Please refresh users and try again.' }, { status: 503 });
    }
    body.assignedTo = assignee.uid;
    body.assignedToName = assignee.name;
    body.assignedToWa = assignee.waNumber;
    body.handoffUid = checker.uid;
    body.handoffName = checker.name;
    body.handoffWa = checker.waNumber;

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

    const isRecurring = ['Daily', 'Weekly', 'Monthly'].includes(body.category);

    if (!isRecurring && body.startDate && body.endDate && new Date(body.endDate) < new Date(body.startDate)) {
      return NextResponse.json({
        success: false,
        error: 'Due date must be after start date.',
      }, { status: 400 });
    }

    if (isRecurring) {
      const todayKey = indiaTodayKey();
      // For recurring tasks, only the entered due date is used; if none is selected, default to today.
      const targetDate = (body.endDate ? String(body.endDate).slice(0, 10) : '') || todayKey;
      const calculatedStartDate = targetDate;
      const calculatedEndDate = targetDate;
      let dayOfWeek: number | null = null;
      let dayOfMonth: number | null = null;

      if (body.category === 'Daily') {
        dayOfWeek = null;
        dayOfMonth = null;
      } else if (body.category === 'Weekly') {
        const [y, m, d] = targetDate.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        const dow = dt.getUTCDay();
        dayOfWeek = dow === 0 ? 7 : dow; // 1=Mon...7=Sun
      } else if (body.category === 'Monthly') {
        const [y, m, d] = targetDate.split('-').map(Number);
        dayOfMonth = d; // exact day of month from the entered due date
      }

      if (!hasCloudflareApi()) throw new Error('Cloudflare D1 is required for recurring task creation');
      const descText = String(body.description || '').trim();
      if (!descText) return NextResponse.json({ success: false, error: 'Description is required' }, { status: 400 });

      // Generate standard T-XXXX taskId so recurring tasks NEVER receive an ugly rec_ template ID
      const taskId = await generateTaskId();

      const d1Template = await createRecurringTemplate({
        id: taskId,
        title: descText.split('\n')[0].slice(0, 100),
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
        metadata: { startDate: targetDate, dueDate: targetDate },
      });

      const effectiveTaskId = d1Template.id || taskId;
      const effectiveDescription = body.description;

      await adminIncrementScore(assignee.uid, 'tasksAssigned').catch(() => {});
      await adminLog('TASK_CREATED', `Recurring task created (${body.category}): ${effectiveDescription}`, {
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

    const skipAcceptance = true;
    const task = await adminCreateTask(body, session.uid, {
      name: session.name,
      waNumber: session.waNumber,
      department: session.department,
    }, {
      skipAcceptance,
    });

    // Score: tasks assigned
    await adminIncrementScore(task.assignedTo, 'tasksAssigned').catch(err => {
      console.error('[Tasks API] Task was created but score update failed', err);
    });

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
    ).catch(err => console.error('[Tasks API] Assignee notification failed', err));

    // Collect coordinator / admin numbers to notify (ensuring no duplicate sends to checker or assignee)
    const isExcludedPhone = (phone?: string | null) => {
      const digits = String(phone || '').replace(/\D/g, '');
      return !digits || digits.endsWith('9820188505');
    };

    const coordinatorNumbers = new Set<string>();
    if (task.handoffWa && task.handoffWa !== task.assignedToWa && !isExcludedPhone(task.handoffWa)) {
      coordinatorNumbers.add(task.handoffWa);
    }

    // ONLY Open Salon automation tasks broadcast to all active admins (Consultation tasks do NOT broadcast)
    if (isOpenSalonTask) {
      const activeAdmins = allUsers.filter((u: AHLUser) =>
        u.isActive !== false &&
        u.role === 'admin' &&
        !isMisDeliveryExcluded(u) &&
        Boolean(u.waNumber)
      );
      for (const admin of activeAdmins) {
        if (admin.waNumber && admin.waNumber !== task.assignedToWa && !isExcludedPhone(admin.waNumber)) {
          coordinatorNumbers.add(admin.waNumber);
        }
      }
    }

    // Notify coordinator WA if configured
    const coordinatorWa = process.env.COORDINATOR_WA || '';
    if (coordinatorWa && coordinatorWa !== task.assignedToWa && !isExcludedPhone(coordinatorWa)) {
      coordinatorNumbers.add(coordinatorWa);
    }

    for (const wa of Array.from(coordinatorNumbers)) {
      await sendWhatsApp(
        wa,
        msgCoordinatorNotification({
          taskId:         task.taskId,
          description:    task.description,
          assignedToName: task.assignedToName,
          priority:       task.priority,
        }),
        task.taskId,
      ).catch(err => console.error('[Tasks API] Coordinator/Admin notification failed', err));
    }

    // The Cloudflare create route already records TASK_CREATED.
    if (!hasCloudflareApi()) await adminLog('TASK_CREATED', `Task ${task.taskId} created`, {
      taskId: task.taskId,
      uid: session.uid,
    }).catch(err => console.error('[Tasks API] Task was created but audit log failed', err));

    return NextResponse.json({ success: true, data: serializeTask(task) }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/tasks error', err);
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to create task' }, { status: 500 });
  }
}
