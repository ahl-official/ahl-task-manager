import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
const defaultInput = path.join(root, 'outputs', 'data-cleaning', 'firestore-import.json');
const BATCH_SIZE = 450;
const DAY_MS = 24 * 60 * 60 * 1000;
const REPORT_COLLECTION = 'reports';
const PERIOD_COLLECTION = 'taskPeriods';
const MIS_COLLECTION = 'misScores';
const REMINDER_COLLECTION = 'reminderQueue';
const RECENT_DAILY_REPORT_DAYS = 90;
const CURRENT_COMPLETED_LOOKBACK_DAYS = 45;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

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

function toTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return Timestamp.fromDate(date);
}

function timestampToDate(value) {
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value);
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

function getTaskPeriodDate(task) {
  return timestampToDate(task.endDate)
    ?? timestampToDate(task.completedAt)
    ?? timestampToDate(task.startDate)
    ?? timestampToDate(task.createdAt)
    ?? new Date();
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

async function commitBatch(db, operations, dryRun) {
  if (dryRun || operations.length === 0) return;
  const batch = db.batch();
  for (const op of operations) {
    batch.set(op.ref, op.data, { merge: op.merge ?? false });
  }
  await batch.commit();
}

function scoreForUser(user, tasks) {
  const userTasks = tasks.filter(task => task.assignedTo === user.uid);
  const completedTasks = userTasks.filter(task => ['Completed', 'Verified'].includes(task.status));
  const onTimeCount = completedTasks.filter(task => {
    const endDate = task.endDate?.toMillis?.();
    const completedAt = task.completedAt?.toMillis?.();
    if (!endDate || !completedAt) return false;
    return completedAt <= endDate;
  }).length;
  const lateCount = Math.max(completedTasks.length - onTimeCount, 0);
  const monthlyScore = Math.min(100, Math.max(0, Math.round((onTimeCount / Math.max(userTasks.length, 1)) * 100)));

  return {
    uid: user.uid,
    name: user.name,
    department: user.department,
    waNumber: user.waNumber,
    tasksAssigned: userTasks.length,
    tasksCompleted: completedTasks.length,
    onTimeCount,
    lateCount,
    monthlyScore,
    lastUpdated: Timestamp.now(),
  };
}

function buildMetricBase({ id, periodType, periodKey, periodStart = null, periodEnd = null, user = null }) {
  return {
    id,
    periodType,
    periodKey,
    periodStart: periodStart ? Timestamp.fromDate(periodStart) : null,
    periodEnd: periodEnd ? Timestamp.fromDate(periodEnd) : null,
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
    updatedAt: Timestamp.now(),
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

  const completedAt = task.completedAt?.toMillis?.();
  const dueAt = task.delayedDate?.toMillis?.() ?? task.endDate?.toMillis?.();
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
  metrics.lastUpdated = metrics.updatedAt;
  return metrics;
}

function buildPeriodCollections(users, tasks, options = {}) {
  const usersByUid = new Map(users.map(user => [user.uid, user]));
  const misScores = new Map();
  const reports = new Map();
  const taskPeriods = new Map();
  const dailyReportCutoff = options.dailyReportCutoff ?? null;

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
      weekStart: Timestamp.fromDate(week.weekStart),
      weekEnd: Timestamp.fromDate(week.weekEnd),
      monthKey,
    });

    const weeklyScore = ensure(
      misScores,
      `weekly_${week.weekKey}_${task.assignedTo}`,
      () => buildMetricBase({
        id: `weekly_${week.weekKey}_${task.assignedTo}`,
        periodType: 'weekly',
        periodKey: week.weekKey,
        periodStart: week.weekStart,
        periodEnd: week.weekEnd,
        user,
      }),
    );
    applyTaskToMetrics(weeklyScore, task);

    const monthlyScore = ensure(
      misScores,
      `monthly_${monthKey}_${task.assignedTo}`,
      () => buildMetricBase({
        id: `monthly_${monthKey}_${task.assignedTo}`,
        periodType: 'monthly',
        periodKey: monthKey,
        periodStart: monthStart,
        periodEnd: monthEnd,
        user,
      }),
    );
    applyTaskToMetrics(monthlyScore, task);

    if (!dailyReportCutoff || dayStart >= dailyReportCutoff) {
      const dailyReport = ensure(
        reports,
        `daily_${dayKey}`,
        () => buildMetricBase({ id: `daily_${dayKey}`, periodType: 'daily', periodKey: dayKey, periodStart: dayStart, periodEnd: dayStart }),
      );
      applyTaskToMetrics(dailyReport, task);
    }

    const weeklyReport = ensure(
      reports,
      `weekly_${week.weekKey}`,
      () => buildMetricBase({ id: `weekly_${week.weekKey}`, periodType: 'weekly', periodKey: week.weekKey, periodStart: week.weekStart, periodEnd: week.weekEnd }),
    );
    applyTaskToMetrics(weeklyReport, task);

    const monthlyReport = ensure(
      reports,
      `monthly_${monthKey}`,
      () => buildMetricBase({ id: `monthly_${monthKey}`, periodType: 'monthly', periodKey: monthKey, periodStart: monthStart, periodEnd: monthEnd }),
    );
    applyTaskToMetrics(monthlyReport, task);

    const weekPeriod = ensure(
      taskPeriods,
      `weekly_${week.weekKey}`,
      () => buildMetricBase({ id: `weekly_${week.weekKey}`, periodType: 'weekly', periodKey: week.weekKey, periodStart: week.weekStart, periodEnd: week.weekEnd }),
    );
    applyTaskToMetrics(weekPeriod, task);

    const monthPeriod = ensure(
      taskPeriods,
      `monthly_${monthKey}`,
      () => buildMetricBase({ id: `monthly_${monthKey}`, periodType: 'monthly', periodKey: monthKey, periodStart: monthStart, periodEnd: monthEnd }),
    );
    applyTaskToMetrics(monthPeriod, task);
  }

  return {
    misScores: Array.from(misScores.values()).map(finalizeMetrics),
    reports: Array.from(reports.values()).map(finalizeMetrics),
    taskPeriods: Array.from(taskPeriods.values()).map(finalizeMetrics),
  };
}

function buildReminderQueue(tasks, options = {}) {
  const dueCutoff = options.dueCutoff ?? startOfUtcDay(new Date());
  const activeStatuses = new Set(['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue']);
  return tasks
    .filter(task => {
      if (!activeStatuses.has(task.status) || !task.endDate || !task.assignedToWa) return false;
      const dueDate = startOfUtcDay(timestampToDate(task.endDate));
      return dueDate >= dueCutoff;
    })
    .flatMap(task => {
      const dueDate = timestampToDate(task.endDate);
      const reminders = [
        {
          reminderType: 'due_today',
          dueAt: Timestamp.fromDate(startOfUtcDay(dueDate)),
        },
        {
          reminderType: 'overdue',
          dueAt: Timestamp.fromDate(addDays(startOfUtcDay(dueDate), 1)),
        },
      ];

      if (task.category === 'Daily') {
        reminders.push({
          reminderType: 'daily_report',
          dueAt: Timestamp.fromDate(startOfUtcDay(dueDate)),
        });
      }

      if (task.category === 'Weekly') {
        reminders.push({
          reminderType: 'weekly_report',
          dueAt: task.weekEnd ?? Timestamp.fromDate(getBusinessWeekPeriod(dueDate).weekEnd),
        });
      }

      if (task.category === 'Monthly') {
        const monthEnd = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1, 0));
        reminders.push({
          reminderType: 'monthly_report',
          dueAt: Timestamp.fromDate(monthEnd),
        });
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
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }));
    });
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
    const taskMonthKey = formatMonthKey(periodDate);
    const isCurrentWeek = taskWeek.weekKey === currentWeek.weekKey;
    const isCurrentMonth = taskMonthKey === currentMonthKey;
    const isRecentCompleted = ['Completed', 'Verified'].includes(task.status) && periodDate >= recentCompletedCutoff;

    return isCurrentWeek || isCurrentMonth || isRecentCompleted;
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const skipEmptyCheck = process.argv.includes('--skip-empty-check');
  const scopeArg = process.argv.find(arg => arg.startsWith('--scope='));
  const scope = scopeArg ? scopeArg.slice('--scope='.length) : 'current';
  if (!['current', 'full'].includes(scope)) {
    throw new Error('Invalid --scope. Use --scope=current or --scope=full.');
  }
  const modeArg = process.argv.find(arg => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'core';
  if (!['core', 'analytics', 'all'].includes(mode)) {
    throw new Error('Invalid --mode. Use --mode=core, --mode=analytics, or --mode=all.');
  }
  const inputArg = process.argv.find(arg => arg.startsWith('--input='));
  const inputPath = inputArg ? path.resolve(inputArg.slice('--input='.length)) : defaultInput;

  loadEnvFile(envPath);

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: required('FIREBASE_PROJECT_ID'),
        clientEmail: required('FIREBASE_CLIENT_EMAIL'),
        privateKey: required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
  }

  const db = getFirestore();
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const now = Timestamp.now();
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
      isActive: user.isActive !== false,
      createdAt: now,
      updatedAt: now,
    }));

  const usersByUid = new Map(users.map(user => [user.uid, user]));
  const allTasks = payload.tasks
    .filter(task => task.taskId && task.assignedTo && usersByUid.has(task.assignedTo))
    .map(task => {
      const user = usersByUid.get(task.assignedTo);
      const status = normalizeStatus(task.status);
      const assignedDate = toTimestamp(task.assignedDate) ?? toTimestamp(task.firstDate) ?? now;
      const startDate = toTimestamp(task.actualStartDate) ?? toTimestamp(task.firstDate);
      const endDate = toTimestamp(task.finalDate) ?? toTimestamp(task.firstDate);
      const completedAt = status === 'Completed' || status === 'Verified'
        ? toTimestamp(task.completedAt) ?? endDate ?? assignedDate
        : null;
      const delayedDate = toTimestamp(task.revision2) ?? toTimestamp(task.revision1);
      const notes = [task.notes, task.remarks].filter(Boolean).join('\n\n') || null;

      return {
        taskId: task.taskId,
        description: task.description,
        assignedTo: user.uid,
        assignedToName: user.name,
        assignedToWa: user.waNumber,
        createdBy: 'import',
        createdByName: 'Import',
        handoffUid: 'admin',
        handoffName: 'Admin',
        handoffWa: '',
        category: normalizeCategory(task.category),
        priority: normalizePriority(task.priority),
        status,
        department: user.department,
        startDate,
        endDate,
        delayedDate,
        delayReason: task.remarks || null,
        revisionStatus: status === 'Delay Requested' ? 'requested' : 'none',
        notes,
        acceptedAt: status === 'Pending Accept' ? null : assignedDate,
        completedAt,
        verifiedAt: status === 'Verified' ? completedAt : null,
        createdAt: assignedDate,
        updatedAt: completedAt ?? assignedDate,
      };
    });
  const today = startOfUtcDay(new Date());
  const tasks = scope === 'current' ? filterUsefulCurrentTasks(allTasks, today) : allTasks;

  const scores = users.map(user => scoreForUser(user, tasks));
  const dailyReportCutoff = addDays(today, -RECENT_DAILY_REPORT_DAYS);
  const { misScores, reports, taskPeriods } = buildPeriodCollections(users, tasks, { dailyReportCutoff });
  const reminderQueue = buildReminderQueue(tasks, { dueCutoff: today });
  const departments = allowedDepartments.length
    ? allowedDepartments
    : Array.from(new Set(users.map(user => user.department).filter(Boolean)));
  const maxTaskNumber = tasks.reduce((max, task) => {
    const match = String(task.taskId).match(/^T-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, tasks.length);

  console.log(`Firestore project: ${required('FIREBASE_PROJECT_ID')}`);
  console.log(`Input: ${inputPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'IMPORT'} ${mode}${force ? ' with --force' : ''}`);
  console.log(`Scope: ${scope}`);
  console.log(`Users: ${users.length}`);
  console.log(`Tasks: ${tasks.length}${scope === 'current' ? ` useful now / ${allTasks.length} cleaned` : ''}`);
  console.log(`Scores: ${scores.length}`);
  console.log(`Period MIS scores: ${misScores.length}`);
  console.log(`Reports: ${reports.length}`);
  console.log(`Task periods: ${taskPeriods.length}`);
  console.log(`Reminder queue items: ${reminderQueue.length}`);
  console.log(`Departments: ${departments.length}`);
  const coreWrites = users.length + tasks.length + scores.length + departments.length + 1;
  const analyticsWrites = misScores.length + reports.length + taskPeriods.length + reminderQueue.length;
  const estimatedWrites = mode === 'core'
    ? coreWrites
    : mode === 'analytics'
      ? analyticsWrites + 1
      : coreWrites + analyticsWrites;
  console.log(`Estimated core writes: ${coreWrites}`);
  console.log(`Estimated analytics writes: ${analyticsWrites}`);
  console.log(`Estimated selected writes: ${estimatedWrites}`);

  if (dryRun) return;

  if (!skipEmptyCheck) {
    const existingCollections = await db.listCollections();
    if ((mode === 'core' || mode === 'all') && existingCollections.length && !force) {
      throw new Error('Firestore is not empty. Re-run with --force if you really want to merge this import.');
    }
  } else {
    console.log('Skipping empty database check to avoid an extra Firestore read.');
  }

  const operations = [];
  if (mode === 'core' || mode === 'all') {
    users.forEach(user => operations.push({ ref: db.collection('users').doc(user.uid), data: user }));
    tasks.forEach(task => operations.push({ ref: db.collection('tasks').doc(task.taskId), data: task }));
    scores.forEach(score => operations.push({ ref: db.collection('scores').doc(score.uid), data: score }));
    departments.forEach(name => {
      const id = slugify(name);
      if (!id) return;
      operations.push({
        ref: db.collection('departments').doc(id),
        data: { id, name, isActive: true, createdAt: now, updatedAt: now },
      });
    });
    operations.push({
      ref: db.collection('counters').doc('tasks'),
      data: { current: maxTaskNumber, updatedAt: now, importedAt: now, source: payload.sourceWorkbook ?? null },
      merge: true,
    });
  }

  if (mode === 'analytics' || mode === 'all') {
    misScores.forEach(score => operations.push({ ref: db.collection(MIS_COLLECTION).doc(score.id), data: score }));
    reports.forEach(report => operations.push({ ref: db.collection(REPORT_COLLECTION).doc(report.id), data: report }));
    taskPeriods.forEach(period => operations.push({ ref: db.collection(PERIOD_COLLECTION).doc(period.id), data: period }));
    reminderQueue.forEach(reminder => operations.push({ ref: db.collection(REMINDER_COLLECTION).doc(reminder.id), data: reminder }));
  }

  for (let index = 0; index < operations.length; index += BATCH_SIZE) {
    const chunk = operations.slice(index, index + BATCH_SIZE);
    await commitBatch(db, chunk, dryRun);
    console.log(`Committed ${Math.min(index + chunk.length, operations.length)} / ${operations.length}`);
  }

  await db.collection('imports').doc(`cleaned-company-data-${mode}`).set({
    mode,
    sourceWorkbook: payload.sourceWorkbook ?? null,
    userCount: users.length,
    taskCount: tasks.length,
    scoreCount: scores.length,
    periodMisScoreCount: misScores.length,
    reportCount: reports.length,
    taskPeriodCount: taskPeriods.length,
    reminderQueueCount: reminderQueue.length,
    departmentCount: departments.length,
    importedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('Cleaned Firestore import complete.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
