'use client';

import { useState, useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isSameMonth, isToday, addMonths, subMonths, getDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn, PRIORITY_DOT, STATUS_COLORS } from '@/lib/utils';
import TaskModal from '@/components/shared/TaskModal';
import type { TaskSerialized } from '@/types';

interface Props {
  tasks: TaskSerialized[];
  users: { uid: string; name: string; department: string }[];
}

export default function CalendarClient({ tasks, users }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<TaskSerialized | null>(null);
  const [userFilter, setUserFilter]     = useState('all');

  const days = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end   = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const filteredTasks = useMemo(() =>
    userFilter === 'all' ? tasks : tasks.filter(t => t.assignedTo === userFilter),
    [tasks, userFilter]
  );

  function getTasksForDay(day: Date) {
    return filteredTasks.filter(task => {
      const date = task.delayedDate ?? task.endDate;
      return isSameDay(new Date(date), day);
    });
  }

  // Pad start of month
  const startPadding = getDay(startOfMonth(currentDate));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Calendar</h1>
          <p className="text-sm text-gray-500">Task due dates overview</p>
        </div>

        <div className="flex items-center gap-3">
          {/* User filter */}
          <select
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
            className="input py-1.5 text-xs w-auto"
          >
            <option value="all">All Members</option>
            {users.map(u => (
              <option key={u.uid} value={u.uid}>{u.name}</option>
            ))}
          </select>

          {/* Month nav */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
            <button
              onClick={() => setCurrentDate(d => subMonths(d, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-sm font-semibold text-gray-800 min-w-[130px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setCurrentDate(d => addMonths(d, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            onClick={() => setCurrentDate(new Date())}
            className="btn-secondary py-1.5 text-xs"
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-2.5 text-center text-xs font-semibold text-gray-400">
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {/* Padding cells */}
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[100px] border-b border-r border-gray-50 bg-gray-50/50" />
          ))}

          {days.map(day => {
            const dayTasks  = getTasksForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const showMax   = 3;
            const overflow  = dayTasks.length - showMax;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'min-h-[100px] border-b border-r border-gray-100 p-1.5 transition-colors',
                  !isCurrentMonth && 'bg-gray-50/30',
                  isToday(day) && 'bg-brand-50/40',
                )}
              >
                <p className={cn(
                  'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                  isToday(day)
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-500',
                )}>
                  {format(day, 'd')}
                </p>

                <div className="space-y-0.5">
                  {dayTasks.slice(0, showMax).map(task => (
                    <button
                      key={task.taskId}
                      onClick={() => setSelectedTask(task)}
                      className="w-full text-left flex items-center gap-1 bg-white rounded-md px-1.5 py-1 text-[10px] font-medium text-gray-700 hover:bg-brand-50 border border-gray-100 hover:border-brand-200 transition-colors truncate"
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOT[task.priority])} />
                      <span className="truncate">{task.description}</span>
                    </button>
                  ))}
                  {overflow > 0 && (
                    <p className="text-[10px] text-brand-600 font-medium pl-1">+{overflow} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task modal */}
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
