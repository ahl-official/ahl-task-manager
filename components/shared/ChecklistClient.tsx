'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate, PRIORITY_DOT, STATUS_COLORS } from '@/lib/utils';
import type { TaskSerialized } from '@/types';

type ChecklistCategory = 'Daily' | 'Weekly' | 'Monthly';

interface ChecklistRow {
  task: TaskSerialized;
  periodKey: string;
  completed: boolean;
  label: string;
  canComplete: boolean;
}

const CATEGORY_OPTIONS: ChecklistCategory[] = ['Daily', 'Weekly', 'Monthly'];

export default function ChecklistClient({ initialCategory = 'Daily' }: { initialCategory?: ChecklistCategory }) {
  const [category, setCategory] = useState<ChecklistCategory>(initialCategory);
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState<string | null>(null);

  const completedCount = useMemo(() => rows.filter(row => row.completed).length, [rows]);

  async function loadRows(nextCategory = category) {
    setLoading(true);
    try {
      const res = await fetch(`/api/checklist?category=${encodeURIComponent(nextCategory)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRows(data.data);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to load checklist');
    } finally {
      setLoading(false);
    }
  }

  async function tick(taskId: string) {
    setTicking(taskId);
    try {
      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRows(current => current.map(row => row.task.taskId === taskId ? { ...row, completed: true } : row));
      toast.success('Checklist task marked complete');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to complete checklist task');
    } finally {
      setTicking(null);
    }
  }

  useEffect(() => {
    loadRows(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Checklist</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tick recurring tasks for the current period</p>
        </div>

        <div className="flex gap-2">
          <select
            value={category}
            onChange={e => setCategory(e.target.value as ChecklistCategory)}
            className="input py-2 text-sm w-auto"
          >
            {CATEGORY_OPTIONS.map(option => (
              <option key={option} value={option}>{option} Tasks</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadRows()}
            className="btn-secondary py-2"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card border-0 bg-brand-50 p-4">
          <p className="text-2xl font-bold text-brand-700">{completedCount}</p>
          <p className="text-xs font-medium text-brand-700">Completed</p>
        </div>
        <div className="card border-0 bg-gray-50 p-4">
          <p className="text-2xl font-bold text-gray-800">{rows.length}</p>
          <p className="text-xs font-medium text-gray-500">Assigned recurring tasks</p>
        </div>
        <div className="card border-0 bg-white p-4">
          <p className="text-2xl font-bold text-gray-800">{rows.length ? Math.round((completedCount / rows.length) * 100) : 0}%</p>
          <p className="text-xs font-medium text-gray-500">Current period progress</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            Loading checklist...
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            No {category.toLowerCase()} checklist tasks ready. Tasks appear here after they are accepted.
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="divide-y divide-gray-50">
            {rows.map(row => (
              <div key={`${row.task.taskId}-${row.periodKey}`} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-brand-600">{row.task.taskId}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{row.label}</span>
                    <span className={cn('badge text-[10px]', STATUS_COLORS[row.task.status])}>{row.task.status}</span>
                  </div>
                  <p className="truncate text-sm font-semibold text-gray-900">{row.task.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span>Period: {row.periodKey}</span>
                    <span>Due: {formatDate(row.task.endDate)}</span>
                    <span className="inline-flex items-center gap-1">
                      <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[row.task.priority])} />
                      {row.task.priority}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => tick(row.task.taskId)}
                  disabled={row.completed || !row.canComplete || ticking === row.task.taskId}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                    row.completed
                      ? 'bg-green-100 text-green-700'
                      : !row.canComplete
                        ? 'bg-gray-100 text-gray-500'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  )}
                >
                  {ticking === row.task.taskId ? <Loader2 size={15} className="animate-spin" /> : row.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  {row.completed ? 'Completed' : row.canComplete ? 'Mark Complete' : row.task.assignedToName}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
