'use client';

import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, ArrowRight, Clock3, Loader2, Search } from 'lucide-react';
import { cn, formatDate, STATUS_COLORS, PRIORITY_DOT, getDueBadge, normalizeBaseStatus } from '@/lib/utils';
import { indiaDateKey, indiaDayOffset, indiaTodayKey } from '@/lib/utils/indiaDate';
import { scheduleByTaskId, scheduleTasks } from '@/lib/utils/scheduling';
import { namesEqual } from '@/lib/utils/names';
import TaskModal from './TaskModal';
import type { TaskSerialized } from '@/types';

interface Props {
  tasks: TaskSerialized[];
  role: 'admin' | 'user';
  currentUid: string;
  currentUserName?: string;
  users?: { uid: string; name: string; department: string; role?: string; isActive?: boolean }[];
  initialCounts?: {
    total: number;
    pending: number;
    inProgress: number;
    delayRequested: number;
    overdue: number;
    completed: number;
    verified: number;
    dead: number;
  };
  totalCount?: number;
}

const STATUS_OPTIONS = ['all', 'Pending Accept', 'In Progress', 'Delay Requested', 'Overdue', 'Dead', 'Completed', 'Verified'];
const CATEGORY_OPTIONS = ['all', 'Daily', 'Weekly', 'Monthly', 'One Time'];
const CATEGORY_LABELS: Record<string, string> = {
  Daily: 'Daily Task',
  Weekly: 'Weekly Task',
  Monthly: 'Monthly Task',
  'One Time': 'One Time Task',
  Delegation: 'One Time Task',
  'one-time': 'One Time Task',
};
const RECURRING_CATEGORIES = new Set(['Daily', 'Weekly', 'Monthly']);
const ACTIVE_STATUSES = new Set(['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue', 'Dead']);
const NEW_ASSIGNMENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const RISK_STYLES = {
  blocked: 'bg-red-600 text-white',
  overdue: 'bg-red-100 text-red-700',
  'at-risk': 'bg-orange-100 text-orange-700',
  tight: 'bg-yellow-100 text-yellow-700',
  'on-track': 'bg-green-100 text-green-700',
  unscheduled: 'bg-gray-100 text-gray-600',
} as const;
const RISK_LABELS = {
  blocked: 'Dead',
  overdue: 'Overdue',
  'at-risk': 'At risk',
  tight: 'Tight',
  'on-track': 'On track',
  unscheduled: 'No dates',
} as const;

function parseTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getTimeAgo(iso: string) {
  const diffMs = Math.max(0, Date.now() - parseTime(iso));
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TaskListClient({ tasks, role, currentUid, currentUserName, users = [], initialCounts, totalCount }: Props) {
  const [taskItems, setTaskItems] = useState(tasks);
  const [mineOnly, setMineOnly]     = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('all');
  const [priorityFilter, setPriority] = useState('all');
  const [departmentFilter, setDepartment] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [categoryFilter, setCategory] = useState('all');
  const [sortMode, setSortMode] = useState<'recommended' | 'newest'>('recommended');
  const [selectedTask, setSelected] = useState<TaskSerialized | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isSearchingServer, setIsSearchingServer] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTaskItems(tasks);
  }, [tasks]);

  // Debounced server search for any tasks outside the initially loaded batch
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 2) return;

    const timer = setTimeout(async () => {
      try {
        setIsSearchingServer(true);
        const deptParam = departmentFilter !== 'all' ? `&department=${encodeURIComponent(departmentFilter)}` : '';
        const res = await fetch(`/api/tasks?search=${encodeURIComponent(trimmed)}${deptParam}&limit=100`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setTaskItems(current => {
            const existingMap = new Map(current.map(t => [t.taskId, t]));
            let changed = false;
            for (const item of json.data) {
              if (!existingMap.has(item.taskId)) {
                existingMap.set(item.taskId, item);
                changed = true;
              }
            }
            return changed ? Array.from(existingMap.values()) : current;
          });
        }
      } catch (err) {
        console.error('Server task search failed:', err);
      } finally {
        setIsSearchingServer(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [search, departmentFilter]);

  function updateTask(updated?: TaskSerialized) {
    if (!updated) {
      setSelected(null);
      return;
    }

    setTaskItems(current => {
      const exists = current.some(task => task.taskId === updated.taskId);
      if (exists) {
        return current.map(task => task.taskId === updated.taskId ? updated : task);
      }
      return [updated, ...current];
    });
    setSelected(updated);
  }

  function removeTask(taskId: string) {
    setTaskItems(current => current.filter(task => task.taskId !== taskId));
    setSelected(null);
  }

  const departments = useMemo(() =>
    Array.from(new Set([
      ...users.map(user => user.department).filter(Boolean),
      ...taskItems.map(task => task.department).filter(Boolean),
    ])).sort((a, b) => a.localeCompare(b)),
    [taskItems, users]
  );

  const visibleUsers = useMemo(() =>
    users
      .filter(user => departmentFilter === 'all' || user.department === departmentFilter)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [departmentFilter, users]
  );

  const scheduleMap = useMemo(() => scheduleByTaskId(taskItems), [taskItems]);
  const recommendedQueue = useMemo(() => scheduleTasks(taskItems).slice(0, 5), [taskItems]);

  const filtered = useMemo(() => {
    const today = indiaTodayKey();
    const rows = taskItems.filter(t => {
      const isOverdueTask = t.status === 'Overdue' || (Boolean(t.endDate) && indiaDayOffset(today, indiaDateKey(t.endDate!)) < 0 && ['Pending Accept', 'In Progress', 'Delay Requested'].includes(t.status));
      const matchMine     = !mineOnly || t.assignedTo === currentUid || (Boolean(currentUserName) && namesEqual(t.assignedToName, currentUserName));
      const matchSearch   = !search || t.description.toLowerCase().includes(search.toLowerCase()) || t.taskId.toLowerCase().includes(search.toLowerCase());
      const matchStatus   = statusFilter === 'all' || (statusFilter === 'Overdue' ? isOverdueTask : (t.status === statusFilter || normalizeBaseStatus(t.status) === statusFilter));
      const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
      const matchDepartment = departmentFilter === 'all' || t.department === departmentFilter;
      const matchUser = userFilter === 'all' || t.assignedTo === userFilter;
      const matchCategory = categoryFilter === 'all' || t.category === categoryFilter;
      return matchMine && matchSearch && matchStatus && matchPriority && matchDepartment && matchUser && matchCategory;
    });

    if (sortMode === 'recommended') {
      return [...rows].sort((left, right) => {
        const leftSchedule = scheduleMap.get(left.taskId);
        const rightSchedule = scheduleMap.get(right.taskId);
        if (leftSchedule && rightSchedule) {
          if (leftSchedule.rank !== rightSchedule.rank) return leftSchedule.rank - rightSchedule.rank;
          return left.taskId.localeCompare(right.taskId);
        }
        if (leftSchedule) return -1;
        if (rightSchedule) return 1;
        const diff = parseTime(right.createdAt) - parseTime(left.createdAt);
        if (diff !== 0) return diff;
        return left.taskId.localeCompare(right.taskId);
      });
    }

    return [...rows].sort((left, right) => {
      const diff = parseTime(right.createdAt) - parseTime(left.createdAt);
      if (diff !== 0) return diff;
      return left.taskId.localeCompare(right.taskId);
    });
  }, [taskItems, mineOnly, currentUid, currentUserName, search, statusFilter, priorityFilter, departmentFilter, userFilter, categoryFilter, sortMode, scheduleMap]);

  const justAssignedTasks = useMemo(() =>
    [...taskItems]
      .filter(task => ACTIVE_STATUSES.has(task.status))
      .sort((a, b) => (parseTime(b.createdAt) - parseTime(a.createdAt)) || a.taskId.localeCompare(b.taskId))
      .slice(0, 4),
    [taskItems]
  );

  const selectedUser = users.find(user => user.uid === userFilter);
  const scopeLabel = mineOnly
    ? 'My Tasks'
    : (selectedUser?.name ?? (departmentFilter === 'all' ? 'All tasks' : departmentFilter));

  const isDefaultView = !mineOnly && statusFilter === 'all' && priorityFilter === 'all' && departmentFilter === 'all' && userFilter === 'all' && categoryFilter === 'all' && !search.trim();

  const stats = useMemo(() => {
    if (isDefaultView && initialCounts) {
      return {
        total: totalCount ?? initialCounts.total,
        pending: initialCounts.pending,
        active: initialCounts.inProgress + initialCounts.delayRequested + initialCounts.overdue,
        done: initialCounts.completed + initialCounts.verified,
      };
    }
    return {
      total: filtered.length,
      pending: filtered.filter(task => task.status === 'Pending Accept').length,
      active: filtered.filter(task => ['In Progress', 'Delay Requested', 'Overdue'].includes(task.status)).length,
      done: filtered.filter(task => ['Completed', 'Verified'].includes(task.status)).length,
    };
  }, [isDefaultView, initialCounts, totalCount, filtered]);

  const openTask = (task: TaskSerialized) => {
    if (role === 'user' && RECURRING_CATEGORIES.has(task.category)) {
      window.location.href = `/portal/checklist?category=${encodeURIComponent(task.category)}`;
      return;
    }

    setSelected(task);
  };

  return (
    <>
      {justAssignedTasks.length > 0 && (
        <section suppressHydrationWarning className="surface-enter mb-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Just assigned</p>
              <h2 className="text-base font-semibold text-gray-900">
                {role === 'user' ? 'Newest tasks for you' : 'Newest active assignments'}
              </h2>
            </div>
            <span className="hidden rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500 shadow-card sm:inline-flex">
              {justAssignedTasks.length} latest
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {justAssignedTasks.map(task => {
              const createdAtMs = new Date(task.createdAt).getTime();
              const isFresh = Date.now() - createdAtMs <= NEW_ASSIGNMENT_WINDOW_MS;
              return (
                <button
                  key={task.taskId}
                  type="button"
                  onClick={() => openTask(task)}
                  className="card group flex min-h-[150px] flex-col justify-between p-4 text-left hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-brand-600">{task.taskId}</span>
                      <span suppressHydrationWarning className={cn('badge text-[10px]', isFresh ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500')}>
                        {isFresh ? 'New' : getTimeAgo(task.createdAt)}
                      </span>
                    </div>
                    <p suppressHydrationWarning className="line-clamp-2 text-sm font-semibold leading-5 text-gray-900">{task.description}</p>
                    <p suppressHydrationWarning className="mt-2 truncate text-xs text-gray-400">{task.assignedToName} - {task.department || 'No department'}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock3 size={13} />
                      <span suppressHydrationWarning>{formatDate(task.endDate)}</span>
                    </div>
                    <ArrowRight size={15} className="text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {recommendedQueue.length > 0 && (
        <section suppressHydrationWarning className="surface-enter mb-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Recommended order</p>
              <h2 className="text-base font-semibold text-gray-900">Dynamic task schedule</h2>
            </div>
            <span className="hidden rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500 shadow-card sm:inline-flex">
              Priority + deadline
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {recommendedQueue.map(item => (
              <button
                key={item.task.taskId}
                type="button"
                onClick={() => openTask(item.task)}
                className={cn(
                  'card flex min-h-[150px] flex-col justify-between p-4 text-left hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-brand-500',
                  item.risk === 'blocked' && 'border-red-200 bg-red-50',
                  item.risk === 'at-risk' && 'border-orange-200 bg-orange-50',
                )}
              >
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-semibold text-white">#{item.rank}</span>
                    <span suppressHydrationWarning className={cn('badge text-[10px]', RISK_STYLES[item.risk])}>{RISK_LABELS[item.risk]}</span>
                  </div>
                  <p suppressHydrationWarning className="line-clamp-2 text-sm font-semibold leading-5 text-gray-900">{item.task.description}</p>
                  <p suppressHydrationWarning className="mt-2 truncate text-xs text-gray-400">{item.task.assignedToName} - {item.task.priority}</p>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500">
                  <span suppressHydrationWarning>{item.daysLeft === null ? 'Date pending' : item.daysLeft < 0 ? `${Math.abs(item.daysLeft)}d late` : `${item.daysLeft}d left`}</span>
                  {item.conflict && (
                    <span className="inline-flex items-center gap-1 text-orange-600">
                      <AlertTriangle size={12} /> Conflict
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {role === 'admin' && (
        <div className="surface-enter mb-4 grid gap-3 md:grid-cols-5">
          <div className="card border-0 bg-gray-50 p-4 md:col-span-2">
            <p className="text-xs font-medium text-gray-400">Viewing</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{scopeLabel}</p>
            {selectedUser && <p className="text-xs text-gray-400">{selectedUser.department || 'No department'}</p>}
          </div>
          {[
            { label: 'Total', value: stats.total, color: 'text-gray-700' },
            { label: 'Pending', value: stats.pending, color: 'text-yellow-700' },
            { label: 'In Progress', value: stats.active, color: 'text-blue-700' },
            { label: 'Done', value: stats.done, color: 'text-green-700' },
          ].map(item => (
            <div key={item.label} className="card border-0 bg-white p-4">
              <p className={cn('text-xl font-bold', item.color)}>{item.value}</p>
              <p className="text-xs font-medium text-gray-400">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="surface-enter flex flex-wrap gap-3 mb-4">
        {role === 'admin' && (
          <button
            type="button"
            onClick={() => {
              setMineOnly(current => {
                const next = !current;
                if (next) {
                  setUserFilter('all');
                  setDepartment('all');
                }
                return next;
              });
            }}
            className={cn(
              'btn-secondary py-2 text-sm whitespace-nowrap',
              mineOnly && 'bg-brand-50 text-brand-700 border-brand-200'
            )}
          >
            {mineOnly ? 'Showing my tasks' : 'Show my tasks'}
          </button>
        )}

        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tasks (ID, name, description)…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-8 pr-8 py-2 text-sm"
          />
          {isSearchingServer && (
            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-brand-600" />
          )}
        </div>

        <select
          value={departmentFilter}
          onChange={e => { setDepartment(e.target.value); setUserFilter('all'); setMineOnly(false); }}
          className="input py-2 text-sm w-auto"
        >
          <option value="all">All Departments</option>
          {departments.map(department => <option key={department} value={department}>{department}</option>)}
        </select>

        <select
          value={userFilter}
          onChange={e => { setUserFilter(e.target.value); setMineOnly(false); }}
          className="input py-2 text-sm w-auto"
        >
          <option value="all">All Individuals</option>
          {visibleUsers.map(user => <option key={user.uid} value={user.uid}>{user.name}</option>)}
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          className="input py-2 text-sm w-auto"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={e => setCategory(e.target.value)}
          className="input py-2 text-sm w-auto"
        >
          {CATEGORY_OPTIONS.map(c => (
            <option key={c} value={c}>
              {c === 'all' ? 'All Categories' : CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS]}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={e => setPriority(e.target.value)}
          className="input py-2 text-sm w-auto"
        >
          <option value="all">All Priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <select
          value={sortMode}
          onChange={e => setSortMode(e.target.value as typeof sortMode)}
          className="input py-2 text-sm w-auto"
        >
          <option value="recommended">Recommended Order</option>
          <option value="newest">Newest First</option>
        </select>

        <div className="flex items-center text-xs text-gray-400">
          {filtered.length} {totalCount && isDefaultView && totalCount > taskItems.length ? `loaded of ${totalCount}` : `of ${taskItems.length}`}
        </div>
      </div>

      {/* Table */}
      <div className="card surface-enter overflow-hidden p-0 border border-gray-200 shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-240px)] min-h-[400px]">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm shadow-sm">
              <tr className="border-b border-gray-200">
                {['Task ID', 'Description', 'Assignee', 'Priority', 'Status', 'Schedule', 'Due Date', ''].map(h => (
                  <th key={h} className="sticky top-0 z-20 bg-gray-50/95 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                    No tasks found
                  </td>
                </tr>
              )}
              {filtered.map(task => {
                const due = getDueBadge(task.endDate, task.status);
                const scheduled = scheduleMap.get(task.taskId);
                return (
                  <tr
                    key={task.taskId}
                    className={cn(
                      'cursor-pointer border-b border-gray-50 transition-all duration-150 hover:bg-gray-50',
                      task.status === 'Dead' && 'bg-red-50 hover:bg-red-100',
                    )}
                    onClick={() => openTask(task)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-brand-600">{task.taskId}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[240px]">
                      <p className="truncate text-gray-800 font-medium">{task.description}</p>
                      <p className="text-xs text-gray-400">
                        {CATEGORY_LABELS[task.category]} - {task.department}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{task.assignedToName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('w-2 h-2 rounded-full', PRIORITY_DOT[task.priority])} />
                        <span className="text-gray-600 text-xs">{task.priority}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('badge', STATUS_COLORS[task.status])}>{task.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {['Completed', 'Verified'].includes(task.status) ? (
                        <span className={cn('badge text-[10px]', STATUS_COLORS[task.status])}>{task.status}</span>
                      ) : scheduled ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-semibold text-white">#{scheduled.rank}</span>
                          <span className={cn('badge text-[10px]', RISK_STYLES[scheduled.risk])}>
                            {scheduled.daysLeft !== null && scheduled.daysLeft < 0 ? `${Math.abs(scheduled.daysLeft)}d late` : RISK_LABELS[scheduled.risk]}
                          </span>
                          {scheduled.conflict && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                              <AlertTriangle size={11} /> Conflict
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className={cn('badge text-[10px]', STATUS_COLORS[task.status])}>{task.status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('badge', due.color)}>{due.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={e => { e.stopPropagation(); setSelected(task); }}
                          className="text-xs text-brand-600 hover:underline font-medium"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelected(null)}
          role={role}
          currentUid={currentUid}
          onUpdate={updateTask}
          onDelete={removeTask}
          users={users as any}
        />
      )}
    </>
  );
}
