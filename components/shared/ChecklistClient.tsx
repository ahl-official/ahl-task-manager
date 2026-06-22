'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, CheckCircle2, Circle, MessageSquare, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate } from '@/lib/utils';

type ChecklistCategory = 'Daily' | 'Weekly' | 'Monthly';

interface ChecklistRow {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  department: string;
  description: string;
  category: ChecklistCategory;
  periodKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  status: 'Completed' | 'Pending' | 'Dead';
  dead: boolean;
  deadAt: string | null;
  remark: string;
  remarkBy: string;
  label: string;
  canComplete: boolean;
  canManage: boolean;
}

const CATEGORY_OPTIONS: ChecklistCategory[] = ['Daily', 'Weekly', 'Monthly'];

export default function ChecklistClient({ initialCategory = 'Daily' }: { initialCategory?: ChecklistCategory }) {
  const [category, setCategory] = useState<ChecklistCategory>(initialCategory);
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticking, setTicking] = useState<string | null>(null);
  const [department, setDepartment] = useState('');
  const [individual, setIndividual] = useState('');
  const [date, setDate] = useState('');
  const [activeRemarkRow, setActiveRemarkRow] = useState<string | null>(null);
  const [remark, setRemark] = useState('');

  const departments = useMemo(() => Array.from(new Set(rows.map(row => row.department).filter(Boolean))).sort(), [rows]);
  const individuals = useMemo(() => Array.from(new Set(
    rows
      .filter(row => !department || row.department === department)
      .map(row => row.userName)
      .filter(Boolean),
  )).sort(), [rows, department]);
  const visibleRows = useMemo(() => rows.filter(row => {
    const selected = date ? new Date(`${date}T12:00:00`) : null;
    const due = row.dueDate ? new Date(row.dueDate) : null;
    const start = row.periodStart ? new Date(row.periodStart) : null;
    const end = row.periodEnd ? new Date(row.periodEnd) : null;
    const matchesDate = !selected ||
      (due && !Number.isNaN(due.valueOf()) && due.toDateString() === selected.toDateString()) ||
      (start && end && !Number.isNaN(start.valueOf()) && !Number.isNaN(end.valueOf()) && selected >= start && selected <= end);
    return (!department || row.department === department) &&
      (!individual || row.userName === individual) &&
      Boolean(matchesDate);
  }), [rows, department, individual, date]);
  const completedCount = useMemo(() => visibleRows.filter(row => row.completed).length, [visibleRows]);

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

  async function tick(row: ChecklistRow) {
    setTicking(row.id);
    try {
      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: row.taskId, category: row.category, periodKey: row.periodKey, action: 'complete' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRows(current => current.map(item => item.id === row.id
        ? { ...item, completed: true, completedAt: data.data.completedAt, status: 'Completed' }
        : item));
      toast.success('Checklist task marked complete');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to complete checklist task');
    } finally {
      setTicking(null);
    }
  }

  async function submitAction(row: ChecklistRow, action: 'dead' | 'remark' | 'revive') {
    if (!remark.trim()) {
      toast.error('Add a remark first');
      return;
    }
    setTicking(row.id);
    try {
      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: row.taskId, category: row.category, periodKey: row.periodKey, action, remark }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRows(current => current.map(item => item.id === row.id ? {
        ...item,
        dead: data.data.dead,
        deadAt: data.data.deadAt,
        remark: data.data.remark,
        remarkBy: data.data.remarkBy,
        status: data.data.dead ? 'Dead' : item.completed ? 'Completed' : 'Pending',
      } : item));
      setRemark('');
      setActiveRemarkRow(null);
      toast.success(action === 'dead' ? 'Task flagged Dead' : action === 'revive' ? 'Task revived' : 'Remark added');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update checklist task');
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
            onChange={e => {
              setCategory(e.target.value as ChecklistCategory);
              setDepartment('');
              setIndividual('');
              setDate('');
            }}
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

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-500">Department</span>
          <select
            value={department}
            onChange={event => {
              setDepartment(event.target.value);
              setIndividual('');
            }}
            className="input w-full py-2 text-sm"
            disabled={loading || departments.length === 0}
          >
            <option value="">All departments</option>
            {departments.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-500">Date</span>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={event => setDate(event.target.value)}
              className="input min-w-0 flex-1 py-2 text-sm"
            />
            {date && (
              <button type="button" onClick={() => setDate('')} className="btn-secondary px-3" title="Clear date filter">
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-gray-500">Individual</span>
          <select
            value={individual}
            onChange={event => setIndividual(event.target.value)}
            className="input w-full py-2 text-sm"
            disabled={loading || individuals.length === 0}
          >
            <option value="">All individuals</option>
            {individuals.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card border-0 bg-brand-50 p-4">
          <p className="text-2xl font-bold text-brand-700">{completedCount}</p>
          <p className="text-xs font-medium text-brand-700">Completed</p>
        </div>
        <div className="card border-0 bg-gray-50 p-4">
          <p className="text-2xl font-bold text-gray-800">{visibleRows.length}</p>
          <p className="text-xs font-medium text-gray-500">Assigned recurring tasks</p>
        </div>
        <div className="card border-0 bg-white p-4">
          <p className="text-2xl font-bold text-gray-800">{visibleRows.length ? Math.round((completedCount / visibleRows.length) * 100) : 0}%</p>
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

        {!loading && visibleRows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            No {category.toLowerCase()} checklist tasks match these filters.
          </div>
        )}

        {!loading && visibleRows.length > 0 && (
          <div className="divide-y divide-gray-50">
            {visibleRows.map(row => (
              <div key={row.id} className={cn('flex flex-col gap-3 px-5 py-4', row.dead && 'bg-red-50')}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-brand-600">{row.taskId}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{row.label}</span>
                    <span className={cn('badge text-[10px]', row.completed ? 'bg-green-100 text-green-700' : row.dead ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-700')}>{row.status}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{row.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span>Period: {row.periodKey}</span>
                    <span>Due: {formatDate(row.dueDate)}</span>
                    <span>{row.userName}{row.department ? ` · ${row.department}` : ''}</span>
                  </div>
                  {row.remark && (
                    <div className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2">
                      <p className="mb-1 text-[10px] font-semibold uppercase text-gray-400">Remarks</p>
                      <p className="whitespace-pre-line text-xs text-gray-700">{row.remark}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => tick(row)}
                    disabled={row.completed || row.dead || !row.canComplete || ticking === row.id}
                    className={cn(
                      'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                      row.completed ? 'bg-green-100 text-green-700' : row.dead || !row.canComplete ? 'bg-gray-100 text-gray-500' : 'bg-brand-600 text-white hover:bg-brand-700'
                    )}
                  >
                    {ticking === row.id ? <Loader2 size={15} className="animate-spin" /> : row.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    {row.completed ? 'Completed' : row.dead ? 'Revive first' : row.canComplete ? 'Mark Complete' : row.userName}
                  </button>
                  {row.canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRemarkRow(activeRemarkRow === row.id ? null : row.id);
                        setRemark('');
                      }}
                      className="btn-secondary px-3 py-2"
                      title="Add remark or change Dead status"
                    >
                      <MessageSquare size={15} />
                      Remark
                    </button>
                  )}
                </div>
                </div>

                {activeRemarkRow === row.id && (
                  <div className="rounded-md border border-gray-200 bg-white p-3">
                    <label className="label">New remark</label>
                    <textarea
                      value={remark}
                      onChange={event => setRemark(event.target.value)}
                      placeholder="Explain what is blocked or add an update..."
                      className="input h-20 resize-none"
                      maxLength={1000}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => submitAction(row, 'remark')} disabled={ticking === row.id} className="btn-secondary py-2">
                        <MessageSquare size={14} /> Add remark
                      </button>
                      {!row.completed && !row.dead && (
                        <button type="button" onClick={() => submitAction(row, 'dead')} disabled={ticking === row.id} className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                          <AlertOctagon size={14} /> Flag Dead
                        </button>
                      )}
                      {row.dead && (
                        <button type="button" onClick={() => submitAction(row, 'revive')} disabled={ticking === row.id} className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                          <RotateCcw size={14} /> Revive task
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
