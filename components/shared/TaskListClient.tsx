'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock3, Search } from 'lucide-react';
import { cn, formatDate, STATUS_COLORS, PRIORITY_DOT, getDueBadge } from '@/lib/utils';
import TaskModal from './TaskModal';
import type { TaskSerialized } from '@/types';

interface Props {
  tasks: TaskSerialized[];
  role: 'admin' | 'user';
  currentUid: string;
  users?: { uid: string; name: string; department: string; role?: string; isActive?: boolean }[];
}

const STATUS_OPTIONS = ['all', 'Pending Accept', 'In Progress', 'Delay Requested', 'Overdue', 'Completed', 'Verified'];
const CATEGORY_OPTIONS = ['all', 'Daily', 'Weekly', 'Monthly', 'One Time'];
const CATEGORY_LABELS = {
  Daily: 'Daily Task',
  Weekly: 'Weekly Task',
  Monthly: 'Monthly Task',
  'One Time': 'One Time Task',
} as const;
const RECURRING_CATEGORIES = new Set(['Daily', 'Weekly', 'Monthly']);
const ACTIVE_STATUSES = new Set(['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue']);
const NEW_ASSIGNMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function getTimeAgo(iso: string) {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TaskListClient({ tasks, role, currentUid, users = [] }: Props) {
  const [taskItems, setTaskItems] = useState(tasks);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('all');
  const [priorityFilter, setPriority] = useState('all');
  const [departmentFilter, setDepartment] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [categoryFilter, setCategory] = useState('all');
  const [selectedTask, setSelected] = useState<TaskSerialized | null>(null);

  useEffect(() => {
    setTaskItems(tasks);
  }, [tasks]);

  function updateTask(updated?: TaskSerialized) {
    if (!updated) {
      setSelected(null);
      return;
    }

    setTaskItems(current => current.map(task => task.taskId === updated.taskId ? updated : task));
    setSelected(updated);
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

  const filtered = useMemo(() => {
    return taskItems.filter(t => {
      const matchSearch   = !search || t.description.toLowerCase().includes(search.toLowerCase()) || t.taskId.toLowerCase().includes(search.toLowerCase());
      const matchStatus   = statusFilter === 'all' || t.status === statusFilter;
      const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
      const matchDepartment = departmentFilter === 'all' || t.department === departmentFilter;
      const matchUser = userFilter === 'all' || t.assignedTo === userFilter;
      const matchCategory = categoryFilter === 'all' || t.category === categoryFilter;
      return matchSearch && matchStatus && matchPriority && matchDepartment && matchUser && matchCategory;
    });
  }, [taskItems, search, statusFilter, priorityFilter, departmentFilter, userFilter, categoryFilter]);

  const justAssignedTasks = useMemo(() =>
    taskItems
      .filter(task => ACTIVE_STATUSES.has(task.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4),
    [taskItems]
  );

  const selectedUser = users.find(user => user.uid === userFilter);
  const scopeLabel = selectedUser?.name ?? (departmentFilter === 'all' ? 'All tasks' : departmentFilter);
  const stats = {
    total: filtered.length,
    pending: filtered.filter(task => task.status === 'Pending Accept').length,
    active: filtered.filter(task => ['In Progress', 'Delay Requested', 'Overdue'].includes(task.status)).length,
    done: filtered.filter(task => ['Completed', 'Verified'].includes(task.status)).length,
  };

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
        <section className="surface-enter mb-5">
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
                      <span className={cn('badge text-[10px]', isFresh ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500')}>
                        {isFresh ? 'New' : getTimeAgo(task.createdAt)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-gray-900">{task.description}</p>
                    <p className="mt-2 truncate text-xs text-gray-400">{task.assignedToName} - {task.department || 'No department'}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock3 size={13} />
                      <span>{formatDate(task.endDate)}</span>
                    </div>
                    <ArrowRight size={15} className="text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </div>
                </button>
              );
            })}
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
            { label: 'Active', value: stats.active, color: 'text-blue-700' },
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
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-8 py-2 text-sm"
          />
        </div>

        <select
          value={departmentFilter}
          onChange={e => { setDepartment(e.target.value); setUserFilter('all'); }}
          className="input py-2 text-sm w-auto"
        >
          <option value="all">All Departments</option>
          {departments.map(department => <option key={department} value={department}>{department}</option>)}
        </select>

        <select
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
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

        <div className="flex items-center text-xs text-gray-400">
          {filtered.length} of {taskItems.length}
        </div>
      </div>

      {/* Table */}
      <div className="card surface-enter overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Task ID', 'Description', 'Assignee', 'Priority', 'Status', 'Due Date', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    No tasks found
                  </td>
                </tr>
              )}
              {filtered.map(task => {
                const due = getDueBadge(task.endDate);
                return (
                  <tr
                    key={task.taskId}
                    className="cursor-pointer border-b border-gray-50 transition-all duration-150 hover:bg-gray-50"
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
                      <span className={cn('badge', due.color)}>{due.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {role === 'user' && RECURRING_CATEGORIES.has(task.category) && (
                          <Link
                            href={`/portal/checklist?category=${encodeURIComponent(task.category)}`}
                            onClick={e => e.stopPropagation()}
                            className="text-xs font-medium text-green-600 hover:underline"
                          >
                            Checklist
                          </Link>
                        )}
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
        />
      )}
    </>
  );
}
