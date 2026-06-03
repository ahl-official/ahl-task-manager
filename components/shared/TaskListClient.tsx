'use client';

import { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { cn, formatDate, STATUS_COLORS, PRIORITY_COLORS, PRIORITY_DOT, getDueBadge } from '@/lib/utils';
import TaskModal from './TaskModal';
import type { TaskSerialized } from '@/types';

interface Props {
  tasks: TaskSerialized[];
  role: 'admin' | 'user';
  currentUid: string;
}

const STATUS_OPTIONS = ['all', 'Pending Accept', 'In Progress', 'Delay Requested', 'Overdue', 'Completed', 'Verified'];

export default function TaskListClient({ tasks, role, currentUid }: Props) {
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('all');
  const [priorityFilter, setPriority] = useState('all');
  const [selectedTask, setSelected] = useState<TaskSerialized | null>(null);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const matchSearch   = !search || t.description.toLowerCase().includes(search.toLowerCase()) || t.taskId.toLowerCase().includes(search.toLowerCase());
      const matchStatus   = statusFilter === 'all' || t.status === statusFilter;
      const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
      return matchSearch && matchStatus && matchPriority;
    });
  }, [tasks, search, statusFilter, priorityFilter]);

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
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
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          className="input py-2 text-sm w-auto"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>
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
          {filtered.length} of {tasks.length}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
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
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelected(task)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-brand-600">{task.taskId}</span>
                    </td>
                    <td className="px-4 py-3 max-w-[240px]">
                      <p className="truncate text-gray-800 font-medium">{task.description}</p>
                      <p className="text-xs text-gray-400">{task.category} · {task.department}</p>
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
                      <button
                        onClick={e => { e.stopPropagation(); setSelected(task); }}
                        className="text-xs text-brand-600 hover:underline font-medium"
                      >
                        View
                      </button>
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
          onUpdate={() => { setSelected(null); window.location.reload(); }}
        />
      )}
    </>
  );
}
