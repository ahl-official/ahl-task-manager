'use client';

import { useState, useMemo } from 'react';
import { ArrowRight, Building2, Clock3, X } from 'lucide-react';
import { cn, formatDate, STATUS_COLORS } from '@/lib/utils';
import TaskModal from '@/components/shared/TaskModal';
import type { TaskSerialized } from '@/types';

type TaskFilter = 'all' | 'Pending Accept' | 'In Progress' | 'Completed' | 'Verified' | 'Overdue';
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

interface Props {
  users: any[];
  tasks: TaskSerialized[];
  scores: any[];
  departments: { id: string; name: string }[];
}

export default function AdminDashboardClient({ users, tasks, scores, departments: initialDepartments }: Props) {
  const [filter, setFilter]         = useState<TaskFilter>('all');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskSerialized | null>(null);
  const [deptFilter, setDeptFilter]  = useState<string>('all');

  const departments = useMemo(() => {
    const userDepartments = users.map((u: any) => u.department).filter(Boolean);
    const savedDepartments = initialDepartments.map(d => d.name).filter(Boolean);
    return ['all', ...Array.from(new Set([...savedDepartments, ...userDepartments])).sort((a, b) => a.localeCompare(b))];
  }, [initialDepartments, users]);

  const activeUsers = users.filter((u: any) => u.isActive);

  function getTasksForUser(uid: string) {
    let userTasks = tasks.filter(t => t.assignedTo === uid);
    if (filter !== 'all') userTasks = userTasks.filter(t => t.status === filter);
    return userTasks;
  }

  function getCounts(uid: string) {
    const ut = tasks.filter(t => t.assignedTo === uid);
    return {
      all:       ut.length,
      pending:   ut.filter(t => t.status === 'Pending Accept').length,
      inProgress:ut.filter(t => t.status === 'In Progress').length,
      completed: ut.filter(t => t.status === 'Completed').length,
      verified:  ut.filter(t => t.status === 'Verified').length,
      overdue:   ut.filter(t => t.status === 'Overdue').length,
    };
  }

  const scoreMap = useMemo(() =>
    Object.fromEntries(scores.map((s: any) => [s.uid, s])),
    [scores]
  );

  const departmentBlocks = departments
    .filter(department => department !== 'all')
    .filter(department => deptFilter === 'all' || department === deptFilter)
    .map(department => {
      const departmentUsers = activeUsers.filter((u: any) => u.department === department);
      const userIds = new Set(departmentUsers.map((u: any) => u.uid));
      const departmentTasks = tasks.filter(t => userIds.has(t.assignedTo));
      const visibleUsers = departmentUsers.filter((u: any) => filter === 'all' || getTasksForUser(u.uid).length > 0);

      return {
        name: department,
        users: visibleUsers,
        totalUsers: departmentUsers.length,
        counts: {
          total: departmentTasks.length,
          pending: departmentTasks.filter(t => t.status === 'Pending Accept').length,
          inProgress: departmentTasks.filter(t => t.status === 'In Progress').length,
          done: departmentTasks.filter(t => ['Completed', 'Verified'].includes(t.status)).length,
          overdue: departmentTasks.filter(t => t.status === 'Overdue').length,
        },
      };
    })
    .filter(block => filter === 'all' || block.counts.total > 0 || block.totalUsers > 0);

  const selectedDepartmentBlock = selectedDepartment
    ? departmentBlocks.find(block => block.name === selectedDepartment)
    : null;

  const overallStats = {
    total:     tasks.length,
    pending:   tasks.filter(t => t.status === 'Pending Accept').length,
    inProgress:tasks.filter(t => t.status === 'In Progress').length,
    overdue:   tasks.filter(t => t.status === 'Overdue').length,
    completed: tasks.filter(t => ['Completed', 'Verified'].includes(t.status)).length,
  };

  const justAssignedTasks = useMemo(() =>
    tasks
      .filter(task => ACTIVE_STATUSES.has(task.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6),
    [tasks]
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Delegation Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{activeUsers.length} active team members</p>
      </div>

      {/* Overall stats */}
      <div className="surface-enter grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total',       value: overallStats.total,      color: 'text-gray-700',   bg: 'bg-gray-50',   filter: 'all' as TaskFilter },
          { label: 'Pending',     value: overallStats.pending,    color: 'text-yellow-700', bg: 'bg-yellow-50', filter: 'Pending Accept' as TaskFilter },
          { label: 'In Progress', value: overallStats.inProgress, color: 'text-blue-700',   bg: 'bg-blue-50',   filter: 'In Progress' as TaskFilter },
          { label: 'Overdue',     value: overallStats.overdue,    color: 'text-red-700',    bg: 'bg-red-50',    filter: 'Overdue' as TaskFilter },
          { label: 'Done',        value: overallStats.completed,  color: 'text-green-700',  bg: 'bg-green-50',  filter: 'Completed' as TaskFilter },
        ].map(stat => (
          <button
            key={stat.label}
            type="button"
            onClick={() => { setSelectedUser(null); setSelectedDepartment(null); setFilter(stat.filter); }}
            className={cn(
              'card p-4 text-left border-0 hover:-translate-y-0.5 hover:shadow-card-hover',
              stat.bg,
              filter === stat.filter && 'ring-2 ring-brand-500',
            )}
          >
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className={cn('text-xs font-medium mt-0.5', stat.color)}>{stat.label}</p>
          </button>
        ))}
      </div>

      {justAssignedTasks.length > 0 && (
        <section className="surface-enter">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Just assigned</p>
              <h2 className="text-base font-semibold text-gray-900">Newest active assignments</h2>
            </div>
            <span className="hidden rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-500 shadow-card sm:inline-flex">
              Latest {justAssignedTasks.length}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {justAssignedTasks.map(task => {
              const createdAtMs = new Date(task.createdAt).getTime();
              const isFresh = Date.now() - createdAtMs <= NEW_ASSIGNMENT_WINDOW_MS;
              return (
                <button
                  key={task.taskId}
                  type="button"
                  onClick={() => setSelectedTask(task)}
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
                    <p className="mt-2 truncate text-xs text-gray-400">
                      {task.assignedToName} - {task.department || 'No department'}
                    </p>
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

      {/* Filters */}
      <div className="surface-enter flex flex-wrap gap-2 items-center">
        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'Pending Accept', 'In Progress', 'Completed', 'Verified', 'Overdue'] as TaskFilter[]).map(f => (
            <button
              key={f}
              onClick={() => { setSelectedUser(null); setSelectedDepartment(null); setFilter(f); }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {f === 'all' ? 'All Tasks' : f}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <select
            value={deptFilter}
            className="input py-1.5 text-xs w-auto"
            onChange={e => { setSelectedUser(null); setSelectedDepartment(null); setDeptFilter(e.target.value); }}
          >
            {departments.map(d => (
              <option key={d} value={d}>{d === 'all' ? 'All Departments' : d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Department blocks */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {departmentBlocks.length === 0 && (
          <div className="card p-10 text-center text-sm text-gray-400 md:col-span-2 xl:col-span-3">
            No department blocks match this filter
          </div>
        )}

        {departmentBlocks.map(block => (
          <button
            key={block.name}
            type="button"
            onClick={() => { setSelectedUser(null); setSelectedDepartment(block.name); }}
            className="card flex min-h-[190px] flex-col justify-between p-5 text-left hover:-translate-y-0.5 hover:shadow-card-hover focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Building2 size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{block.name}</h2>
                  <p className="text-xs text-gray-400">{block.totalUsers} active team members</p>
                </div>
              </div>
              <span className="rounded-full bg-gray-50 px-2.5 py-1 text-[10px] font-medium text-gray-500">
                Tap to open
              </span>
            </div>

            <div className="mt-5 grid grid-cols-5 gap-2">
              {[
                { label: 'Total', value: block.counts.total, color: 'text-gray-700' },
                { label: 'Pending', value: block.counts.pending, color: 'text-yellow-700' },
                { label: 'Active', value: block.counts.inProgress, color: 'text-blue-700' },
                { label: 'Done', value: block.counts.done, color: 'text-green-700' },
                { label: 'OD', value: block.counts.overdue, color: 'text-red-700' },
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

      {/* Department users modal */}
      {selectedDepartmentBlock && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/40 p-4">
          <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Building2 size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{selectedDepartmentBlock.name}</h2>
                  <p className="text-xs text-gray-400">
                    {selectedDepartmentBlock.totalUsers} active team members
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedDepartment(null); setSelectedUser(null); }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close department users"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2 border-b border-gray-100 px-5 py-4">
              {[
                { label: 'Total', value: selectedDepartmentBlock.counts.total, color: 'text-gray-700' },
                { label: 'Pending', value: selectedDepartmentBlock.counts.pending, color: 'text-yellow-700' },
                { label: 'Active', value: selectedDepartmentBlock.counts.inProgress, color: 'text-blue-700' },
                { label: 'Done', value: selectedDepartmentBlock.counts.done, color: 'text-green-700' },
                { label: 'OD', value: selectedDepartmentBlock.counts.overdue, color: 'text-red-700' },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-gray-50 px-2 py-2 text-center">
                  <p className={cn('text-sm font-bold', item.color)}>{item.value}</p>
                  <p className="text-[10px] text-gray-400">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="max-h-[58vh] overflow-y-auto">
              {selectedDepartmentBlock.users.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-gray-400">No users in this department</div>
              )}

              {selectedDepartmentBlock.users.map((user: any) => {
                const counts = getCounts(user.uid);
                const score = scoreMap[user.uid];
                const userTasks = getTasksForUser(user.uid);
                const isSelected = selectedUser === user.uid;

                return (
                  <div key={user.uid} className="border-b border-gray-50 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setSelectedUser(isSelected ? null : user.uid)}
                      className={cn(
                        'flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50 lg:flex-row lg:items-center lg:justify-between',
                        isSelected && 'bg-brand-50/60',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-400">{score ? `${score.monthlyScore}% MIS` : 'No MIS score yet'}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 lg:w-[360px]">
                        {[
                          { label: 'Total', value: counts.all, color: 'text-gray-700' },
                          { label: 'Active', value: counts.inProgress, color: 'text-blue-700' },
                          { label: 'Done', value: counts.completed + counts.verified, color: 'text-green-700' },
                          { label: 'OD', value: counts.overdue, color: 'text-red-700' },
                        ].map(item => (
                          <div key={item.label} className="rounded-lg bg-white px-2 py-1.5 text-center shadow-sm ring-1 ring-gray-100">
                            <p className={cn('text-sm font-bold', item.color)}>{item.value}</p>
                            <p className="text-[9px] text-gray-400">{item.label}</p>
                          </div>
                        ))}
                      </div>
                    </button>

                    {isSelected && userTasks.length > 0 && (
                      <div className="space-y-1.5 bg-gray-50 px-5 pb-4">
                        {userTasks.map(task => (
                          <button
                            key={task.taskId}
                            type="button"
                            onClick={() => setSelectedTask(task)}
                            className="flex w-full items-start gap-2 rounded-lg bg-white p-3 text-left hover:bg-gray-100"
                          >
                            <div className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                              task.priority === 'High' ? 'bg-red-500' :
                              task.priority === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                            )} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-gray-700">{task.description}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="font-mono text-[10px] text-gray-400">{task.taskId}</span>
                                <span className={cn('badge text-[10px] py-0', STATUS_COLORS[task.status])}>
                                  {task.status}
                                </span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {isSelected && userTasks.length === 0 && (
                      <div className="bg-gray-50 px-5 pb-4 text-xs text-gray-400">
                        No tasks for this filter
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          role="admin"
          currentUid=""
          onUpdate={() => { setSelectedTask(null); window.location.reload(); }}
        />
      )}
    </div>
  );
}
