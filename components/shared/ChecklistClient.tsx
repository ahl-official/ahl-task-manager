'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertOctagon, CalendarOff, CheckCircle2, Circle, MessageSquare, Loader2, RefreshCw, RotateCcw, Search, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate } from '@/lib/utils';
import { namesEqual, normalizePersonName } from '@/lib/utils/names';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import { isoWeekday } from '@/lib/mis/weeklyOff';

type ChecklistCategory = 'Daily' | 'Weekly' | 'Monthly';


interface ChecklistRow {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  department: string;
  description: string;
  title?: string;
  category: ChecklistCategory;
  periodKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  status: 'Completed' | 'Verified' | 'Pending' | 'Dead';
  dead: boolean;
  deadAt: string | null;
  remark: string;
  remarkBy: string;
  label: string;
  canComplete: boolean;
  canUncomplete?: boolean;
  canManage: boolean;
  mine?: boolean;
  isPast?: boolean;
}

const CATEGORY_OPTIONS: ChecklistCategory[] = ['Daily', 'Weekly', 'Monthly'];

export default function ChecklistClient({ initialCategory = 'Daily' }: { initialCategory?: ChecklistCategory }) {
  const [category, setCategory] = useState<ChecklistCategory>(initialCategory);
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [ticking, setTicking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [individual, setIndividual] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [date, setDate] = useState('');
  const [activeRemarkRow, setActiveRemarkRow] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ChecklistRow | null>(null);
  const [deleteConfirmMode, setDeleteConfirmMode] = useState<'day' | 'whole' | null>(null);

  const categoryCache = useRef<Record<string, { rows: ChecklistRow[]; elevated: boolean; isAdmin: boolean; currentUserName: string; nextCursor: string | null }>>({});
  const pageSentinel = useRef<HTMLDivElement | null>(null);
  const requestKey = useRef('');
  const pageInFlight = useRef(false);
  const searchedKeys = useRef(new Set<string>());
  const viewingMonday = Boolean(date && isoWeekday(date) === 1);
  const deleteDayLabel = deleteTarget?.category === 'Daily' && deleteTarget.periodKey === indiaTodayKey()
    ? "Delete today's task"
    : deleteTarget?.category === 'Daily' ? "Delete this day's task" : 'Delete this occurrence';



  const departments = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      const key = normalizePersonName(row.department);
      if (!key || seen.has(key)) continue;
      seen.set(key, row.department);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows]);
  const individuals = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (department && !namesEqual(row.department, department)) continue;
      const key = normalizePersonName(row.userName);
      if (!key || seen.has(key)) continue;
      seen.set(key, row.userName);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [rows, department]);
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(row => {
      const matchesDate = !date || row.dueDate === date || row.periodKey === date ||
        (row.periodStart && row.periodEnd && date >= row.periodStart && date <= row.periodEnd);
      const matchesMine = !mineOnly || Boolean(row.mine) || namesEqual(row.userName, currentUserName);
      const matchesDept = !department || namesEqual(row.department, department);
      const matchesIndiv = !individual || namesEqual(row.userName, individual);
      const matchesSearch = !q ||
        (row.taskId && row.taskId.toLowerCase().includes(q)) ||
        (row.description && row.description.toLowerCase().includes(q)) ||
        (row.title && row.title.toLowerCase().includes(q)) ||
        (row.userName && row.userName.toLowerCase().includes(q)) ||
        (row.department && row.department.toLowerCase().includes(q)) ||
        (row.label && row.label.toLowerCase().includes(q)) ||
        (row.periodKey && row.periodKey.toLowerCase().includes(q)) ||
        (row.status && row.status.toLowerCase().includes(q)) ||
        (row.remark && row.remark.toLowerCase().includes(q));

      return matchesMine && matchesDept && matchesIndiv && Boolean(matchesDate) && matchesSearch;
    });
  }, [rows, department, individual, date, mineOnly, currentUserName, search]);
  const completedCount = useMemo(() => visibleRows.filter(row => row.completed).length, [visibleRows]);

  async function loadRows(nextCategory = category, nextDate = date, forceRefresh = false) {
    const cacheKey = `${nextCategory}:${nextDate || 'today'}`;
    requestKey.current = cacheKey;
    if (forceRefresh) searchedKeys.current.clear();
    const cached = categoryCache.current[cacheKey];
    if (cached && !forceRefresh) {
      setRows(cached.rows);
      setElevated(cached.elevated);
      setIsAdmin(cached.isAdmin);
      setCurrentUserName(cached.currentUserName);
      setNextCursor(cached.nextCursor);
      setLoading(false);
      return;
    }
    setLoading(true);
    setRows([]);
    setNextCursor(null);

    try {
      const qs = new URLSearchParams({ category: nextCategory });
      if (nextDate) qs.set('date', nextDate);
      const res = await fetch(`/api/checklist?${qs.toString()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const elevatedVal = Boolean(data.meta?.elevated);
      const isAdminVal = Boolean(data.meta?.isAdmin);
      const userNameVal = String(data.meta?.currentUserName ?? '');
      if (requestKey.current !== cacheKey) return;
      categoryCache.current[cacheKey] = {
        rows: data.data,
        elevated: elevatedVal,
        isAdmin: isAdminVal,
        currentUserName: userNameVal,
        nextCursor: data.meta?.nextCursor || null,
      };
      setRows(data.data);
      setNextCursor(data.meta?.nextCursor || null);
      setElevated(elevatedVal);
      setIsAdmin(isAdminVal);
      setCurrentUserName(userNameVal);
    } catch (err: any) {
      if (!cached) toast.error(err.message ?? 'Failed to load checklist');
    } finally {
      if (requestKey.current === cacheKey) setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || pageInFlight.current || loading || search.trim()) return;
    const cacheKey = `${category}:${date || 'today'}`;
    const cursor = nextCursor;
    pageInFlight.current = true;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ category, cursor });
      if (date) qs.set('date', date);
      const res = await fetch(`/api/checklist?${qs}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (requestKey.current !== cacheKey) return;
      const next = data.meta?.nextCursor || null;
      setNextCursor(next);
      setRows(current => {
        const ids = new Set(current.map(row => row.id));
        const merged = [...current, ...data.data.filter((row: ChecklistRow) => !ids.has(row.id))];
        categoryCache.current[cacheKey] = { rows: merged, elevated, isAdmin, currentUserName, nextCursor: next };
        return merged;
      });
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to load more checklist tasks');
    } finally {
      pageInFlight.current = false;
      setLoadingMore(false);
    }
  }

  async function tick(row: ChecklistRow) {
    // Optimistic UI update for 0ms instant feedback
    const prevRows = rows;
    const updatedRows = (list: ChecklistRow[]) => list.map(item => item.id === row.id
      ? { ...item, completed: true, completedAt: new Date().toISOString(), status: 'Completed' as const, canComplete: false, canUncomplete: true }
      : item);

    setRows(updatedRows);
    const activeCacheKey = `${row.category}:${date || 'today'}`;
    if (categoryCache.current[activeCacheKey]) {
      categoryCache.current[activeCacheKey].rows = updatedRows(categoryCache.current[activeCacheKey].rows);
    }
    setTicking(row.id);

    try {
      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: row.taskId,
          title: row.description,
          description: row.description,
          department: row.department,
          assignedTo: row.userId,
          assignedToName: row.userName,
          category: row.category,
          periodKey: row.periodKey,
          action: 'complete',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const nextStatus = data.data.status || (elevated ? 'Verified' : 'Completed');
      const serverUpdated = (list: ChecklistRow[]) => list.map(item => item.id === row.id
        ? { ...item, completed: true, completedAt: data.data.completedAt, status: nextStatus, canComplete: false, canUncomplete: true }
        : item);
      setRows(serverUpdated);
      if (categoryCache.current[row.category]) {
        categoryCache.current[row.category].rows = serverUpdated(categoryCache.current[row.category].rows);
      }
      toast.success(nextStatus === 'Verified' ? 'Checklist task marked verified' : 'Checklist task marked complete');
    } catch (err: any) {
      setRows(prevRows); // Rollback on failure
      if (categoryCache.current[row.category]) {
        categoryCache.current[row.category].rows = prevRows;
      }
      toast.error(err.message ?? 'Failed to complete checklist task');
    } finally {
      setTicking(null);
    }
  }

  async function uncomplete(row: ChecklistRow) {
    const prevRows = rows;
    const updatedRows = (list: ChecklistRow[]) => list.map(item => item.id === row.id
      ? {
          ...item,
          completed: false,
          completedAt: null,
          status: 'Pending' as const,
          canComplete: true,
          canUncomplete: false,
        }
      : item);

    setRows(updatedRows);
    const activeCacheKey = `${row.category}:${date || 'today'}`;
    if (categoryCache.current[activeCacheKey]) {
      categoryCache.current[activeCacheKey].rows = updatedRows(categoryCache.current[activeCacheKey].rows);
    }
    setTicking(row.id);

    try {
      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: row.taskId,
          title: row.description,
          description: row.description,
          department: row.department,
          assignedTo: row.userId,
          assignedToName: row.userName,
          category: row.category,
          periodKey: row.periodKey,
          action: 'uncomplete',
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Marked as not completed');
    } catch (err: any) {
      setRows(prevRows);
      if (categoryCache.current[row.category]) {
        categoryCache.current[row.category].rows = prevRows;
      }
      toast.error(err.message ?? 'Failed to undo completion');
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
        body: JSON.stringify({
          taskId: row.taskId,
          title: row.description,
          description: row.description,
          department: row.department,
          assignedTo: row.userId,
          assignedToName: row.userName,
          category: row.category,
          periodKey: row.periodKey,
          action,
          remark,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const updated = (list: ChecklistRow[]) => list.map(item => item.id === row.id ? {
        ...item,
        dead: data.data.dead,
        deadAt: data.data.deadAt,
        remark: data.data.remark,
        remarkBy: data.data.remarkBy,
        status: data.data.dead ? ('Dead' as const) : item.completed ? ('Completed' as const) : ('Pending' as const),
      } : item);
      setRows(updated);
      if (categoryCache.current[row.category]) {
        categoryCache.current[row.category].rows = updated(categoryCache.current[row.category].rows);
      }
      setRemark('');
      setActiveRemarkRow(null);
      toast.success(action === 'dead' ? 'Task flagged Dead' : action === 'revive' ? 'Task revived' : 'Remark added');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update checklist task');
    } finally {
      setTicking(null);
    }
  }

  async function deleteForDayOnly(row: ChecklistRow) {
    setTicking(row.id);
    try {
      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: row.taskId,
          title: row.description,
          description: row.description,
          department: row.department,
          assignedTo: row.userId,
          assignedToName: row.userName,
          category: row.category,
          periodKey: row.periodKey,
          action: 'skip_day',
          remark: `Removed for ${row.periodKey} only (absent / skip day)`,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      // Day skip hides from checklist and drops that day from planned score; past days stay.
      setRows(prev => prev.filter(r => r.id !== row.id));
      const cacheKey = `${row.category}:${date || 'today'}`;
      if (categoryCache.current[cacheKey]) {
        categoryCache.current[cacheKey].rows = categoryCache.current[cacheKey].rows.filter(r => r.id !== row.id);
      }
      toast.success('Task removed for this period');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to remove this day');
    } finally {
      setTicking(null);
      setDeleteTarget(null);
      setDeleteConfirmMode(null);
    }
  }

  async function deleteEntireTask(row: ChecklistRow) {
    setTicking(row.id);
    try {
      const templateId = row.taskId;
      const res = await fetch(`/api/recurring/templates/${encodeURIComponent(templateId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setRows(prev => prev.filter(r => r.taskId !== templateId));
      // Clear from all category caches for this template going forward
      for (const key of Object.keys(categoryCache.current)) {
        categoryCache.current[key].rows = categoryCache.current[key].rows.filter(r => r.taskId !== templateId);
      }
      toast.success('Recurring task deleted');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete task');
    } finally {
      setTicking(null);
      setDeleteTarget(null);
      setDeleteConfirmMode(null);
    }
  }

  useEffect(() => {
    loadRows(category, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, date]);

  useEffect(() => {
    if (!nextCursor || loading || loadingMore || search.trim() || !pageSentinel.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) void loadMore();
    }, { rootMargin: '250px' });
    observer.observe(pageSentinel.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loading, loadingMore, search, category, date]);

  useEffect(() => {
    const query = search.trim();
    if (loading || query.length < 2 || visibleRows.length > 0) {
      setSearching(false);
      return;
    }
    const lookupKey = `${category}:${date || 'today'}:${query.toLowerCase()}`;
    if (searchedKeys.current.has(lookupKey)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      searchedKeys.current.add(lookupKey);
      setSearching(true);
      try {
        const qs = new URLSearchParams({ category, search: query });
        if (date) qs.set('date', date);
        const res = await fetch(`/api/checklist?${qs}`, { signal: controller.signal });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        if (controller.signal.aborted) return;
        if (requestKey.current !== `${category}:${date || 'today'}`) return;
        setRows(current => {
          const ids = new Set(current.map(row => row.id));
          return [...current, ...data.data.filter((row: ChecklistRow) => !ids.has(row.id))];
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          searchedKeys.current.delete(lookupKey);
          toast.error(err.message ?? 'Checklist search failed');
        } else searchedKeys.current.delete(lookupKey);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, date, loading, visibleRows.length]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 pr-14 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Checklist</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {elevated
              ? 'Team view of recurring tasks. Use Show my tasks to filter and complete your own.'
              : 'Tick recurring tasks for the current period'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {elevated && (
            <button
              type="button"
              onClick={() => {
                setMineOnly(current => !current);
                if (!mineOnly) setIndividual('');
              }}
              className={cn('btn-secondary py-2', mineOnly && 'bg-brand-50 text-brand-700 border-brand-200')}
            >
              {mineOnly ? 'Showing my tasks' : 'Show my tasks'}
            </button>
          )}
          <select
            value={category}
            onChange={e => {
              setCategory(e.target.value as ChecklistCategory);
              setDepartment('');
              setIndividual('');
              setDate('');
              setSearch('');
            }}
            className="input w-auto py-2 text-sm"
          >
            {CATEGORY_OPTIONS.map(option => (
              <option key={option} value={option}>{option} Tasks</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadRows(category, date, true)}
            className="btn-secondary py-2"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>



      {/* Search & Filter Bar */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search checklist (task ID, description, name, department, remarks)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full py-2 pl-9 pr-9 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:text-gray-600 focus:outline-none"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className={cn('grid gap-3', elevated ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 max-w-xs')}>
          {elevated && (
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
          )}

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Date</span>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                max={indiaTodayKey()}
                onChange={event => {
                  const val = event.target.value;
                  const today = indiaTodayKey();
                  if (val && val > today) {
                    toast.error('Cannot select future dates for checklist');
                    return;
                  }
                  setDate(val);
                }}
                className="input min-w-0 flex-1 py-2 text-sm"
              />
              {date && (
                <button type="button" onClick={() => setDate('')} className="btn-secondary px-3" title="Clear date filter">
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </label>

          {elevated && (
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
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card border-0 bg-brand-50 p-4">
          <p className="text-2xl font-bold text-brand-700">{completedCount}</p>
          <p className="text-xs font-medium text-brand-700">Completed in loaded tasks</p>
        </div>
        <div className="card border-0 bg-gray-50 p-4">
          <p className="text-2xl font-bold text-gray-800">{visibleRows.length}</p>
          <p className="text-xs font-medium text-gray-500">Loaded recurring tasks</p>
        </div>
        <div className="card border-0 bg-white p-4">
          <p className="text-2xl font-bold text-gray-800">{visibleRows.length ? Math.round((completedCount / visibleRows.length) * 100) : 0}%</p>
          <p className="text-xs font-medium text-gray-500">Loaded task progress</p>
        </div>
      </div>

      {viewingMonday && category === 'Daily' && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <CalendarOff size={16} className="mt-0.5 shrink-0" />
          <p>
            Monday is weekly off for <span className="font-medium">Salon Daily</span> doers — their daily checklist does not appear or score on Mondays. Office daily tasks still show.
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            Loading checklist...
          </div>
        )}

        {!loading && visibleRows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {searching ? 'Searching checklist...' : `No ${category.toLowerCase()} checklist tasks match these filters.`}
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
                      <span className={cn(
                        'badge text-[10px]',
                        row.status === 'Verified' ? 'bg-brand-100 text-brand-700 font-semibold' :
                        row.completed ? 'bg-green-100 text-green-700' :
                        row.dead ? 'bg-red-600 text-white' :
                        'bg-amber-100 text-amber-700'
                      )}>
                        {row.status}
                      </span>
                      {row.mine && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">Mine</span>}
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
                      title={!row.completed && !row.canComplete ? 'Past date tasks cannot be completed by members. Contact an admin.' : undefined}
                      className={cn(
                        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                        row.status === 'Verified' ? 'bg-brand-100 text-brand-700 border border-brand-200' :
                        row.completed ? 'bg-green-100 text-green-700' :
                        row.dead || !row.canComplete ? 'bg-gray-100 text-gray-500 cursor-not-allowed' :
                        'bg-brand-600 text-white hover:bg-brand-700'
                      )}
                    >
                      {ticking === row.id ? <Loader2 size={15} className="animate-spin" /> : row.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                      {row.status === 'Verified' ? 'Verified' : row.completed ? 'Completed' : row.dead ? 'Revive first' : row.canComplete ? 'Mark Complete' : (row as any).isPast ? 'Past Due (Locked)' : row.userName}
                    </button>
                    {row.completed && !row.dead && row.canUncomplete && (
                      <button
                        type="button"
                        onClick={() => uncomplete(row)}
                        disabled={ticking === row.id}
                        title="Undo accidental complete"
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {ticking === row.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                        Mark as not completed
                      </button>
                    )}
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
                    {isAdmin && row.canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmMode(null);
                          setDeleteTarget(row);
                        }}
                        disabled={ticking === row.id}
                        className="btn-secondary px-2.5 py-2 text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Delete this day or whole recurring task"
                      >
                        <Trash2 size={15} />
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
        {!loading && nextCursor && !search.trim() && (
          <div ref={pageSentinel} className="flex justify-center px-4 py-4">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn-secondary py-2">
              {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
              {loadingMore ? 'Loading more...' : 'Load more tasks'}
            </button>
          </div>
        )}
      </div>

      {isAdmin && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {deleteConfirmMode ? 'Confirm deletion' : 'Delete checklist task'}
                </h2>
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">{deleteTarget.description}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {deleteTarget.userName} · {deleteTarget.periodKey}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmMode(null);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            {!deleteConfirmMode ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={ticking === deleteTarget.id}
                  onClick={() => setDeleteConfirmMode('day')}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-left hover:bg-amber-100 disabled:opacity-50"
                >
                  <span className="text-sm font-semibold text-amber-900">{deleteDayLabel}</span>
                  <span className="text-xs text-amber-800">
                    Only this occurrence is removed.
                  </span>
                </button>
                {elevated && (
                  <button
                    type="button"
                    disabled={ticking === deleteTarget.id}
                    onClick={() => setDeleteConfirmMode('whole')}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-left hover:bg-red-100 disabled:opacity-50"
                  >
                    <span className="text-sm font-semibold text-red-800">Delete whole task</span>
                    <span className="text-xs text-red-700">
                      Stops future repeats. Past history stays.
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteConfirmMode(null);
                  }}
                  className="btn-secondary w-full py-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {deleteConfirmMode === 'day'
                    ? `Remove this task for ${deleteTarget.periodKey}? Other dates stay.`
                    : 'Delete this recurring task? Today and future dates are removed; past history stays.'}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={ticking === deleteTarget.id}
                    onClick={() => setDeleteConfirmMode(null)}
                    className="btn-secondary flex-1 py-2"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={ticking === deleteTarget.id}
                    onClick={() => {
                      if (deleteConfirmMode === 'day') deleteForDayOnly(deleteTarget);
                      else deleteEntireTask(deleteTarget);
                    }}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50',
                      deleteConfirmMode === 'day' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
                    )}
                  >
                    {ticking === deleteTarget.id ? <Loader2 size={15} className="animate-spin" /> : null}
                    {deleteConfirmMode === 'day' ? 'Delete this occurrence' : 'Delete whole task'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


