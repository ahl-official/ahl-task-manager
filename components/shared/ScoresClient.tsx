'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn, STATUS_COLORS } from '@/lib/utils';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import TaskModal from '@/components/shared/TaskModal';
import type { TaskSerialized } from '@/types';

type TaskFilter = 'all' | 'Pending Accept' | 'In Progress' | 'Completed' | 'Verified' | 'Overdue';

interface Props {
  scores: any[];
  users?: { uid: string; name: string; department: string; role?: string; isActive?: boolean }[];
  tasks?: TaskSerialized[];
  departments?: { id?: string; name: string }[];
  currentUid?: string;
  viewerRole?: 'admin' | 'leader' | 'member' | 'intern';
  showDepartments?: boolean;
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

  useEffect(() => {
    setTaskItems(tasks);
  }, [tasks]);

  function updateTask(updated?: TaskSerialized) {
    if (!updated) {
      setSelectedTask(null);
      return;
    }

    setTaskItems(current => current.map(task => task.taskId === updated.taskId ? updated : task));
    setSelectedTask(updated);
  }

  const activeUsers = users.filter(user => user.isActive !== false);
  const scoreMap = useMemo(() =>
    Object.fromEntries(scores.map(score => [score.uid, score])),
    [scores],
  );
  const normalizedScores = useMemo(() => {
    const rows = activeUsers.length
      ? activeUsers.map(user => ({
        uid: user.uid,
        name: user.name,
        department: user.department,
        waNumber: scoreMap[user.uid]?.waNumber ?? '',
        tasksAssigned: scoreMap[user.uid]?.tasksAssigned ?? 0,
        tasksCompleted: scoreMap[user.uid]?.tasksCompleted ?? 0,
        onTimeCount: scoreMap[user.uid]?.onTimeCount ?? 0,
        lateCount: scoreMap[user.uid]?.lateCount ?? 0,
        monthlyScore: Math.min(100, Math.max(0, scoreMap[user.uid]?.monthlyScore ?? 0)),
        lastUpdated: scoreMap[user.uid]?.lastUpdated ?? null,
      }))
      : scores.map(score => ({
        ...score,
        monthlyScore: Math.min(100, Math.max(0, score.monthlyScore ?? 0)),
      }));

    const knownIds = new Set(rows.map(row => row.uid));
    scores.forEach(score => {
      if (!knownIds.has(score.uid)) {
        rows.push({
          ...score,
          monthlyScore: Math.min(100, Math.max(0, score.monthlyScore ?? 0)),
        });
      }
    });

    return rows;
  }, [activeUsers, scoreMap, scores]);

  const departments = useMemo(() => {
    const fromUsers = activeUsers.map(user => user.department).filter(Boolean);
    const fromScores = normalizedScores.map(score => score.department).filter(Boolean);
    const fromSaved = initialDepartments.map(department => department.name).filter(Boolean);
    return Array.from(new Set([...fromSaved, ...fromUsers, ...fromScores])).sort((a, b) => a.localeCompare(b));
  }, [activeUsers, initialDepartments, normalizedScores]);

  function userTasks(uid: string, nextFilter: TaskFilter = filter) {
    const rows = taskItems.filter(task => task.assignedTo === uid);
    if (nextFilter === 'all') return rows;
    if (nextFilter === 'Completed') return rows.filter(task => ['Completed', 'Verified'].includes(task.status));
    return rows.filter(task => task.status === nextFilter);
  }

  function countsForUser(uid: string) {
    const rows = taskItems.filter(task => task.assignedTo === uid);
    return {
      total: rows.length,
      pending: rows.filter(task => task.status === 'Pending Accept').length,
      active: rows.filter(task => task.status === 'In Progress').length,
      completed: rows.filter(task => ['Completed', 'Verified'].includes(task.status)).length,
      overdue: rows.filter(task => task.status === 'Overdue').length,
    };
  }

  function sameDepartment(left?: string, right?: string) {
    return (left ?? '').trim().toLowerCase() === (right ?? '').trim().toLowerCase();
  }

  function scoreForIdentity(identity: { uid: string; name: string; department: string }) {
    const existing = scoreMap[identity.uid];
    const rows = taskItems.filter(task => task.assignedTo === identity.uid);
    const completedRows = rows.filter(task => ['Completed', 'Verified'].includes(task.status));
    const onTimeRows = completedRows.filter(task => {
      if (!task.completedAt) return false;
      const due = task.delayedDate ?? task.endDate;
      return due ? new Date(task.completedAt).getTime() <= new Date(due).getTime() : true;
    });
    const lateRows = rows.filter(task => {
      if (task.status === 'Overdue') return true;
      if (!task.completedAt) return false;
      const due = task.delayedDate ?? task.endDate;
      return due ? new Date(task.completedAt).getTime() > new Date(due).getTime() : false;
    });
    const assigned = Math.max(existing?.tasksAssigned ?? rows.length, rows.length);
    const onTime = Math.max(existing?.onTimeCount ?? 0, onTimeRows.length);
    const monthlyScore = assigned > 0
      ? Math.min(100, Math.max(0, Math.round((onTime / assigned) * 100)))
      : Math.min(100, Math.max(0, existing?.monthlyScore ?? 0));

    return {
      uid: identity.uid,
      name: identity.name || existing?.name || 'Unknown',
      department: identity.department || existing?.department || '',
      waNumber: existing?.waNumber ?? '',
      tasksAssigned: assigned,
      tasksCompleted: Math.max(existing?.tasksCompleted ?? 0, completedRows.length),
      onTimeCount: onTime,
      lateCount: Math.max(existing?.lateCount ?? 0, lateRows.length),
      monthlyScore,
      lastUpdated: existing?.lastUpdated ?? null,
    };
  }

  const departmentBlocks = departments.map(department => {
    const identities = new Map<string, { uid: string; name: string; department: string; role?: string; isActive?: boolean }>();

    activeUsers
      .filter(user => sameDepartment(user.department, department))
      .forEach(user => identities.set(user.uid, user));

    taskItems
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
    const departmentTasks = taskItems.filter(task => userIds.has(task.assignedTo));
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
        overdue: departmentTasks.filter(task => task.status === 'Overdue').length,
      },
    };
  });

  const selectedBlock = selectedDepartment
    ? departmentBlocks.find(block => block.name === selectedDepartment)
    : null;

  const sortedScores = [...normalizedScores].sort((a, b) => (b.monthlyScore ?? 0) - (a.monthlyScore ?? 0));

  if (!showDepartments) {
    return (
      <ScoreList
        scores={sortedScores}
        onSelectUser={uid => {
          setSelectedUser(selectedUser === uid ? null : uid);
          setFilter('all');
        }}
        selectedUser={selectedUser}
        userTasks={userTasks}
        countsForUser={countsForUser}
        filter={filter}
        setFilter={setFilter}
        onOpenTask={setSelectedTask}
      />
    );
  }

  return (
    <div className="space-y-5">
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/40 p-4">
          <div className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Building2 size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{selectedBlock.name}</h2>
                  <p className="text-xs text-gray-400">{selectedBlock.averageScore}% department MIS score</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedDepartment(null);
                  setSelectedUser(null);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close department scores"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto p-5">
              <ScoreList
                scores={selectedBlock.scores.sort((a, b) => (b.monthlyScore ?? 0) - (a.monthlyScore ?? 0))}
                onSelectUser={uid => {
                  setSelectedUser(selectedUser === uid ? null : uid);
                  setFilter('all');
                }}
                selectedUser={selectedUser}
                userTasks={userTasks}
                countsForUser={countsForUser}
                filter={filter}
                setFilter={setFilter}
                onOpenTask={setSelectedTask}
              />
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
}: {
  scores: any[];
  onSelectUser: (uid: string) => void;
  selectedUser: string | null;
  userTasks: (uid: string, filter?: TaskFilter) => TaskSerialized[];
  countsForUser: (uid: string) => { total: number; pending: number; active: number; completed: number; overdue: number };
  filter: TaskFilter;
  setFilter: (filter: TaskFilter) => void;
  onOpenTask: (task: TaskSerialized) => void;
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
                <p className="text-[11px] text-gray-400">MIS Score</p>
              </div>
            </button>

            <div className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full bg-white/60">
              <div
                className={cn('h-full rounded-full transition-all', getScoreColor(score.monthlyScore).replace('text-', 'bg-'))}
                style={{ width: `${score.monthlyScore}%` }}
              />
            </div>

            {selected && (
              <div className="border-t border-white/70 bg-white/70 px-4 py-3">
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
            )}
          </div>
        );
      })}
    </div>
  );
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

function getScoreBg(score: number): string {
  if (score >= 90) return 'bg-green-50 border-green-200';
  if (score >= 70) return 'bg-blue-50 border-blue-200';
  if (score >= 50) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}
