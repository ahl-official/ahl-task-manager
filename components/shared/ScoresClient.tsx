'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn, STATUS_COLORS } from '@/lib/utils';
import { addDaysKey, dateKeyInRange, formatWeekLabel, getMisWeekPeriod, getPreviousMisWeekPeriod, listRecentMisWeeks } from '@/lib/mis/week';
import { formatDmy, indiaDateKey } from '@/lib/utils/indiaDate';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Search,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import TaskModal from '@/components/shared/TaskModal';
import type { TaskSerialized } from '@/types';

type TaskFilter = 'all' | 'Pending Accept' | 'In Progress' | 'Completed' | 'Verified' | 'Overdue';

interface MisBucketView {
  planned: number;
  done: number;
  onTime: number;
}

interface MisParameterView {
  id: string;
  label: string;
  section: string;
  group: 'checklist' | 'delegation' | 'fms';
  planned: number;
  done: number;
  onTime: number;
  gapPercent: number | null;
}

interface MisPersonView {
  uid: string | null;
  name: string;
  department: string;
  gapPercent: number | null;
  gapLabel: string;
  onTimeGapPercent: number | null;
  planned: number;
  done: number;
  onTime: number;
  checklist: MisBucketView;
  delegation: MisBucketView;
  fms: MisBucketView;
  parameters: MisParameterView[];
  weekStart: string;
  weekEnd: string;
  weekKey: string;
}

interface Props {
  scores: any[];
  users?: { uid: string; name: string; department: string; role?: string; isActive?: boolean }[];
  tasks?: TaskSerialized[];
  departments?: { id?: string; name: string }[];
  currentUid?: string;
  viewerRole?: 'admin' | 'leader' | 'member' | 'intern';
  showDepartments?: boolean;
}

function emptyBucket(): MisBucketView {
  return { planned: 0, done: 0, onTime: 0 };
}

function safeName(value: unknown) {
  const name = String(value ?? '').trim();
  return name || 'Unknown';
}

function initials(value: unknown) {
  return safeName(value).slice(0, 2).toUpperCase();
}

function lookupMis(
  map: Record<string, MisPersonView>,
  uid: string,
  name: string,
): MisPersonView | null {
  return map[uid] || map[`name:${String(name ?? '').trim().toLowerCase()}`] || null;
}

function downloadMisPdf(person: MisPersonView, portalMis: number) {
  const gap = person.gapLabel;
  const onTimeGap = person.onTimeGapPercent === null || person.onTimeGapPercent === undefined
    ? '—'
    : `${person.onTimeGapPercent.toFixed(2)}%`;
  const bucketRows = [
    ['Checklist (timely sheets)', person.checklist],
    ['Delegation (One Time)', person.delegation],
    ['FMS (sheet workflows)', person.fms],
  ] as const;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(person.name)} MIS Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; padding: 32px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
    .hero { display: flex; gap: 24px; margin-bottom: 24px; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 16px; min-width: 160px; }
    .label { font-size: 11px; color: #666; text-transform: uppercase; }
    .value { font-size: 28px; font-weight: bold; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e5e5e5; padding: 8px 10px; text-align: left; font-size: 13px; }
    th { background: #f7f7f7; }
    .foot { margin-top: 28px; font-size: 11px; color: #888; }
  </style>
</head>
<body>
  <h1>${escapeHtml(person.name)} — MIS Report</h1>
  <p class="sub">${escapeHtml(person.department || '—')} · Week ${escapeHtml(person.weekStart)} → ${escapeHtml(person.weekEnd)} (${escapeHtml(person.weekKey)})</p>
  <div class="hero">
    <div class="box">
      <div class="label">PDF MIS (gap)</div>
      <div class="value">${escapeHtml(gap)}</div>
      <div class="label" style="margin-top:8px">0% = all planned done</div>
    </div>
    <div class="box">
      <div class="label">On-time gap</div>
      <div class="value">${escapeHtml(onTimeGap)}</div>
    </div>
    <div class="box">
      <div class="label">Portal MIS</div>
      <div class="value">${portalMis}%</div>
      <div class="label" style="margin-top:8px">on-time / assigned</div>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Bucket</th><th>Planned</th><th>Done</th><th>On time</th></tr>
    </thead>
    <tbody>
      ${bucketRows.map(([label, b]) =>
        `<tr><td>${label}</td><td>${b.planned}</td><td>${b.done}</td><td>${b.onTime}</td></tr>`
      ).join('')}
      <tr>
        <td><strong>Total</strong></td>
        <td><strong>${person.planned}</strong></td>
        <td><strong>${person.done}</strong></td>
        <td><strong>${person.onTime}</strong></td>
      </tr>
    </tbody>
  </table>
  <p class="foot">Formula: ROUND(done / planned × 100 − 100, 2). Generated from AHL Task Manager.</p>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function ScoresClient({
  scores,
  users = [],
  tasks = [],
  departments: initialDepartments = [],
  currentUid = '',
  viewerRole = 'member',
  showDepartments = false,
}: Props) {
  const [taskItems, setTaskItems] = useState(tasks);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [selectedTask, setSelectedTask] = useState<TaskSerialized | null>(null);
  const [pdfByKey, setPdfByKey] = useState<Record<string, MisPersonView>>({});
  const [pdfWeekLabel, setPdfWeekLabel] = useState('');
  const [misLoading, setMisLoading] = useState(true);
  const [nameQuery, setNameQuery] = useState('');
  const [nameMenuOpen, setNameMenuOpen] = useState(false);

  const weekOptions = useMemo(() => listRecentMisWeeks(16), []);
  const defaultWeek = useMemo(() => getMisWeekPeriod(), []);
  const [weekStart, setWeekStart] = useState(() => defaultWeek.weekStart);
  const [calendarDate, setCalendarDate] = useState(() => defaultWeek.weekEnd);
  const nameBoxRef = useRef<HTMLDivElement>(null);
  const weekCacheRef = useRef<Map<string, { map: Record<string, MisPersonView>; weekLabel: string }>>(new Map());

  const selectedWeekMeta = useMemo(() => getMisWeekPeriod(weekStart || defaultWeek.weekStart), [weekStart, defaultWeek.weekStart]);
  const isCurrentWeek = weekOptions[0]?.weekKey === selectedWeekMeta.weekKey;

  const filteredTaskItems = useMemo(() => {
    if (!weekStart) return taskItems;
    const { weekStart: start, weekEnd: end } = selectedWeekMeta;
    return taskItems.filter(task => {
      const tWeekStart = task.weekStart ? indiaDateKey(task.weekStart) : null;
      if (tWeekStart && tWeekStart === start) return true;

      const endKey = task.endDate ? indiaDateKey(task.endDate) : null;
      const delayedKey = task.delayedDate ? indiaDateKey(task.delayedDate) : null;
      const completedKey = task.completedAt ? indiaDateKey(task.completedAt) : null;
      const startKey = task.startDate ? indiaDateKey(task.startDate) : null;
      const createdKey = task.createdAt ? indiaDateKey(task.createdAt) : null;

      const primaryDateKey = endKey ?? delayedKey ?? completedKey ?? startKey ?? createdKey;
      if (primaryDateKey && dateKeyInRange(primaryDateKey, start, end)) return true;

      return false;
    });
  }, [taskItems, weekStart, selectedWeekMeta]);

  useEffect(() => {
    setTaskItems(tasks);
  }, [tasks]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!nameBoxRef.current?.contains(e.target as Node)) setNameMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!weekStart) return;

    if (weekCacheRef.current.has(weekStart)) {
      const cached = weekCacheRef.current.get(weekStart)!;
      setPdfByKey(cached.map);
      setPdfWeekLabel(cached.weekLabel);
      setMisLoading(false);
      return;
    }

    let cancelled = false;
    setMisLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ mode: 'live', weekStart });
        const res = await fetch(`/api/mis?${params.toString()}`);
        const json = await res.json();
        if (!res.ok || !json.success || cancelled) return;
        const map: Record<string, MisPersonView> = {};
        for (const row of json.data ?? []) {
          const payload: MisPersonView = {
            uid: row.uid ?? null,
            name: row.name ?? '',
            department: row.department ?? '',
            gapPercent: row.gapPercent ?? null,
            gapLabel: row.gapLabel ?? '—',
            onTimeGapPercent: row.onTimeGapPercent ?? null,
            planned: row.planned ?? 0,
            done: row.done ?? 0,
            onTime: row.onTime ?? 0,
            checklist: row.checklist ?? emptyBucket(),
            delegation: row.delegation ?? emptyBucket(),
            fms: row.fms ?? emptyBucket(),
            parameters: Array.isArray(row.parameters) ? row.parameters : [],
            weekStart: row.weekStart ?? json.meta?.weekStart ?? '',
            weekEnd: row.weekEnd ?? json.meta?.weekEnd ?? '',
            weekKey: row.weekKey ?? json.meta?.weekKey ?? '',
          };
          if (row.uid) map[row.uid] = payload;
          if (row.name) map[`name:${String(row.name).trim().toLowerCase()}`] = payload;
        }
        const label = json.meta?.weekStart && json.meta?.weekEnd
          ? formatWeekLabel(json.meta.weekStart, json.meta.weekEnd)
          : formatWeekLabel(selectedWeekMeta.weekStart, selectedWeekMeta.weekEnd);
        weekCacheRef.current.set(weekStart, { map, weekLabel: label });
        setPdfByKey(map);
        if (label) setPdfWeekLabel(label);
      } catch {
        // PDF MIS is additive; portal on-time scores still render
      } finally {
        if (!cancelled) setMisLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekStart, selectedWeekMeta]);

  function updateTask(updated?: TaskSerialized) {
    if (!updated) {
      setSelectedTask(null);
      return;
    }

    setTaskItems(current => current.map(task => task.taskId === updated.taskId ? updated : task));
    setSelectedTask(updated);
  }

  function removeTask(taskId: string) {
    setTaskItems(current => current.filter(task => task.taskId !== taskId));
    setSelectedTask(null);
  }

  const activeUsers = users.filter(user => user.isActive !== false);
  const scoreMap = useMemo(() =>
    Object.fromEntries(scores.map(score => [score.uid, score])),
    [scores],
  );

  function sameDepartment(left?: string, right?: string) {
    return (left ?? '').trim().toLowerCase() === (right ?? '').trim().toLowerCase();
  }

  function scoreForIdentity(identity: { uid: string; name: string; department: string }) {
    const existing = scoreMap[identity.uid];
    const rows = filteredTaskItems.filter(task => task.assignedTo === identity.uid);
    const completedRows = rows.filter(task => ['Completed', 'Verified'].includes(task.status));
    const onTimeRows = completedRows.filter(task => {
      if (!task.completedAt) return false;
      const due = task.delayedDate ?? task.endDate;
      return due ? new Date(task.completedAt).getTime() <= new Date(due).getTime() : true;
    });
    const lateRows = rows.filter(task => {
      if (task.status === 'Overdue') return true;
      if (Boolean(task.endDate) && new Date(task.endDate!) < new Date() && ['Pending Accept', 'In Progress', 'Delay Requested'].includes(task.status)) return true;
      if (!task.completedAt) return false;
      const due = task.delayedDate ?? task.endDate;
      return due ? new Date(task.completedAt).getTime() > new Date(due).getTime() : false;
    });
    const assigned = rows.length;
    const onTime = onTimeRows.length;
    const monthlyScore = assigned > 0
      ? Math.min(100, Math.max(0, Math.round((onTime / assigned) * 100)))
      : (isCurrentWeek ? Math.min(100, Math.max(0, existing?.monthlyScore ?? 0)) : 0);

    return {
      uid: identity.uid,
      name: identity.name || existing?.name || 'Unknown',
      department: identity.department || existing?.department || '',
      waNumber: existing?.waNumber ?? '',
      tasksAssigned: assigned,
      tasksCompleted: completedRows.length,
      onTimeCount: onTime,
      lateCount: lateRows.length,
      monthlyScore,
      lastUpdated: existing?.lastUpdated ?? null,
    };
  }

  const normalizedScores = useMemo(() => {
    const rows = activeUsers.length
      ? activeUsers.map(user => scoreForIdentity(user))
      : scores.map(score => scoreForIdentity({ uid: score.uid, name: score.name, department: score.department }));

    const knownIds = new Set(rows.map(row => row.uid));
    scores.forEach(score => {
      if (!knownIds.has(score.uid)) {
        rows.push(scoreForIdentity({ uid: score.uid, name: score.name, department: score.department }));
      }
    });

    return rows;
  }, [activeUsers, scoreMap, scores, filteredTaskItems, isCurrentWeek]);

  const departments = useMemo(() => {
    const fromUsers = activeUsers.map(user => user.department).filter(Boolean);
    const fromScores = normalizedScores.map(score => score.department).filter(Boolean);
    const fromSaved = initialDepartments.map(department => department.name).filter(Boolean);
    return Array.from(new Set([...fromSaved, ...fromUsers, ...fromScores])).sort((a, b) => a.localeCompare(b));
  }, [activeUsers, initialDepartments, normalizedScores]);

  function isTaskOverdue(task: TaskSerialized): boolean {
    if (task.status === 'Overdue') return true;
    if (!task.endDate) return false;
    if (task.status !== 'Pending Accept' && task.status !== 'In Progress' && task.status !== 'Delay Requested') return false;
    return new Date(task.endDate) < new Date();
  }

  function userTasks(uid: string, nextFilter: TaskFilter = filter) {
    const rows = filteredTaskItems.filter(task => task.assignedTo === uid);
    if (nextFilter === 'all') return rows;
    if (nextFilter === 'Completed') return rows.filter(task => ['Completed', 'Verified'].includes(task.status));
    if (nextFilter === 'Overdue') return rows.filter(isTaskOverdue);
    return rows.filter(task => task.status === nextFilter);
  }

  function countsForUser(uid: string) {
    const rows = filteredTaskItems.filter(task => task.assignedTo === uid);
    return {
      total: rows.length,
      pending: rows.filter(task => task.status === 'Pending Accept').length,
      active: rows.filter(task => task.status === 'In Progress').length,
      completed: rows.filter(task => ['Completed', 'Verified'].includes(task.status)).length,
      overdue: rows.filter(isTaskOverdue).length,
    };
  }

  const departmentBlocks = departments.map(department => {
    const identities = new Map<string, { uid: string; name: string; department: string; role?: string; isActive?: boolean }>();

    activeUsers
      .filter(user => sameDepartment(user.department, department))
      .forEach(user => identities.set(user.uid, user));

    filteredTaskItems
      .filter(task => sameDepartment(task.department, department))
      .forEach(task => {
        if (!identities.has(task.assignedTo)) {
          identities.set(task.assignedTo, {
            uid: task.assignedTo,
            name: task.assignedToName,
            department: task.department,
          });
        }
      });

    normalizedScores
      .filter(score => sameDepartment(score.department, department))
      .forEach(score => {
        if (!identities.has(score.uid)) {
          identities.set(score.uid, {
            uid: score.uid,
            name: score.name,
            department: score.department,
          });
        }
      });

    const departmentUsers = Array.from(identities.values());
    const departmentScores = departmentUsers.map(user => scoreForIdentity(user));
    const userIds = new Set(departmentUsers.map(user => user.uid));
    const departmentTasks = filteredTaskItems.filter(task => userIds.has(task.assignedTo));
    const averageScore = departmentScores.length
      ? Math.round(departmentScores.reduce((sum, score) => sum + (score.monthlyScore ?? 0), 0) / departmentScores.length)
      : 0;

    return {
      name: department,
      averageScore,
      users: departmentUsers,
      scores: departmentScores,
      counts: {
        total: departmentTasks.length,
        pending: departmentTasks.filter(task => task.status === 'Pending Accept').length,
        active: departmentTasks.filter(task => task.status === 'In Progress').length,
        completed: departmentTasks.filter(task => ['Completed', 'Verified'].includes(task.status)).length,
        overdue: departmentTasks.filter(isTaskOverdue).length,
      },
    };
  });

  const selectedBlock = selectedDepartment
    ? departmentBlocks.find(block => block.name === selectedDepartment)
    : null;

  const memberDirectory = useMemo(() => {
    const map = new Map<string, { uid: string; name: string; department: string }>();
    for (const user of activeUsers) {
      if (!user.uid || !user.name) continue;
      map.set(user.uid, { uid: user.uid, name: user.name, department: user.department || '' });
    }
    for (const score of normalizedScores) {
      if (!score.uid || !score.name || map.has(score.uid)) continue;
      map.set(score.uid, { uid: score.uid, name: score.name, department: score.department || '' });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeUsers, normalizedScores]);

  const nameMatches = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return [];
    return memberDirectory
      .filter(m => m.name.toLowerCase().includes(q) || m.department.toLowerCase().includes(q))
      .slice(0, 8);
  }, [memberDirectory, nameQuery]);

  function openMemberScore(member: { uid: string; name: string; department: string }) {
    const byUid = departmentBlocks.find(block => block.scores.some(s => s.uid === member.uid));
    const byDept = member.department
      ? departmentBlocks.find(block => sameDepartment(block.name, member.department))
      : undefined;
    const dept = byUid?.name || byDept?.name || member.department || '';
    if (!dept) return;
    setSelectedDepartment(dept);
    setSelectedUser(member.uid);
    setFilter('all');
    setNameQuery('');
    setNameMenuOpen(false);
  }

  function onPickCalendarDate(value: string) {
    if (!value) return;
    const week = getMisWeekPeriod(value);
    const maxStart = defaultWeek.weekStart;
    const targetStart = week.weekStart > maxStart ? maxStart : week.weekStart;
    setCalendarDate(value);
    setWeekStart(targetStart);
    setSelectedUser(null);
  }

  function onSelectWeekStart(start: string) {
    if (!start) return;
    const week = getMisWeekPeriod(start);
    setWeekStart(week.weekStart);
    setCalendarDate(week.weekStart);
    setSelectedUser(null);
  }

  function selectPrevWeek() {
    const prevStart = addDaysKey(selectedWeekMeta.weekStart, -7);
    onSelectWeekStart(prevStart);
  }

  const canGoNext = useMemo(() => {
    return selectedWeekMeta.weekStart < defaultWeek.weekStart;
  }, [selectedWeekMeta.weekStart, defaultWeek.weekStart]);

  function selectNextWeek() {
    if (!canGoNext) return;
    const nextStart = addDaysKey(selectedWeekMeta.weekStart, 7);
    onSelectWeekStart(nextStart);
  }

  const sortedScores = [...normalizedScores].sort((a, b) => (b.monthlyScore ?? 0) - (a.monthlyScore ?? 0));

  const scoresWithPdf = sortedScores.map(score => {
    const pdf = lookupMis(pdfByKey, score.uid, score.name);
    return {
      ...score,
      pdfGapPercent: pdf?.gapPercent ?? null,
      pdfGapLabel: pdf?.gapLabel ?? '—',
      mis: pdf,
    };
  });

  const listProps = {
    onSelectUser: (uid: string) => {
      setSelectedUser(selectedUser === uid ? null : uid);
      setFilter('all');
    },
    selectedUser,
    userTasks,
    countsForUser,
    filter,
    setFilter,
    onOpenTask: setSelectedTask,
    pdfWeekLabel,
  };

  const dateFilterBar = (
    <div className="flex flex-wrap items-center gap-3">
      <div ref={nameBoxRef} className="relative min-w-[220px] flex-1 basis-[240px]">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={nameQuery}
          onChange={e => {
            setNameQuery(e.target.value);
            setNameMenuOpen(true);
          }}
          onFocus={() => setNameMenuOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && nameMatches[0]) {
              e.preventDefault();
              openMemberScore(nameMatches[0]);
            }
            if (e.key === 'Escape') setNameMenuOpen(false);
          }}
          placeholder="Search member name…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          autoComplete="off"
        />
        {nameMenuOpen && nameQuery.trim() && (
          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {nameMatches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">No member found</p>
            ) : (
              nameMatches.map(member => (
                <button
                  key={member.uid}
                  type="button"
                  onClick={() => openMemberScore(member)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">{member.name}</span>
                  <span className="truncate text-xs text-gray-400">{member.department}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectPrevWeek}
          title="Previous week"
          className="flex h-9.5 w-9.5 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <ChevronLeft size={18} />
        </button>

        <select
          value={selectedWeekMeta.weekStart}
          onChange={e => onSelectWeekStart(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm font-medium text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          aria-label="Select MIS week"
        >
          {weekOptions.map(w => (
            <option key={w.weekKey} value={w.weekStart}>
              {formatWeekLabel(w.weekStart, w.weekEnd)} {w.weekKey === defaultWeek.weekKey ? '(Current)' : ''}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <Calendar size={16} className="shrink-0 text-gray-400" />
          <input
            type="date"
            value={calendarDate}
            max={defaultWeek.weekEnd}
            onChange={e => onPickCalendarDate(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-gray-900 focus:outline-none focus:ring-0"
            aria-label="MIS week date"
          />
        </div>

        <button
          type="button"
          onClick={selectNextWeek}
          disabled={!canGoNext}
          title={canGoNext ? 'Next week' : 'Current week'}
          className="flex h-9.5 w-9.5 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <ChevronRight size={18} />
        </button>

        <span className="hidden whitespace-nowrap text-xs text-gray-500 sm:inline font-medium">
          {selectedWeekMeta.weekKey} · {isCurrentWeek ? 'current' : 'completed'}
        </span>

        {misLoading && (
          <span className="text-xs text-gray-400 animate-pulse">Loading…</span>
        )}
      </div>
    </div>
  );

  if (!showDepartments) {
    return (
      <div className="space-y-4">
        {dateFilterBar}
        {pdfWeekLabel && (
          <p className="text-xs text-gray-500">
            PDF MIS (gap % for week {pdfWeekLabel}): 0% means all planned work done
          </p>
        )}
        <ScoreList scores={scoresWithPdf} {...listProps} />
        {selectedTask && (
          <TaskModal
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            role={viewerRole === 'admin' ? 'admin' : 'user'}
            currentUid={currentUid}
            onUpdate={updateTask}
            onDelete={removeTask}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {dateFilterBar}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {departmentBlocks.length === 0 && (
          <div className="card p-10 text-center text-sm text-gray-400 md:col-span-2 xl:col-span-3">
            No department score data yet
          </div>
        )}

        {departmentBlocks.map(block => (
          <button
            key={block.name}
            type="button"
            onClick={() => {
              setSelectedDepartment(block.name);
              setSelectedUser(null);
              setFilter('all');
            }}
            className="card min-h-[190px] p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Building2 size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{block.name}</h2>
                  <p className="text-xs text-gray-400">{block.users.length || block.scores.length} scored team members</p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn('text-2xl font-bold', getScoreColor(block.averageScore))}>{block.averageScore}%</p>
                <p className="text-[10px] text-gray-400">Dept MIS</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-5 gap-2">
              {[
                { label: 'Total', value: block.counts.total, color: 'text-gray-700' },
                { label: 'Pending', value: block.counts.pending, color: 'text-yellow-700' },
                { label: 'Active', value: block.counts.active, color: 'text-blue-700' },
                { label: 'Done', value: block.counts.completed, color: 'text-green-700' },
                { label: 'Late', value: block.counts.overdue, color: 'text-red-700' },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-gray-50 px-2 py-2 text-center">
                  <p className={cn('text-sm font-bold', item.color)}>{item.value}</p>
                  <p className="text-[10px] text-gray-400">{item.label}</p>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      {selectedBlock && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 p-3 sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-xl lg:max-w-7xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">
                    {selectedUser
                      ? (selectedBlock.scores.find(s => s.uid === selectedUser)?.name || 'Member')
                      : selectedBlock.name}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {selectedUser
                      ? 'MIS Report (same gap formula as sheet MIS Report Master)'
                      : `${selectedBlock.averageScore}% department portal MIS · click a member to open MIS report`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedUser && (
                  <button
                    type="button"
                    onClick={() => setSelectedUser(null)}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
                  >
                    Back to members
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDepartment(null);
                    setSelectedUser(null);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
              {selectedUser ? (
                (() => {
                  const score = selectedBlock.scores
                    .map(row => {
                      const pdf = lookupMis(pdfByKey, row.uid, row.name);
                      return {
                        ...row,
                        pdfGapPercent: pdf?.gapPercent ?? null,
                        pdfGapLabel: pdf?.gapLabel ?? '—',
                        mis: pdf,
                      };
                    })
                    .find(row => row.uid === selectedUser);
                  if (!score) {
                    return <p className="text-sm text-gray-400">Member not found.</p>;
                  }
                  if (misLoading && !score.mis) {
                    return (
                      <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-sm text-gray-400">
                        Loading week MIS…
                      </div>
                    );
                  }
                  return (
                    <MisReportMasterView
                      score={score}
                      mis={score.mis ?? null}
                      weekLabel={pdfWeekLabel}
                      onDownload={() => {
                        if (!score.mis) return;
                        downloadMisPdf(score.mis, score.monthlyScore ?? 0);
                      }}
                    />
                  );
                })()
              ) : selectedBlock.scores.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No members scored in this department yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedBlock.scores
                    .map(score => {
                      const pdf = lookupMis(pdfByKey, score.uid, score.name);
                      return {
                        ...score,
                        pdfGapPercent: pdf?.gapPercent ?? null,
                        pdfGapLabel: pdf?.gapLabel ?? '—',
                      };
                    })
                    .sort((a, b) => (b.monthlyScore ?? 0) - (a.monthlyScore ?? 0))
                    .map((score, index) => {
                      const initials = String(score.name || '?').trim().slice(0, 2).toUpperCase() || '?';
                      return (
                      <button
                        key={score.uid || `member-${index}`}
                        type="button"
                        onClick={() => setSelectedUser(score.uid)}
                        className="flex w-full items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 text-left hover:bg-gray-50"
                      >
                        <span className="w-8 text-center text-sm font-bold text-gray-400">#{index + 1}</span>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-sm font-semibold text-gray-700">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900">{score.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">Open MIS report</p>
                        </div>
                        <div className="text-right">
                          <p className={cn('text-lg font-bold', getGapColor(score.pdfGapPercent))}>{score.pdfGapLabel}</p>
                          <p className="text-[10px] text-gray-400">PDF MIS</p>
                        </div>
                      </button>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          role={viewerRole === 'admin' ? 'admin' : 'user'}
          currentUid={currentUid}
          onUpdate={updateTask}
          onDelete={removeTask}
        />
      )}
    </div>
  );
}

function ScoreList({
  scores,
  onSelectUser,
  selectedUser,
  userTasks,
  countsForUser,
  filter,
  setFilter,
  onOpenTask,
  pdfWeekLabel,
}: {
  scores: any[];
  onSelectUser: (uid: string) => void;
  selectedUser: string | null;
  userTasks: (uid: string, filter?: TaskFilter) => TaskSerialized[];
  countsForUser: (uid: string) => { total: number; pending: number; active: number; completed: number; overdue: number };
  filter: TaskFilter;
  setFilter: (filter: TaskFilter) => void;
  onOpenTask: (task: TaskSerialized) => void;
  pdfWeekLabel?: string;
}) {
  if (scores.length === 0) {
    return <div className="card p-10 text-center text-gray-400">No scores yet</div>;
  }

  return (
    <div className="space-y-3">
      {scores.map((score, index) => {
        const selected = selectedUser === score.uid;
        const counts = countsForUser(score.uid);
        const visibleTasks = userTasks(score.uid);
        const mis = score.mis as MisPersonView | null | undefined;

        return (
          <div key={score.uid} className={cn('card border', getScoreBg(score.monthlyScore))}>
            <button
              type="button"
              onClick={() => onSelectUser(score.uid)}
              className="flex w-full items-center gap-4 p-4 text-left"
            >
              <div className="w-8 text-center">
                {index < 3 ? <Trophy size={20} className={cn('mx-auto', index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : 'text-orange-400')} /> : <span className="text-sm font-bold text-gray-400">#{index + 1}</span>}
              </div>

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-700">
                {score.name.slice(0, 2).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{score.name}</p>
                <p className="text-xs text-gray-500">{score.department}</p>
              </div>

              <div className="hidden items-center gap-5 text-sm md:flex">
                <Stat icon={TrendingUp} label="Assigned" value={score.tasksAssigned} color="text-gray-600" />
                <Stat icon={CheckCircle2} label="Completed" value={score.tasksCompleted} color="text-green-600" />
                <Stat icon={Clock} label="On Time" value={score.onTimeCount} color="text-blue-600" />
                <Stat icon={AlertTriangle} label="Late" value={score.lateCount} color="text-red-500" />
              </div>

              <div className="shrink-0 text-right">
                <p className={cn('text-2xl font-bold', getScoreColor(score.monthlyScore))}>{score.monthlyScore}%</p>
                <p className="text-[11px] text-gray-400">Portal MIS</p>
                <p className={cn('mt-1 text-sm font-semibold', getGapColor(score.pdfGapPercent))}>
                  {score.pdfGapLabel ?? '—'}
                </p>
                <p className="text-[11px] text-gray-400">PDF MIS</p>
              </div>
            </button>

            <div className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full bg-white/60">
              <div
                className={cn('h-full rounded-full transition-all', getScoreColor(score.monthlyScore).replace('text-', 'bg-'))}
                style={{ width: `${score.monthlyScore}%` }}
              />
            </div>

            {selected && (
              <div className="space-y-4 border-t border-white/70 bg-white/70 px-4 py-3">
                <MisDashboard
                  score={score}
                  mis={mis ?? null}
                  weekLabel={pdfWeekLabel}
                  onDownload={() => {
                    if (!mis) return;
                    downloadMisPdf(mis, score.monthlyScore ?? 0);
                  }}
                />

                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">One Time tasks</p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {[
                      { label: 'All', value: 'all' as TaskFilter, count: counts.total },
                      { label: 'Pending', value: 'Pending Accept' as TaskFilter, count: counts.pending },
                      { label: 'Active', value: 'In Progress' as TaskFilter, count: counts.active },
                      { label: 'Done', value: 'Completed' as TaskFilter, count: counts.completed },
                      { label: 'Late', value: 'Overdue' as TaskFilter, count: counts.overdue },
                    ].map(item => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setFilter(item.value)}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                          filter === item.value ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50',
                        )}
                      >
                        {item.label} {item.count}
                      </button>
                    ))}
                  </div>

                  {visibleTasks.length === 0 && (
                    <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
                      No tasks in this category
                    </div>
                  )}

                  {visibleTasks.length > 0 && (
                    <div className="space-y-2">
                      {visibleTasks.map(task => (
                        <button
                          key={task.taskId}
                          type="button"
                          onClick={() => onOpenTask(task)}
                          className="flex w-full items-start gap-3 rounded-lg bg-white p-3 text-left ring-1 ring-gray-100 hover:bg-gray-50"
                        >
                          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full',
                            task.priority === 'High' ? 'bg-red-500' : task.priority === 'Medium' ? 'bg-yellow-500' : 'bg-green-500',
                          )} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-800">{task.description}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[10px] text-gray-400">{task.taskId}</span>
                              <span className={cn('badge text-[10px] py-0', STATUS_COLORS[task.status])}>{task.status}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MisReportMasterView({
  score,
  mis,
  weekLabel,
  onDownload,
}: {
  score: any;
  mis: MisPersonView | null;
  weekLabel?: string;
  onDownload: () => void;
}) {
  // Build Master layout from already-loaded week MIS (no second fetch → no size flash).
  const report = useMemo(() => {
    if (!mis) return null;
    const week = getMisWeekPeriod(mis.weekStart || undefined);
    const checklist = mis.checklist ?? emptyBucket();
    const delegation = mis.delegation ?? emptyBucket();
    const fms = mis.fms ?? emptyBucket();
    const total = {
      planned: mis.planned ?? (checklist.planned + delegation.planned + fms.planned),
      done: mis.done ?? (checklist.done + delegation.done + fms.done),
      onTime: mis.onTime ?? (checklist.onTime + delegation.onTime + fms.onTime),
    };
    const gapOf = (done: number, planned: number) =>
      planned > 0 ? Math.round(((done / planned) * 100 - 100) * 100) / 100 : null;
    const gapPercent = mis.gapPercent;
    const onTimeGapPercent = mis.onTimeGapPercent;
    const parameters = (mis.parameters?.length
      ? mis.parameters
      : [
        { id: 'office', label: 'Office Daily', section: 'Checklist', group: 'checklist' as const, planned: 0, done: 0, onTime: 0, gapPercent: null },
        { id: 'salon', label: 'Salon Daily', section: 'Checklist', group: 'checklist' as const, planned: 0, done: 0, onTime: 0, gapPercent: null },
        { id: 'weekly', label: 'Weekly & Monthly', section: 'Checklist', group: 'checklist' as const, planned: 0, done: 0, onTime: 0, gapPercent: null },
        { id: 'delegation', label: 'Delegation', section: 'Delegation', group: 'delegation' as const, ...delegation, gapPercent: gapOf(delegation.done, delegation.planned) },
        { id: 'fms', label: 'FMS Total', section: 'FMS', group: 'fms' as const, ...fms, gapPercent: gapOf(fms.done, fms.planned) },
      ]);

    return {
      name: mis.name || score?.name || '',
      department: mis.department || score?.department || '',
      weekStart: mis.weekStart || week.weekStart,
      weekEnd: mis.weekEnd || week.weekEnd,
      weekStartLabel: formatDmy(mis.weekStart || week.weekStart),
      weekEndLabel: formatDmy(mis.weekEnd || week.weekEnd),
      weekNumber: week.weekNumber,
      weekLabel: weekLabel || formatWeekLabel(mis.weekStart || week.weekStart, mis.weekEnd || week.weekEnd),
      gapPercent,
      gapLabel: mis.gapLabel || '—',
      onTimeGapPercent,
      lastWeekPlannedPercent: '',
      nextWeekPlannedPercent: '',
      total,
      parameters,
      rollups: [
        {
          label: 'Overall',
          kra: 'All work should be done',
          kpi: '% Work Not Done',
          planned: total.planned,
          done: total.done,
          onTime: total.onTime,
          gapPercent,
          onTimeGapPercent,
        },
        {
          label: 'Overall (On-Time)',
          kra: 'All work should be done On-Time',
          kpi: '% Work Not Done On-Time',
          planned: total.planned,
          done: total.onTime,
          onTime: total.onTime,
          gapPercent: onTimeGapPercent,
          onTimeGapPercent,
        },
        {
          label: 'Checklist Total Task',
          kra: 'Checklist',
          kpi: '% Work Not Done',
          planned: checklist.planned,
          done: checklist.done,
          onTime: checklist.onTime,
          gapPercent: gapOf(checklist.done, checklist.planned),
          onTimeGapPercent: gapOf(checklist.onTime, checklist.planned),
        },
        {
          label: 'Delegation Total Task',
          kra: 'Delegation',
          kpi: '% Work Not Done',
          planned: delegation.planned,
          done: delegation.done,
          onTime: delegation.onTime,
          gapPercent: gapOf(delegation.done, delegation.planned),
          onTimeGapPercent: gapOf(delegation.onTime, delegation.planned),
        },
        {
          label: 'FMS Total Task',
          kra: 'FMS',
          kpi: '% Work Not Done',
          planned: fms.planned,
          done: fms.done,
          onTime: fms.onTime,
          gapPercent: gapOf(fms.done, fms.planned),
          onTimeGapPercent: gapOf(fms.onTime, fms.planned),
        },
      ],
    };
  }, [mis, score?.name, score?.department, weekLabel]);

  const overall = report?.rollups[0];
  const onTimeRow = report?.rollups[1];
  const sectionRollups = report?.rollups.slice(2) ?? [];
  const misScoreText = report?.gapLabel && report.gapLabel !== '—' ? report.gapLabel : '';
  const parameters = report?.parameters ?? [];

  function downloadMasterPdf() {
    if (!report || !overall || !onTimeRow) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(score.name)} MIS Report</title>
<style>
body{font-family:Arial,sans-serif;padding:16px;color:#111}
.mis{color:#dc2626;font-size:22px;font-weight:700;margin:8px 0 16px}
table{border-collapse:collapse;width:100%;font-size:11px}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
th{background:#f5f5f5}
.score{color:#dc2626;font-weight:700}
</style></head><body>
<table>
<tr>
  <td colspan="3"><b>MIS Report</b></td>
  <td>Week Start Date</td><td>Week End Date</td><td>Week No</td>
  <td colspan="2"><b>MIS Score</b></td>
</tr>
<tr>
  <td colspan="3"></td>
  <td>${escapeHtml(report.weekStartLabel)}</td>
  <td>${escapeHtml(report.weekEndLabel)}</td>
  <td>${report.weekNumber || ''}</td>
  <td colspan="2" class="score">${escapeHtml(misScoreText)}</td>
</tr>
<tr>
  <th>Person Name</th><th>KRA</th><th>KPI</th>
  <th>Last Week Planned Percentage</th>
  <th>Current Week Planned No Of Works</th>
  <th>Current Week Acutal No of Works</th>
  <th>Current Week MIS Score</th>
  <th>Next Week Planned Percentage</th>
</tr>
<tr>
  <td>${escapeHtml(report.name)}</td>
  <td>${escapeHtml(overall.kra)}</td>
  <td>${escapeHtml(overall.kpi)}</td>
  <td>${escapeHtml(report.lastWeekPlannedPercent || '')}</td>
  <td>${overall.planned}</td>
  <td>${overall.done}</td>
  <td class="score">${overall.gapPercent == null ? '' : `${overall.gapPercent.toFixed(2)}%`}</td>
  <td>${escapeHtml(report.nextWeekPlannedPercent || '')}</td>
</tr>
<tr>
  <td></td>
  <td>${escapeHtml(onTimeRow.kra)}</td>
  <td>${escapeHtml(onTimeRow.kpi)}</td>
  <td></td>
  <td>${onTimeRow.planned}</td>
  <td>${onTimeRow.done}</td>
  <td class="score">${onTimeRow.gapPercent == null ? '' : `${onTimeRow.gapPercent.toFixed(2)}%`}</td>
  <td></td>
</tr>
${sectionRollups.map(row => `<tr>
  <td>${escapeHtml(row.label)}</td>
  <td>${escapeHtml(row.kra)}</td>
  <td>${escapeHtml(row.kpi)}</td>
  <td></td>
  <td>${row.planned}</td>
  <td>${row.done}</td>
  <td class="score">${row.gapPercent == null ? '' : `${row.gapPercent.toFixed(2)}%`}</td>
  <td></td>
</tr>`).join('')}
</table>
${parameters.length ? `<h3 style="margin-top:20px">Parameters</h3>
<table>
<tr><th>Parameter</th><th>Section</th><th>Planned</th><th>Actual Done</th><th>On-Time</th><th>Gap %</th></tr>
${parameters.map(p => `<tr>
  <td>${escapeHtml(p.label)}</td>
  <td>${escapeHtml(p.section)}</td>
  <td>${p.planned}</td>
  <td>${p.done}</td>
  <td>${p.onTime}</td>
  <td class="score">${p.gapPercent == null ? '' : `${p.gapPercent.toFixed(2)}%`}</td>
</tr>`).join('')}
</table>` : ''}
<script>window.onload=function(){window.print();}</script>
</body></html>`;
    const win = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=800');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <div className="min-h-[280px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-gray-400">MIS Report</p>
          {weekLabel && (
            <p className="mt-1 text-sm text-gray-500">{weekLabel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={report ? downloadMasterPdf : onDownload}
          disabled={!report && !mis}
          className="btn-primary inline-flex items-center gap-2 px-5 py-3 text-base disabled:opacity-50"
        >
          <Download size={18} />
          Download PDF
        </button>
      </div>

      {report && overall && onTimeRow ? (
        <div className="space-y-4">
          <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full border-collapse text-left text-sm sm:text-base">
              <tbody>
                <tr className="bg-gray-50 font-semibold text-gray-800">
                  <td className="border border-gray-200 px-3 py-3 text-base sm:text-lg" colSpan={3}>MIS Report</td>
                  <td className="border border-gray-200 px-3 py-3">Week Start Date</td>
                  <td className="border border-gray-200 px-3 py-3">Week End Date</td>
                  <td className="border border-gray-200 px-3 py-3">Week No</td>
                  <td className="border border-gray-200 px-3 py-3 text-center" colSpan={2}>MIS Score</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-3" colSpan={3} />
                  <td className="border border-gray-200 px-3 py-3 font-medium text-gray-900">{report.weekStartLabel}</td>
                  <td className="border border-gray-200 px-3 py-3 font-medium text-gray-900">{report.weekEndLabel}</td>
                  <td className="border border-gray-200 px-3 py-3 font-medium text-gray-900">{report.weekNumber || ''}</td>
                  <td
                    className="border border-gray-200 px-3 py-4 text-center text-2xl font-bold text-red-600 sm:text-3xl"
                    colSpan={2}
                  >
                    {misScoreText || '—'}
                  </td>
                </tr>
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="border border-gray-200 px-3 py-3">Person Name</td>
                  <td className="border border-gray-200 px-3 py-3">KRA</td>
                  <td className="border border-gray-200 px-3 py-3">KPI</td>
                  <td className="border border-gray-200 px-3 py-3">Last Week Planned Percentage</td>
                  <td className="border border-gray-200 px-3 py-3">Current Week Planned No Of Works</td>
                  <td className="border border-gray-200 px-3 py-3">Current Week Acutal No of Works</td>
                  <td className="border border-gray-200 px-3 py-3">Current Week MIS Score</td>
                  <td className="border border-gray-200 px-3 py-3">Next Week Planned Percentage</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-3 text-base font-semibold text-gray-900">{report.name}</td>
                  <td className="border border-gray-200 px-3 py-3 text-gray-800">{overall.kra}</td>
                  <td className="border border-gray-200 px-3 py-3 text-gray-800">{overall.kpi}</td>
                  <td className="border border-gray-200 px-3 py-3 text-gray-800">{report.lastWeekPlannedPercent || ''}</td>
                  <td className="border border-gray-200 px-3 py-3 text-base font-medium text-gray-900">{overall.planned}</td>
                  <td className="border border-gray-200 px-3 py-3 text-base font-medium text-gray-900">{overall.done}</td>
                  <td className="border border-gray-200 px-3 py-3 text-center text-lg font-bold text-red-600 sm:text-xl">
                    {overall.gapPercent == null ? '' : `${overall.gapPercent.toFixed(2)}%`}
                  </td>
                  <td className="border border-gray-200 px-3 py-3 text-gray-800">{report.nextWeekPlannedPercent || ''}</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-3" />
                  <td className="border border-gray-200 px-3 py-3 text-gray-800">{onTimeRow.kra}</td>
                  <td className="border border-gray-200 px-3 py-3 text-gray-800">{onTimeRow.kpi}</td>
                  <td className="border border-gray-200 px-3 py-3" />
                  <td className="border border-gray-200 px-3 py-3 text-base font-medium text-gray-900">{onTimeRow.planned}</td>
                  <td className="border border-gray-200 px-3 py-3 text-base font-medium text-gray-900">{onTimeRow.done}</td>
                  <td className="border border-gray-200 px-3 py-3 text-center text-lg font-bold text-red-600 sm:text-xl">
                    {onTimeRow.gapPercent == null ? '' : `${onTimeRow.gapPercent.toFixed(2)}%`}
                  </td>
                  <td className="border border-gray-200 px-3 py-3" />
                </tr>
                {sectionRollups.map(row => (
                  <tr key={row.label}>
                    <td className="border border-gray-200 px-3 py-3 text-gray-500">{row.label}</td>
                    <td className="border border-gray-200 px-3 py-3 text-gray-800">{row.kra}</td>
                    <td className="border border-gray-200 px-3 py-3 text-gray-800">{row.kpi}</td>
                    <td className="border border-gray-200 px-3 py-3" />
                    <td className="border border-gray-200 px-3 py-3 font-medium text-gray-900">{row.planned}</td>
                    <td className="border border-gray-200 px-3 py-3 font-medium text-gray-900">{row.done}</td>
                    <td className={cn('border border-gray-200 px-3 py-3 text-center font-semibold', getGapColor(row.gapPercent))}>
                      {row.gapPercent == null ? '—' : `${row.gapPercent.toFixed(2)}%`}
                    </td>
                    <td className="border border-gray-200 px-3 py-3" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <th className="border border-gray-200 px-3 py-2.5 font-semibold">Parameter</th>
                  <th className="border border-gray-200 px-3 py-2.5 font-semibold">Section</th>
                  <th className="border border-gray-200 px-3 py-2.5 font-semibold">Planned</th>
                  <th className="border border-gray-200 px-3 py-2.5 font-semibold">Actual Done</th>
                  <th className="border border-gray-200 px-3 py-2.5 font-semibold">On-Time</th>
                  <th className="border border-gray-200 px-3 py-2.5 font-semibold">Gap %</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map(param => (
                  <tr key={param.id}>
                    <td className="border border-gray-200 px-3 py-2.5 font-medium text-gray-900">{param.label}</td>
                    <td className="border border-gray-200 px-3 py-2.5 text-gray-500">{param.section}</td>
                    <td className="border border-gray-200 px-3 py-2.5 text-gray-800">{param.planned}</td>
                    <td className="border border-gray-200 px-3 py-2.5 text-gray-800">{param.done}</td>
                    <td className="border border-gray-200 px-3 py-2.5 text-gray-800">{param.onTime}</td>
                    <td className={cn('border border-gray-200 px-3 py-2.5 font-semibold', getGapColor(param.gapPercent))}>
                      {param.gapPercent == null ? '—' : `${param.gapPercent.toFixed(2)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <SimplifiedMisBuckets score={score} mis={mis} />
      )}
    </div>
  );
}

function SimplifiedMisBuckets({ score, mis }: { score: any; mis: MisPersonView | null }) {
  const buckets = [
    { label: 'Checklist', hint: 'Timely Master (daily / weekly / monthly)', bucket: mis?.checklist ?? emptyBucket() },
    { label: 'Delegation', hint: 'Cloudflare One Time (Delegation Scoring formula)', bucket: mis?.delegation ?? emptyBucket() },
    { label: 'FMS', hint: 'MIS Report FMS sheet tabs', bucket: mis?.fms ?? emptyBucket() },
  ];

  function gapFor(bucket: MisBucketView) {
    if (!bucket.planned) return null;
    return Math.round(((bucket.done / bucket.planned) * 100 - 100) * 100) / 100;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
        <p className="text-xs font-semibold text-gray-700">Simplified buckets (fallback)</p>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="bg-white text-[11px] uppercase tracking-wide text-gray-400">
          <tr>
            <th className="px-4 py-2.5 font-medium">Bucket</th>
            <th className="px-4 py-2.5 font-medium">Planned</th>
            <th className="px-4 py-2.5 font-medium">Actual done</th>
            <th className="px-4 py-2.5 font-medium">On time</th>
            <th className="px-4 py-2.5 font-medium">Gap %</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map(row => {
            const gap = gapFor(row.bucket);
            return (
              <tr key={row.label} className="border-t border-gray-100">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{row.label}</p>
                  <p className="text-[11px] text-gray-400">{row.hint}</p>
                </td>
                <td className="px-4 py-3 text-gray-800">{row.bucket.planned}</td>
                <td className="px-4 py-3 text-gray-800">{row.bucket.done}</td>
                <td className="px-4 py-3 text-gray-800">{row.bucket.onTime}</td>
                <td className={cn('px-4 py-3 font-semibold', getGapColor(gap))}>
                  {gap == null ? '—' : `${gap.toFixed(2)}%`}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-gray-200 bg-slate-50 font-semibold">
            <td className="px-4 py-3">Total</td>
            <td className="px-4 py-3">{mis?.planned ?? 0}</td>
            <td className="px-4 py-3">{mis?.done ?? 0}</td>
            <td className="px-4 py-3">{mis?.onTime ?? 0}</td>
            <td className={cn('px-4 py-3 text-red-600', getGapColor(mis?.gapPercent ?? null))}>{mis?.gapLabel ?? '—'}</td>
          </tr>
          <tr className="border-t border-gray-100">
            <td className="px-4 py-3 text-gray-500" colSpan={4}>Portal MIS (on-time / assigned)</td>
            <td className={cn('px-4 py-3 font-semibold', getScoreColor(score.monthlyScore ?? 0))}>{score.monthlyScore ?? 0}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MisDashboard(props: {
  score: any;
  mis: MisPersonView | null;
  weekLabel?: string;
  onDownload: () => void;
}) {
  return <MisReportMasterView {...props} />;
}

function Stat({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: number; color: string;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center gap-1">
        <Icon size={13} className={color} />
        <span className="font-semibold text-gray-700">{value}</span>
      </div>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-blue-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getGapColor(gap: number | null | undefined): string {
  if (gap === null || gap === undefined || Number.isNaN(gap)) return 'text-gray-400';
  if (gap >= -5) return 'text-green-600';
  if (gap >= -20) return 'text-blue-600';
  if (gap >= -50) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreBg(score: number): string {
  if (score >= 90) return 'bg-green-50 border-green-200';
  if (score >= 70) return 'bg-blue-50 border-blue-200';
  if (score >= 50) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}
