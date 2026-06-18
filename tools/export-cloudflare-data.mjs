import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const defaultInput = path.join(root, 'outputs', 'data-cleaning', 'firestore-import.json');
const outputDir = path.join(root, 'outputs', 'cloudflare');
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAILY_REPORT_DAYS = 90;
const CURRENT_COMPLETED_LOOKBACK_DAYS = 45;

function normalizeStatus(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'completed' || text === 'complete' || text === 'done') return 'Completed';
  if (text === 'verified') return 'Verified';
  if (text === 'overdue') return 'Overdue';
  if (text === 'in progress' || text === 'in-progress') return 'In Progress';
  if (text === 'delay requested' || text === 'shifted') return 'Delay Requested';
  return 'Pending Accept';
}

function normalizeCategory(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'daily') return 'Daily';
  if (text === 'weekly') return 'Weekly';
  if (text === 'monthly') return 'Monthly';
  return 'One Time';
}

function normalizePriority(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'high') return 'High';
  if (text === 'low') return 'Low';
  return 'Medium';
}

function toIso(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isoToDate(value) {
  return value ? new Date(value) : null;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date) {
  return date.toISOString().slice(0, 7);
}

function getBusinessWeekPeriod(dateInput) {
  const date = startOfUtcDay(dateInput);
  const day = date.getUTCDay();
  const daysSinceWednesday = (day - 3 + 7) % 7;
  const weekStart = addDays(date, -daysSinceWednesday);
  const weekEnd = addDays(weekStart, 6);
  const year = weekStart.getUTCFullYear();
  const jan1 = startOfUtcDay(new Date(Date.UTC(year, 0, 1)));
  const firstWeekStart = addDays(jan1, -((jan1.getUTCDay() - 3 + 7) % 7));
  const weekNumber = Math.floor((weekStart.getTime() - firstWeekStart.getTime()) / (7 * DAY_MS)) + 1;
  return {
    weekKey: `${year}-W${String(weekNumber).padStart(2, '0')}`,
    weekStart,
    weekEnd,
  };
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeListValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeListKey(value) {
  return normalizeListValue(value).toLowerCase();
}

function getTaskPeriodDate(task) {
  return isoToDate(task.endDate)
    ?? isoToDate(task.completedAt)
    ?? isoToDate(task.startDate)
    ?? isoToDate(task.createdAt)
    ?? new Date();
}

function filterUsefulCurrentTasks(tasks, today) {
  const activeStatuses = new Set(['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue']);
  const currentWeek = getBusinessWeekPeriod(today);
  const currentMonthKey = formatMonthKey(today);
  const recentCompletedCutoff = addDays(today, -CURRENT_COMPLETED_LOOKBACK_DAYS);

  return tasks.filter(task => {
    if (activeStatuses.has(task.status)) return true;
    const periodDate = startOfUtcDay(getTaskPeriodDate(task));
    const taskWeek = getBusinessWeekPeriod(periodDate);
    return taskWeek.weekKey === currentWeek.weekKey
      || formatMonthKey(periodDate) === currentMonthKey
      || (['Completed', 'Verified'].includes(task.status) && periodDate >= recentCompletedCutoff);
  });
}

function buildMetricBase({ id, periodType, periodKey, periodStart = null, periodEnd = null, user = null }) {
  const now = new Date().toISOString();
  return {
    id,
    periodType,
    periodKey,
    periodStart: periodStart ? periodStart.toISOString() : null,
    periodEnd: periodEnd ? periodEnd.toISOString() : null,
    uid: user?.uid ?? null,
    name: user?.name ?? null,
    department: user?.department ?? null,
    waNumber: user?.waNumber ?? null,
    tasksAssigned: 0,
    tasksCompleted: 0,
    tasksVerified: 0,
    pendingAccept: 0,
    inProgress: 0,
    delayRequested: 0,
    overdue: 0,
    onTimeCount: 0,
    lateCount: 0,
    highPriority: 0,
    mediumPriority: 0,
    lowPriority: 0,
    misScore: 0,
    monthlyScore: 0,
    updatedAt: now,
    lastUpdated: now,
  };
}

function applyTaskToMetrics(metrics, task) {
  metrics.tasksAssigned += 1;
  if (task.status === 'Completed') metrics.tasksCompleted += 1;
  if (task.status === 'Verified') {
    metrics.tasksCompleted += 1;
    metrics.tasksVerified += 1;
  }
  if (task.status === 'Pending Accept') metrics.pendingAccept += 1;
  if (task.status === 'In Progress') metrics.inProgress += 1;
  if (task.status === 'Delay Requested') metrics.delayRequested += 1;
  if (task.status === 'Overdue') metrics.overdue += 1;
  if (task.priority === 'High') metrics.highPriority += 1;
  if (task.priority === 'Medium') metrics.mediumPriority += 1;
  if (task.priority === 'Low') metrics.lowPriority += 1;

  const completedAt = isoToDate(task.completedAt)?.getTime();
  const dueAt = isoToDate(task.delayedDate)?.getTime() ?? isoToDate(task.endDate)?.getTime();
  if (completedAt && dueAt) {
    if (completedAt <= dueAt) metrics.onTimeCount += 1;
    else metrics.lateCount += 1;
  }
}

function finalizeMetrics(metrics) {
  const denominator = Math.max(metrics.tasksAssigned, 1);
  const completionScore = metrics.tasksCompleted / denominator;
  const onTimeScore = metrics.onTimeCount / denominator;
  const penalty = (metrics.overdue + metrics.delayRequested) / denominator;
  metrics.misScore = Math.min(100, Math.max(0, Math.round((completionScore * 70) + (onTimeScore * 30) - (penalty * 10))));
  metrics.monthlyScore = metrics.misScore;
  return metrics;
}

function buildPeriodCollections(users, tasks, today) {
  const usersByUid = new Map(users.map(user => [user.uid, user]));
  const misScores = new Map();
  const reports = new Map();
  const taskPeriods = new Map();
  const dailyReportCutoff = addDays(today, -RECENT_DAILY_REPORT_DAYS);

  function ensure(map, key, factory) {
    if (!map.has(key)) map.set(key, factory());
    return map.get(key);
  }

  for (const task of tasks) {
    const user = usersByUid.get(task.assignedTo);
    const periodDate = getTaskPeriodDate(task);
    const dayStart = startOfUtcDay(periodDate);
    const dayKey = formatDateKey(dayStart);
    const monthKey = formatMonthKey(dayStart);
    const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth() + 1, 0));
    const week = getBusinessWeekPeriod(dayStart);

    Object.assign(task, {
      dayKey,
      weekKey: week.weekKey,
      weekStart: week.weekStart.toISOString(),
      weekEnd: week.weekEnd.toISOString(),
      monthKey,
    });

    applyTaskToMetrics(ensure(misScores, `weekly_${week.weekKey}_${task.assignedTo}`, () => buildMetricBase({
      id: `weekly_${week.weekKey}_${task.assignedTo}`,
      periodType: 'weekly',
      periodKey: week.weekKey,
      periodStart: week.weekStart,
      periodEnd: week.weekEnd,
      user,
    })), task);

    applyTaskToMetrics(ensure(misScores, `monthly_${monthKey}_${task.assignedTo}`, () => buildMetricBase({
      id: `monthly_${monthKey}_${task.assignedTo}`,
      periodType: 'monthly',
      periodKey: monthKey,
      periodStart: monthStart,
      periodEnd: monthEnd,
      user,
    })), task);

    if (dayStart >= dailyReportCutoff) {
      applyTaskToMetrics(ensure(reports, `daily_${dayKey}`, () => buildMetricBase({
        id: `daily_${dayKey}`,
        periodType: 'daily',
        periodKey: dayKey,
        periodStart: dayStart,
        periodEnd: dayStart,
      })), task);
    }

    applyTaskToMetrics(ensure(reports, `weekly_${week.weekKey}`, () => buildMetricBase({
      id: `weekly_${week.weekKey}`,
      periodType: 'weekly',
      periodKey: week.weekKey,
      periodStart: week.weekStart,
      periodEnd: week.weekEnd,
    })), task);

    applyTaskToMetrics(ensure(reports, `monthly_${monthKey}`, () => buildMetricBase({
      id: `monthly_${monthKey}`,
      periodType: 'monthly',
      periodKey: monthKey,
      periodStart: monthStart,
      periodEnd: monthEnd,
    })), task);

    applyTaskToMetrics(ensure(taskPeriods, `weekly_${week.weekKey}`, () => buildMetricBase({
      id: `weekly_${week.weekKey}`,
      periodType: 'weekly',
      periodKey: week.weekKey,
      periodStart: week.weekStart,
      periodEnd: week.weekEnd,
    })), task);

    applyTaskToMetrics(ensure(taskPeriods, `monthly_${monthKey}`, () => buildMetricBase({
      id: `monthly_${monthKey}`,
      periodType: 'monthly',
      periodKey: monthKey,
      periodStart: monthStart,
      periodEnd: monthEnd,
    })), task);
  }

  return {
    misScores: Array.from(misScores.values()).map(finalizeMetrics),
    reports: Array.from(reports.values()).map(finalizeMetrics),
    taskPeriods: Array.from(taskPeriods.values()).map(finalizeMetrics),
  };
}

function buildScores(users, tasks) {
  return users.map(user => {
    const userTasks = tasks.filter(task => task.assignedTo === user.uid);
    const completedTasks = userTasks.filter(task => ['Completed', 'Verified'].includes(task.status));
    const onTimeCount = completedTasks.filter(task => {
      const dueAt = isoToDate(task.endDate)?.getTime();
      const completedAt = isoToDate(task.completedAt)?.getTime();
      return dueAt && completedAt && completedAt <= dueAt;
    }).length;
    const lateCount = Math.max(completedTasks.length - onTimeCount, 0);
    return {
      uid: user.uid,
      name: user.name,
      department: user.department,
      waNumber: user.waNumber,
      tasksAssigned: userTasks.length,
      tasksCompleted: completedTasks.length,
      onTimeCount,
      lateCount,
      monthlyScore: Math.min(100, Math.max(0, Math.round((onTimeCount / Math.max(userTasks.length, 1)) * 100))),
      lastUpdated: new Date().toISOString(),
    };
  });
}

function buildReminderQueue(tasks, today) {
  const activeStatuses = new Set(['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue']);
  return tasks
    .filter(task => activeStatuses.has(task.status) && task.endDate && task.assignedToWa && startOfUtcDay(isoToDate(task.endDate)) >= today)
    .flatMap(task => {
      const dueDate = isoToDate(task.endDate);
      const reminders = [
        { reminderType: 'due_today', dueAt: startOfUtcDay(dueDate).toISOString() },
        { reminderType: 'overdue', dueAt: addDays(startOfUtcDay(dueDate), 1).toISOString() },
      ];
      if (task.category === 'Daily') reminders.push({ reminderType: 'daily_report', dueAt: startOfUtcDay(dueDate).toISOString() });
      if (task.category === 'Weekly') reminders.push({ reminderType: 'weekly_report', dueAt: task.weekEnd ?? getBusinessWeekPeriod(dueDate).weekEnd.toISOString() });
      if (task.category === 'Monthly') {
        const monthEnd = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1, 0));
        reminders.push({ reminderType: 'monthly_report', dueAt: monthEnd.toISOString() });
      }
      return reminders.map(reminder => ({
        id: `${task.taskId}_${reminder.reminderType}`,
        taskId: task.taskId,
        assignedTo: task.assignedTo,
        assignedToName: task.assignedToName,
        waNumber: task.assignedToWa,
        department: task.department,
        reminderType: reminder.reminderType,
        dueAt: reminder.dueAt,
        status: 'pending',
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    });
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insertSql(table, columns, rows) {
  if (!rows.length) return '';
  return rows.map(row => {
    const values = columns.map(column => sqlValue(row[column]));
    return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
  }).join('\n');
}

function buildTask(rawTask, user) {
  const status = normalizeStatus(rawTask.status);
  const assignedDate = toIso(rawTask.assignedDate) ?? toIso(rawTask.firstDate) ?? new Date().toISOString();
  const startDate = toIso(rawTask.actualStartDate) ?? toIso(rawTask.firstDate);
  const endDate = toIso(rawTask.finalDate) ?? toIso(rawTask.firstDate);
  const completedAt = ['Completed', 'Verified'].includes(status)
    ? toIso(rawTask.completedAt) ?? endDate ?? assignedDate
    : null;
  return {
    taskId: rawTask.taskId,
    description: rawTask.description,
    assignedTo: user.uid,
    assignedToName: user.name,
    assignedToWa: user.waNumber,
    createdBy: 'import',
    createdByName: 'Import',
    handoffUid: 'admin',
    handoffName: 'Admin',
    handoffWa: '',
    category: normalizeCategory(rawTask.category),
    priority: normalizePriority(rawTask.priority),
    status,
    department: user.department,
    startDate,
    endDate,
    delayedDate: toIso(rawTask.revision2) ?? toIso(rawTask.revision1),
    delayReason: rawTask.remarks || null,
    revisionStatus: status === 'Delay Requested' ? 'requested' : 'none',
    notes: [rawTask.notes, rawTask.remarks].filter(Boolean).join('\n\n') || null,
    acceptedAt: status === 'Pending Accept' ? null : assignedDate,
    completedAt,
    verifiedAt: status === 'Verified' ? completedAt : null,
    createdAt: assignedDate,
    updatedAt: completedAt ?? assignedDate,
  };
}

function ensureUniqueTaskIds(tasks) {
  const seen = new Map();
  return tasks.map(task => {
    const count = (seen.get(task.taskId) || 0) + 1;
    seen.set(task.taskId, count);
    if (count === 1) return task;
    return { ...task, taskId: `${task.taskId}__${count}` };
  });
}

async function main() {
  const inputArg = process.argv.find(arg => arg.startsWith('--input='));
  const scopeArg = process.argv.find(arg => arg.startsWith('--scope='));
  const scope = scopeArg ? scopeArg.slice('--scope='.length) : 'current';
  if (!['current', 'full'].includes(scope)) throw new Error('Use --scope=current or --scope=full.');

  const inputPath = inputArg ? path.resolve(inputArg.slice('--input='.length)) : defaultInput;
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const now = new Date().toISOString();
  const allowedDepartments = Array.isArray(payload.allowedDepartments)
    ? payload.allowedDepartments.map(normalizeListValue).filter(Boolean)
    : [];
  const allowedDepartmentKeys = new Set(allowedDepartments.map(normalizeListKey));

  const users = payload.users
    .filter(user => user.uid && user.name && user.waNumber)
    .map(user => ({
      uid: user.uid,
      name: user.name,
      rawName: user.rawName ?? '',
      email: user.email ?? '',
      waNumber: user.waNumber,
      waNumberLast10: user.waNumberLast10,
      role: user.role || 'member',
      department: allowedDepartmentKeys.has(normalizeListKey(user.department)) ? normalizeListValue(user.department) : '',
      isActive: user.isActive !== false ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    }));
  const usersByUid = new Map(users.map(user => [user.uid, user]));
  const allTasks = ensureUniqueTaskIds(payload.tasks
    .filter(task => task.taskId && task.assignedTo && usersByUid.has(task.assignedTo))
    .map(task => buildTask(task, usersByUid.get(task.assignedTo))));
  const today = startOfUtcDay(new Date());
  const currentTasks = scope === 'current' ? filterUsefulCurrentTasks(allTasks, today) : allTasks;
  const archiveTasks = allTasks.filter(task => !currentTasks.some(current => current.taskId === task.taskId));
  const { misScores, reports, taskPeriods } = buildPeriodCollections(users, currentTasks, today);
  const scores = buildScores(users, currentTasks);
  const reminders = buildReminderQueue(currentTasks, today);
  const departments = (allowedDepartments.length
    ? allowedDepartments
    : Array.from(new Set(users.map(user => user.department).filter(Boolean)))
  ).map(name => ({
    id: slugify(name),
    name,
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  }));

  const sections = [
    'PRAGMA foreign_keys = OFF;',
    insertSql('departments', ['id', 'name', 'is_active', 'created_at', 'updated_at'], departments.map(row => ({
      id: row.id,
      name: row.name,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }))),
    insertSql('users', ['uid', 'name', 'raw_name', 'email', 'wa_number', 'wa_number_last10', 'role', 'department', 'is_active', 'created_at', 'updated_at'], users.map(user => ({
      uid: user.uid,
      name: user.name,
      raw_name: user.rawName,
      email: user.email,
      wa_number: user.waNumber,
      wa_number_last10: user.waNumberLast10,
      role: user.role,
      department: user.department,
      is_active: user.isActive,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    }))),
    insertSql('tasks_current', [
      'task_id', 'description', 'assigned_to', 'assigned_to_name', 'assigned_to_wa',
      'created_by', 'created_by_name', 'handoff_uid', 'handoff_name', 'handoff_wa',
      'category', 'priority', 'status', 'department', 'start_date', 'end_date',
      'delayed_date', 'delay_reason', 'revision_status', 'notes', 'accepted_at',
      'completed_at', 'verified_at', 'created_at', 'updated_at', 'day_key',
      'week_key', 'week_start', 'week_end', 'month_key',
    ], currentTasks.map(task => ({
      task_id: task.taskId,
      description: task.description,
      assigned_to: task.assignedTo,
      assigned_to_name: task.assignedToName,
      assigned_to_wa: task.assignedToWa,
      created_by: task.createdBy,
      created_by_name: task.createdByName,
      handoff_uid: task.handoffUid,
      handoff_name: task.handoffName,
      handoff_wa: task.handoffWa,
      category: task.category,
      priority: task.priority,
      status: task.status,
      department: task.department,
      start_date: task.startDate,
      end_date: task.endDate,
      delayed_date: task.delayedDate,
      delay_reason: task.delayReason,
      revision_status: task.revisionStatus,
      notes: task.notes,
      accepted_at: task.acceptedAt,
      completed_at: task.completedAt,
      verified_at: task.verifiedAt,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
      day_key: task.dayKey,
      week_key: task.weekKey,
      week_start: task.weekStart,
      week_end: task.weekEnd,
      month_key: task.monthKey,
    }))),
    insertSql('scores', ['uid', 'name', 'department', 'wa_number', 'tasks_assigned', 'tasks_completed', 'on_time_count', 'late_count', 'monthly_score', 'last_updated'], scores.map(score => ({
      uid: score.uid,
      name: score.name,
      department: score.department,
      wa_number: score.waNumber,
      tasks_assigned: score.tasksAssigned,
      tasks_completed: score.tasksCompleted,
      on_time_count: score.onTimeCount,
      late_count: score.lateCount,
      monthly_score: score.monthlyScore,
      last_updated: score.lastUpdated,
    }))),
    insertSql('mis_scores', ['id', 'period_type', 'period_key', 'period_start', 'period_end', 'uid', 'name', 'department', 'wa_number', 'tasks_assigned', 'tasks_completed', 'tasks_verified', 'pending_accept', 'in_progress', 'delay_requested', 'overdue', 'on_time_count', 'late_count', 'high_priority', 'medium_priority', 'low_priority', 'mis_score', 'monthly_score', 'updated_at', 'last_updated'], misScores.map(metric => metricRow(metric))),
    insertSql('reports', ['id', 'period_type', 'period_key', 'period_start', 'period_end', 'tasks_assigned', 'tasks_completed', 'tasks_verified', 'pending_accept', 'in_progress', 'delay_requested', 'overdue', 'on_time_count', 'late_count', 'high_priority', 'medium_priority', 'low_priority', 'mis_score', 'monthly_score', 'updated_at', 'last_updated'], reports.map(metric => metricRow(metric))),
    insertSql('task_periods', ['id', 'period_type', 'period_key', 'period_start', 'period_end', 'tasks_assigned', 'tasks_completed', 'tasks_verified', 'pending_accept', 'in_progress', 'delay_requested', 'overdue', 'on_time_count', 'late_count', 'high_priority', 'medium_priority', 'low_priority', 'mis_score', 'monthly_score', 'updated_at', 'last_updated'], taskPeriods.map(metric => metricRow(metric))),
    insertSql('reminder_queue', ['id', 'task_id', 'assigned_to', 'assigned_to_name', 'wa_number', 'department', 'reminder_type', 'due_at', 'status', 'attempts', 'last_error', 'created_at', 'updated_at'], reminders.map(reminder => ({
      id: reminder.id,
      task_id: reminder.taskId,
      assigned_to: reminder.assignedTo,
      assigned_to_name: reminder.assignedToName,
      wa_number: reminder.waNumber,
      department: reminder.department,
      reminder_type: reminder.reminderType,
      due_at: reminder.dueAt,
      status: reminder.status,
      attempts: reminder.attempts,
      last_error: reminder.lastError,
      created_at: reminder.createdAt,
      updated_at: reminder.updatedAt,
    }))),
    insertSql('imports', ['id', 'mode', 'source_workbook', 'user_count', 'task_count', 'score_count', 'period_mis_score_count', 'report_count', 'task_period_count', 'reminder_queue_count', 'department_count', 'imported_at'], [{
      id: `cloudflare-${scope}`,
      mode: scope,
      source_workbook: payload.sourceWorkbook ?? null,
      user_count: users.length,
      task_count: currentTasks.length,
      score_count: scores.length,
      period_mis_score_count: misScores.length,
      report_count: reports.length,
      task_period_count: taskPeriods.length,
      reminder_queue_count: reminders.length,
      department_count: departments.length,
      imported_at: now,
    }]),
    'PRAGMA foreign_keys = ON;',
  ].filter(Boolean);

  await fs.promises.mkdir(outputDir, { recursive: true });
  const sqlPath = path.join(outputDir, `d1-${scope}-import.sql`);
  const archivePath = path.join(outputDir, `r2-${scope}-archive-tasks.json`);
  fs.writeFileSync(sqlPath, `${sections.join('\n\n')}\n`, 'utf8');
  fs.writeFileSync(archivePath, JSON.stringify({
    sourceWorkbook: payload.sourceWorkbook ?? null,
    generatedAt: now,
    scope,
    archivedTaskCount: archiveTasks.length,
    tasks: archiveTasks,
  }, null, 2), 'utf8');

  console.log(`Wrote ${sqlPath}`);
  console.log(`Wrote ${archivePath}`);
  console.log(`Users: ${users.length}`);
  console.log(`Current tasks: ${currentTasks.length}`);
  console.log(`Archived tasks: ${archiveTasks.length}`);
  console.log(`MIS scores: ${misScores.length}`);
  console.log(`Reports: ${reports.length}`);
  console.log(`Reminder queue: ${reminders.length}`);
  console.log(`Departments: ${departments.length}`);
}

function metricRow(metric) {
  return {
    id: metric.id,
    period_type: metric.periodType,
    period_key: metric.periodKey,
    period_start: metric.periodStart,
    period_end: metric.periodEnd,
    uid: metric.uid,
    name: metric.name,
    department: metric.department,
    wa_number: metric.waNumber,
    tasks_assigned: metric.tasksAssigned,
    tasks_completed: metric.tasksCompleted,
    tasks_verified: metric.tasksVerified,
    pending_accept: metric.pendingAccept,
    in_progress: metric.inProgress,
    delay_requested: metric.delayRequested,
    overdue: metric.overdue,
    on_time_count: metric.onTimeCount,
    late_count: metric.lateCount,
    high_priority: metric.highPriority,
    medium_priority: metric.mediumPriority,
    low_priority: metric.lowPriority,
    mis_score: metric.misScore,
    monthly_score: metric.monthlyScore,
    updated_at: metric.updatedAt,
    last_updated: metric.lastUpdated,
  };
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
