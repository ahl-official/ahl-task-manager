'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, ChevronDown, Circle, MessageSquare, Loader2, MoreVertical, RotateCcw, Search, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate } from '@/lib/utils';
import { namesEqual, normalizePersonName } from '@/lib/utils/names';
import { indiaTodayKey } from '@/lib/utils/indiaDate';

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

function getWeekMonday(dateStr: string) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dateStr.slice(0, 10);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  const diff = (dow === 0 ? -6 : 1) - dow;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

type ChecklistCacheEntry = {
  rows: ChecklistRow[];
  elevated: boolean;
  isAdmin: boolean;
  currentUserName: string;
  currentUserId?: string;
  nextCursor: string | null;
};

const moduleChecklistCache: Record<string, ChecklistCacheEntry> = {};

export default function ChecklistClient({
  initialCategory = 'Daily',
  initialTaskId = '',
  initialDate = '',
}: {
  initialCategory?: ChecklistCategory;
  initialTaskId?: string;
  initialDate?: string;
}) {
  const [category, setCategory] = useState<ChecklistCategory>(initialCategory);
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [fetchingUserRows, setFetchingUserRows] = useState(false);
  const [ticking, setTicking] = useState<string | null>(null);
  const [search, setSearch] = useState(initialTaskId);
  const [department, setDepartment] = useState('');
  const [selectedIndividuals, setSelectedIndividuals] = useState<string[]>([]);
  const [individualDropdownOpen, setIndividualDropdownOpen] = useState(false);
  const [individualSearch, setIndividualSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [startDate, setStartDate] = useState(initialDate || indiaTodayKey());
  const [endDate, setEndDate] = useState(initialDate || indiaTodayKey());
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);
  const [batchDeleteMode, setBatchDeleteMode] = useState<'day' | 'whole' | null>(null);
  const [batchDeleteRemark, setBatchDeleteRemark] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeRemarkRow, setActiveRemarkRow] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [openMenuRowId, setOpenMenuRowId] = useState<string | null>(null);
  const [shiftTarget, setShiftTarget] = useState<ChecklistRow | null>(null);
  const [shiftTargetUid, setShiftTargetUid] = useState<string>('');
  const [isShifting, setIsShifting] = useState(false);
  const [allUsers, setAllUsers] = useState<{ uid: string; name: string; department: string }[]>([]);
  const fetchedChecklistKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data)) {
          setAllUsers(json.data.filter((u: any) => u.isActive !== false));
        }
      })
      .catch(() => { });

    const handleGlobalRefresh = () => {
      for (const k of Object.keys(moduleChecklistCache)) {
        delete moduleChecklistCache[k];
      }
      fetchedChecklistKeys.current.clear();
      searchedKeys.current.clear();
    };
    window.addEventListener('app-global-refresh', handleGlobalRefresh);
    return () => window.removeEventListener('app-global-refresh', handleGlobalRefresh);
  }, []);

  const categoryCache = useRef<Record<string, ChecklistCacheEntry>>(moduleChecklistCache);

  const updateCacheRows = (updater: (list: ChecklistRow[]) => ChecklistRow[], targetCategory?: string) => {
    for (const [key, entry] of Object.entries(categoryCache.current)) {
      if (!targetCategory || key.startsWith(`${targetCategory}:`)) {
        entry.rows = updater(entry.rows);
      }
    }
  };
  const pageSentinel = useRef<HTMLDivElement | null>(null);
  const selectedTaskRow = useRef<HTMLDivElement | null>(null);
  const selectedTaskFocused = useRef(false);
  const requestKey = useRef('');
  const pageInFlight = useRef(false);
  const searchedKeys = useRef(new Set<string>());

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
    for (const u of allUsers) {
      if (department && !namesEqual(u.department, department)) continue;
      const key = normalizePersonName(u.name);
      if (!key || seen.has(key)) continue;
      seen.set(key, u.name);
    }
    for (const row of rows) {
      if (department && !namesEqual(row.department, department)) continue;
      const key = normalizePersonName(row.userName);
      if (!key || seen.has(key)) continue;
      seen.set(key, row.userName);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [allUsers, rows, department]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const isTargetTask = (taskId: string) => Boolean(initialTaskId && taskId.toLowerCase() === initialTaskId.toLowerCase());

    const filtered = rows.filter(row => {
      let matchesDate = true;
      const rowDate = (row.dueDate || row.periodKey || '').slice(0, 10);
      if (startDate && endDate) {
        matchesDate = Boolean(rowDate && rowDate >= startDate && rowDate <= endDate);
      } else if (startDate) {
        matchesDate = Boolean(rowDate && rowDate >= startDate);
      } else if (endDate) {
        matchesDate = Boolean(rowDate && rowDate <= endDate);
      }

      // If this row is the targeted recurring task passed via initialTaskId, always match date
      if (isTargetTask(row.taskId)) {
        matchesDate = true;
      }

      const matchesMine = !mineOnly ||
        Boolean(row.mine) ||
        (Boolean(currentUserId) && Boolean(row.userId) && row.userId === currentUserId) ||
        namesEqual(row.userName, currentUserName);
      const matchesDept = !department || namesEqual(row.department, department);
      const matchesIndiv = selectedIndividuals.length === 0 ||
        selectedIndividuals.some(indiv => (
          namesEqual(row.userName, indiv) ||
          (Boolean(row.userName) && (
            row.userName.toLowerCase().startsWith(indiv.toLowerCase()) ||
            indiv.toLowerCase().startsWith(row.userName.toLowerCase())
          ))
        ));
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

    // Sort by periodKey descending (newest first) so past completions appear in order
    if (mineOnly || selectedIndividuals.length > 0 || (startDate && endDate && startDate !== endDate)) {
      return [...filtered].sort((a, b) => (b.periodKey || '').localeCompare(a.periodKey || ''));
    }
    return filtered;
  }, [rows, department, selectedIndividuals, startDate, endDate, mineOnly, currentUserName, currentUserId, search, initialTaskId]);
  const completedCount = useMemo(() => visibleRows.filter(row => row.completed).length, [visibleRows]);

  useEffect(() => {
    if (loading || selectedTaskFocused.current || !initialTaskId ||
      search.trim().toLowerCase() !== initialTaskId.toLowerCase() ||
      !visibleRows.some(row => row.taskId.toLowerCase() === initialTaskId.toLowerCase())) return;
    selectedTaskFocused.current = true;
    selectedTaskRow.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    selectedTaskRow.current?.focus({ preventScroll: true });
  }, [loading, visibleRows, initialTaskId, search]);

  useEffect(() => {
    if (!initialTaskId || loading) return;
    const found = rows.some(r => r.taskId.toLowerCase() === initialTaskId.toLowerCase());
    if (found) return;

    let active = true;
    const fetchTarget = async () => {
      try {
        const qs = new URLSearchParams({ category, search: initialTaskId });
        if (startDate) qs.set('date', startDate);
        const res = await fetch(`/api/checklist?${qs.toString()}`);
        const data = await res.json();
        if (active && data.success && Array.isArray(data.data) && data.data.length > 0) {
          setRows(current => {
            const byId = new Map(current.map(r => [r.id, r]));
            let changed = false;
            for (const r of data.data) {
              if (!byId.has(r.id)) {
                byId.set(r.id, r);
                changed = true;
              }
            }
            if (changed) {
              const merged = Array.from(byId.values());
              const activeCacheKey = `${category}:${startDate}_${endDate}`;
              if (categoryCache.current[activeCacheKey]) {
                categoryCache.current[activeCacheKey].rows = merged;
              } else {
                categoryCache.current[activeCacheKey] = {
                  rows: merged,
                  elevated,
                  isAdmin,
                  currentUserName,
                  currentUserId,
                  nextCursor: null,
                };
              }
              return merged;
            }
            return current;
          });
        }
      } catch (e) {
        console.error('Failed to load initial targeted task:', e);
      }
    };
    void fetchTarget();
    return () => { active = false; };
  }, [initialTaskId, loading, category, startDate, endDate, rows]);

  async function loadRows(
    nextCategory = category,
    nextStartDate = startDate,
    nextEndDate = endDate,
    forceRefresh = false,
    nextIndividuals = selectedIndividuals,
    nextMineOnly = mineOnly,
    nextDepartment = department,
  ) {
    const indivKey = nextIndividuals.length === 0 ? 'all' : nextIndividuals.slice().sort().join(',');
    const currentKey = `${category}:${startDate}_${endDate}:${mineOnly ? 'mine' : indivKey}:${department || 'all'}`;
    if (rows.length > 0) {
      if (categoryCache.current[currentKey]) {
        const byId = new Map(categoryCache.current[currentKey].rows.map(r => [r.id, r]));
        for (const r of rows) byId.set(r.id, r);
        categoryCache.current[currentKey].rows = Array.from(byId.values());
      } else {
        categoryCache.current[currentKey] = {
          rows,
          elevated,
          isAdmin,
          currentUserName,
          currentUserId,
          nextCursor,
        };
      }
    }

    const cacheKey = `${nextCategory}:${nextStartDate}_${nextEndDate}:${nextMineOnly ? 'mine' : indivKey}:${nextDepartment || 'all'}`;
    requestKey.current = cacheKey;
    if (forceRefresh) searchedKeys.current.clear();
    const cached = categoryCache.current[cacheKey];
    if (cached && !forceRefresh) {
      setRows(cached.rows);
      setElevated(cached.elevated);
      setIsAdmin(cached.isAdmin);
      setCurrentUserName(cached.currentUserName);
      if (cached.currentUserId) setCurrentUserId(cached.currentUserId);
      setNextCursor(cached.nextCursor);
      setLoading(false);
      return;
    }
    setLoading(true);
    setRows([]);
    setNextCursor(null);

    try {
      const qs = new URLSearchParams({ category: nextCategory });
      if (nextStartDate && nextEndDate) {
        if (nextStartDate === nextEndDate) {
          qs.set('date', nextStartDate);
          qs.set('exactDate', 'true');
          qs.set('startDate', nextStartDate);
          qs.set('endDate', nextEndDate);
        } else {
          qs.set('startDate', nextStartDate);
          qs.set('endDate', nextEndDate);
        }
      } else if (nextStartDate) {
        qs.set('date', nextStartDate);
        qs.set('exactDate', 'true');
      }
      if (nextMineOnly) {
        qs.set('mine', 'true');
      } else if (nextIndividuals.length === 1) {
        qs.set('userName', nextIndividuals[0]);
        const indivUser = allUsers.find(u => namesEqual(u.name, nextIndividuals[0]) || u.name.toLowerCase() === nextIndividuals[0].toLowerCase());
        if (indivUser?.uid) qs.set('assignedTo', indivUser.uid);
      } else if (nextIndividuals.length > 1) {
        qs.set('users', nextIndividuals.join(','));
      }
      if (nextDepartment) {
        qs.set('department', nextDepartment);
      }
      const res = await fetch(`/api/checklist?${qs.toString()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const elevatedVal = Boolean(data.meta?.elevated);
      const isAdminVal = Boolean(data.meta?.isAdmin);
      const userNameVal = String(data.meta?.currentUserName ?? '');
      const userIdVal = String(data.meta?.currentUserId ?? '');
      if (requestKey.current !== cacheKey) return;
      // Deduplicate: first by taskId+periodKey, then by description+periodKey+userId
      // to remove server-side duplicates (same task materialized multiple times)
      const seen = new Map<string, ChecklistRow>();
      const descSeen = new Map<string, string>(); // desc:period:uid -> taskId already added
      for (const row of (data.data as ChecklistRow[])) {
        const dk = `${row.taskId}:${row.periodKey}`;
        const contentKey = `${(row.description || '').slice(0, 80)}:${row.periodKey}:${row.userId}`;
        if (!seen.has(dk) && !descSeen.has(contentKey)) {
          seen.set(dk, row);
          descSeen.set(contentKey, row.taskId);
        }
      }
      const deduped = Array.from(seen.values());
      categoryCache.current[cacheKey] = {
        rows: deduped,
        elevated: elevatedVal,
        isAdmin: isAdminVal,
        currentUserName: userNameVal,
        currentUserId: userIdVal,
        nextCursor: data.meta?.nextCursor || null,
      };
      setRows(deduped);
      setNextCursor(data.meta?.nextCursor || null);
      setElevated(elevatedVal);
      setIsAdmin(isAdminVal);
      setCurrentUserName(userNameVal);
      setCurrentUserId(userIdVal);
    } catch (err: any) {
      if (!cached) toast.error(err.message ?? 'Failed to load checklist');
    } finally {
      if (requestKey.current === cacheKey) setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || pageInFlight.current || loading || search.trim()) return;
    const indivKey = selectedIndividuals.length === 0 ? 'all' : selectedIndividuals.slice().sort().join(',');
    const cacheKey = `${category}:${startDate}_${endDate}:${mineOnly ? 'mine' : indivKey}:${department || 'all'}`;
    const cursor = nextCursor;
    pageInFlight.current = true;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ category, cursor });
      if (startDate && endDate) {
        if (startDate === endDate) {
          qs.set('date', startDate);
          qs.set('exactDate', 'true');
          qs.set('startDate', startDate);
          qs.set('endDate', endDate);
        } else {
          qs.set('startDate', startDate);
          qs.set('endDate', endDate);
        }
      } else if (startDate) {
        qs.set('date', startDate);
        qs.set('exactDate', 'true');
      }
      if (mineOnly) {
        qs.set('mine', 'true');
      } else if (selectedIndividuals.length === 1) {
        qs.set('userName', selectedIndividuals[0]);
      } else if (selectedIndividuals.length > 1) {
        qs.set('users', selectedIndividuals.join(','));
      }
      if (department) {
        qs.set('department', department);
      }
      const res = await fetch(`/api/checklist?${qs}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (requestKey.current !== cacheKey) return;
      const next = data.meta?.nextCursor || null;
      setNextCursor(next);
      setRows(current => {
        // Deduplicate by taskId+periodKey AND description+period+userId across pages
        const seen = new Map<string, ChecklistRow>();
        const descSeen = new Map<string, string>();
        for (const row of current) {
          seen.set(`${row.taskId}:${row.periodKey}`, row);
          descSeen.set(`${(row.description || '').slice(0, 80)}:${row.periodKey}:${row.userId}`, row.taskId);
        }
        let changed = false;
        for (const row of (data.data as ChecklistRow[])) {
          const dk = `${row.taskId}:${row.periodKey}`;
          const ck = `${(row.description || '').slice(0, 80)}:${row.periodKey}:${row.userId}`;
          if (!seen.has(dk) && !descSeen.has(ck)) {
            seen.set(dk, row);
            descSeen.set(ck, row.taskId);
            changed = true;
          }
        }
        const merged = Array.from(seen.values());
        if (changed) {
          categoryCache.current[cacheKey] = { rows: merged, elevated, isAdmin, currentUserName, nextCursor: next };
        }
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
    if (row.dead) return;
    const rowDate = (row.dueDate || row.periodKey || '').slice(0, 10);
    const today = indiaTodayKey();
    if (rowDate && rowDate > today) {
      toast.error('Cannot complete future checklist tasks before their scheduled date');
      return;
    }
    const action = 'complete';
    const nextStatus = 'Completed' as const;

    // Optimistic UI update for 0ms instant feedback
    const prevRows = rows;
    const updatedRows = (list: ChecklistRow[]) => list.map(item => item.id === row.id
      ? { ...item, completed: true, completedAt: item.completedAt || new Date().toISOString(), status: nextStatus, canComplete: false, canUncomplete: true }
      : item);

    setRows(updatedRows);
    updateCacheRows(updatedRows, row.category);
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
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const serverStatus = (data.data.status === 'Verified' ? 'Completed' : data.data.status) || nextStatus;
      const serverUpdated = (list: ChecklistRow[]) => list.map(item => item.id === row.id
        ? { ...item, completed: true, completedAt: data.data.completedAt, status: serverStatus, canComplete: false, canUncomplete: true }
        : item);
      setRows(serverUpdated);
      updateCacheRows(serverUpdated, row.category);
      toast.success('Checklist task marked complete');
    } catch (err: any) {
      setRows(prevRows); // Rollback on failure
      updateCacheRows(() => prevRows, row.category);
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
    updateCacheRows(updatedRows, row.category);
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
      updateCacheRows(() => prevRows, row.category);
      toast.error(err.message ?? 'Failed to undo completion');
    } finally {
      setTicking(null);
    }
  }

  async function submitAction(row: ChecklistRow, action: 'remark' = 'remark') {
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
        remark: data.data.remark,
        remarkBy: data.data.remarkBy,
        status: item.completed ? ('Completed' as const) : ('Pending' as const),
      } : item);
      setRows(updated);
      updateCacheRows(updated, row.category);
      setRemark('');
      setActiveRemarkRow(null);
      toast.success('Remark added');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update checklist task');
    } finally {
      setTicking(null);
    }
  }

  async function handleBatchDelete(mode: 'day' | 'whole') {
    const selectedRows = visibleRows.filter(r => selectedRowIds.has(r.id));
    if (selectedRows.length === 0) return;
    const ids = selectedRows.map(r => r.id);
    const templateIds = Array.from(new Set(selectedRows.map(r => r.taskId)));

    setIsDeleting(true);
    try {
      const res = await fetch('/api/checklist/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          ids,
          templateIds,
          remark: batchDeleteRemark.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (mode === 'day') {
        const idSet = new Set(ids);
        setRows(prev => prev.filter(r => !idSet.has(r.id)));
        for (const key of Object.keys(categoryCache.current)) {
          categoryCache.current[key].rows = categoryCache.current[key].rows.filter(r => !idSet.has(r.id));
        }
        toast.success(`Hard deleted ${ids.length} occurrence(s)`);
      } else {
        const templateSet = new Set(templateIds);
        setRows(prev => prev.filter(r => !templateSet.has(r.taskId)));
        for (const key of Object.keys(categoryCache.current)) {
          categoryCache.current[key].rows = categoryCache.current[key].rows.filter(r => !templateSet.has(r.taskId));
        }
        toast.success(`Hard deleted ${templateIds.length} recurring task(s)`);
      }

      setSelectedRowIds(new Set());
      setBatchDeleteModalOpen(false);
      setBatchDeleteMode(null);
      setBatchDeleteRemark('');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete task(s)');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleShiftTask() {
    if (!shiftTarget || !shiftTargetUid) return;
    setIsShifting(true);
    try {
      const templateId = shiftTarget.taskId;
      const targetUser = allUsers.find(u => u.uid === shiftTargetUid);
      const res = await fetch(`/api/recurring/templates/${encodeURIComponent(templateId)}/shift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUid: shiftTargetUid }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const newName = targetUser?.name || shiftTargetUid;
      const newDept = targetUser?.department || shiftTarget.department;

      const today = indiaTodayKey();
      setRows(prev => prev.map(r => {
        if (r.taskId === templateId && !r.completed && r.periodKey >= today) {
          return { ...r, userId: shiftTargetUid, userName: newName, department: newDept };
        }
        return r;
      }));

      for (const key of Object.keys(categoryCache.current)) {
        categoryCache.current[key].rows = categoryCache.current[key].rows.map(r => {
          if (r.taskId === templateId && !r.completed && r.periodKey >= today) {
            return { ...r, userId: shiftTargetUid, userName: newName, department: newDept };
          }
          return r;
        });
      }

      toast.success(`Task shifted to ${newName}`);
      setShiftTarget(null);
      setShiftTargetUid('');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to shift recurring task');
    } finally {
      setIsShifting(false);
    }
  }

  useEffect(() => {
    void loadRows(category, startDate, endDate, false, selectedIndividuals, mineOnly, department);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, startDate, endDate, selectedIndividuals, mineOnly, department]);

  useEffect(() => {
    const handleGlobalRefresh = (e: any) => {
      const scope = e?.detail?.scope;
      if (!scope || scope === 'checklist' || scope === 'all') {
        categoryCache.current = {};
        searchedKeys.current.clear();
        void loadRows(category, startDate, endDate, true, selectedIndividuals, mineOnly, department);
      }
    };
    window.addEventListener('app-global-refresh', handleGlobalRefresh);
    return () => window.removeEventListener('app-global-refresh', handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, startDate, endDate, selectedIndividuals, mineOnly, department]);

  useEffect(() => {
    if (!nextCursor || loading || loadingMore || search.trim() || !pageSentinel.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) void loadMore();
    }, { rootMargin: '250px' });
    observer.observe(pageSentinel.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loading, loadingMore, search, category, startDate, endDate]);

  useEffect(() => {
    const query = search.trim();
    const exactSelectedTaskLoaded = initialTaskId && query.toLowerCase() === initialTaskId.toLowerCase()
      ? visibleRows.some(row => row.taskId.toLowerCase() === initialTaskId.toLowerCase())
      : false;
    if (loading || query.length < 2 || (initialTaskId && query.toLowerCase() === initialTaskId.toLowerCase()
      ? exactSelectedTaskLoaded : visibleRows.length > 0)) {
      setSearching(false);
      return;
    }
    const lookupKey = `${category}:${startDate}_${endDate}:${query.toLowerCase()}`;
    if (searchedKeys.current.has(lookupKey)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      searchedKeys.current.add(lookupKey);
      setSearching(true);
      try {
        const qs = new URLSearchParams({ category, search: query });
        if (startDate && endDate) {
          if (startDate === endDate) {
            qs.set('date', startDate);
            qs.set('exactDate', 'true');
            qs.set('startDate', startDate);
            qs.set('endDate', endDate);
          } else {
            qs.set('startDate', startDate);
            qs.set('endDate', endDate);
          }
        } else if (startDate) {
          qs.set('date', startDate);
          qs.set('exactDate', 'true');
        }
        const res = await fetch(`/api/checklist?${qs}`, { signal: controller.signal });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        if (controller.signal.aborted) return;
        if (requestKey.current !== `${category}:${startDate}_${endDate}`) return;
        setRows(current => {
          const byId = new Map(current.map(row => [row.id, row]));
          let changed = false;
          for (const row of (data.data || [])) {
            if (!byId.has(row.id)) {
              byId.set(row.id, row);
              changed = true;
            }
          }
          if (changed) {
            const merged = Array.from(byId.values());
            const activeCacheKey = `${category}:${startDate}_${endDate}`;
            if (categoryCache.current[activeCacheKey]) {
              categoryCache.current[activeCacheKey].rows = merged;
            } else {
              categoryCache.current[activeCacheKey] = {
                rows: merged,
                elevated,
                isAdmin,
                currentUserName,
                currentUserId,
                nextCursor: null,
              };
            }
            return merged;
          }
          return current;
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
  }, [search, category, startDate, endDate, loading, visibleRows, initialTaskId]);

  const selectedRowsForDelete = useMemo(() => {
    return rows.filter(r => selectedRowIds.has(r.id));
  }, [rows, selectedRowIds]);

  const uniqueTemplatesForDelete = useMemo(() => {
    return Array.from(new Set(selectedRowsForDelete.map(r => r.taskId)));
  }, [selectedRowsForDelete]);

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
                const next = !mineOnly;
                setMineOnly(next);
                if (next) setSelectedIndividuals([]);
                setSelectedRowIds(new Set());
                void loadRows(category, startDate, endDate, false, [], next, department);
              }}
              className={cn('btn-secondary py-2 flex items-center gap-1.5', mineOnly && 'bg-brand-50 text-brand-700 border-brand-200')}
            >
              <span>{mineOnly ? 'Showing my tasks' : 'Show my tasks'}</span>
            </button>
          )}
          <select
            value={category}
            onChange={e => {
              const nextCat = e.target.value as ChecklistCategory;
              setCategory(nextCat);
              setSelectedRowIds(new Set());
              void loadRows(nextCat, startDate, endDate, false, selectedIndividuals, mineOnly, department);
            }}
            className="input w-auto py-2 text-sm"
          >
            {CATEGORY_OPTIONS.map(option => (
              <option key={option} value={option}>{option} Tasks</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadRows(category, startDate, endDate, true, selectedIndividuals, mineOnly, department)}
            className="btn-secondary py-2 px-3 text-sm flex items-center gap-1"
            title="Refresh from server"
          >
            <RotateCcw size={14} className={cn(loading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
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

        <div className={cn('grid gap-3', elevated ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2')}>
          {elevated && (
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-500">Department</span>
              <select
                value={department}
                onChange={event => {
                  const nextDept = event.target.value;
                  setDepartment(nextDept);
                  setSelectedRowIds(new Set());
                  void loadRows(category, startDate, endDate, false, selectedIndividuals, mineOnly, nextDept);
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
            <span className="text-xs font-medium text-gray-500">From Date</span>
            <input
              type="date"
              value={startDate}
              onChange={event => {
                const nextDate = event.target.value;
                setStartDate(nextDate);
                setEndDate(nextDate); // Apply to second date as well
                setSelectedRowIds(new Set());
                void loadRows(category, nextDate, nextDate, false, selectedIndividuals, mineOnly, department);
              }}
              className="input w-full py-2 text-sm"
            />
          </label>

          <label className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">To Date</span>
              {(startDate !== indiaTodayKey() || endDate !== indiaTodayKey()) && (
                <button
                  type="button"
                  onClick={() => {
                    const today = indiaTodayKey();
                    setStartDate(today);
                    setEndDate(today);
                    setSelectedRowIds(new Set());
                    void loadRows(category, today, today, false, selectedIndividuals, mineOnly, department);
                  }}
                  className="text-[11px] text-brand-600 hover:text-brand-700 font-medium"
                >
                  Reset Today
                </button>
              )}
            </div>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={event => {
                const nextDate = event.target.value;
                setEndDate(nextDate);
                setSelectedRowIds(new Set());
                void loadRows(category, startDate, nextDate, false, selectedIndividuals, mineOnly, department);
              }}
              className="input w-full py-2 text-sm"
            />
          </label>

          {elevated && (
            <div className="relative space-y-1">
              <span className="text-xs font-medium text-gray-500">Individuals</span>
              <button
                type="button"
                onClick={() => setIndividualDropdownOpen(prev => !prev)}
                className="input flex w-full items-center justify-between py-2 text-sm text-left bg-white"
                disabled={loading || individuals.length === 0}
              >
                <span className="truncate">
                  {selectedIndividuals.length === 0
                    ? 'All individuals'
                    : selectedIndividuals.length === 1
                      ? selectedIndividuals[0]
                      : `${selectedIndividuals.length} individuals selected`}
                </span>
                <ChevronDown size={14} className="text-gray-400 shrink-0 ml-1" />
              </button>

              {individualDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIndividualDropdownOpen(false)}
                  />
                  <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2 px-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIndividuals([...individuals]);
                          setMineOnly(false);
                          setSelectedRowIds(new Set());
                          void loadRows(category, startDate, endDate, false, [...individuals], false, department);
                        }}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIndividuals([]);
                          setSelectedRowIds(new Set());
                          void loadRows(category, startDate, endDate, false, [], false, department);
                        }}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="mb-2">
                      <input
                        type="text"
                        value={individualSearch}
                        onChange={e => setIndividualSearch(e.target.value)}
                        placeholder="Search individual..."
                        className="input w-full py-1 text-xs"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {individuals
                        .filter(name => !individualSearch.trim() || name.toLowerCase().includes(individualSearch.toLowerCase()))
                        .map(name => {
                          const isChecked = selectedIndividuals.includes(name);
                          return (
                            <label
                              key={name}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-xs text-gray-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  let next: string[];
                                  if (isChecked) {
                                    next = selectedIndividuals.filter(n => n !== name);
                                  } else {
                                    next = [...selectedIndividuals, name];
                                  }
                                  setSelectedIndividuals(next);
                                  setMineOnly(false);
                                  setSelectedRowIds(new Set());
                                  void loadRows(category, startDate, endDate, false, next, false, department);
                                }}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="truncate">{name}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
            </div>
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

      <div className="card overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            Loading checklist...
          </div>
        )}

        {!loading && visibleRows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            {searching ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin text-brand-600" />
                <span>Searching checklist on server...</span>
              </div>
            ) : fetchingUserRows ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin text-brand-600" />
                <span>{mineOnly ? 'Loading your checklist tasks...' : selectedIndividuals.length ? `Loading checklist tasks for ${selectedIndividuals.join(', ')}...` : 'Loading checklist tasks...'}</span>
              </div>
            ) : initialTaskId && search === initialTaskId
              ? 'This recurring task is not scheduled for the selected date.'
              : mineOnly
                ? `You have no ${category.toLowerCase()} checklist tasks scheduled${startDate ? ' for this date' : ''}.`
                : selectedIndividuals.length
                  ? `No ${category.toLowerCase()} checklist tasks found for ${selectedIndividuals.join(', ')}${startDate ? ' on this date' : ''}.`
                  : `No ${category.toLowerCase()} checklist tasks match these filters.`}
          </div>
        )}

        {!loading && visibleRows.length > 0 && (
          <div>
            {isAdmin && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50/90 px-5 py-2.5 text-xs text-gray-600">
                <label className="flex items-center gap-2 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedRowIds.size > 0 && selectedRowIds.size === visibleRows.length}
                    ref={el => {
                      if (el) el.indeterminate = selectedRowIds.size > 0 && selectedRowIds.size < visibleRows.length;
                    }}
                    onChange={() => {
                      if (selectedRowIds.size === visibleRows.length) {
                        setSelectedRowIds(new Set());
                      } else {
                        setSelectedRowIds(new Set(visibleRows.map(r => r.id)));
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                  />
                  <span>Select all ({visibleRows.length})</span>
                </label>

                {selectedRowIds.size > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800">
                      {selectedRowIds.size} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setBatchDeleteMode(null);
                        setBatchDeleteModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition cursor-pointer"
                    >
                      <Trash2 size={13} />
                      Delete selected ({selectedRowIds.size})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRowIds(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-700 underline cursor-pointer"
                    >
                      Clear selection
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="divide-y divide-gray-50">
            {visibleRows.map(row => (
              <div
                key={row.id}
                ref={row.taskId.toLowerCase() === initialTaskId.toLowerCase() ? selectedTaskRow : undefined}
                tabIndex={row.taskId.toLowerCase() === initialTaskId.toLowerCase() ? -1 : undefined}
                className={cn('flex flex-col gap-3 px-5 py-4', row.dead && 'bg-red-50',
                  row.taskId.toLowerCase() === initialTaskId.toLowerCase() && 'bg-brand-50 ring-2 ring-inset ring-brand-400')}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {isAdmin && (
                      <div className="pt-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRowIds.has(row.id)}
                          onChange={() => {
                            setSelectedRowIds(prev => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          title="Select task"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-brand-600">{row.taskId}</span>
                      {row.taskId.toLowerCase() === initialTaskId.toLowerCase() &&
                        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">Selected task</span>}
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{row.label}</span>
                      <span className={cn(
                        'badge text-[10px]',
                        (row.completed || row.status === 'Verified') ? 'bg-green-100 text-green-700' :
                          row.dead ? 'bg-red-600 text-white' :
                            'bg-amber-100 text-amber-700'
                      )}>
                        {row.status === 'Verified' ? 'Completed' : row.status}
                      </span>
                      {row.mine && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">Mine</span>}
                      {row.isPast && !row.completed && !row.dead && (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">Past</span>
                      )}
                      {(row as any).isFuture && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">Upcoming</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{row.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span>Period: {row.periodKey}</span>
                      <span>Due: {formatDate(row.dueDate)}</span>
                      <span>{row.userName}{row.department ? ` · ${row.department}` : ''}</span>
                    </div>
                    {row.remark && (
                      <div className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase text-gray-400">
                          Remarks {row.remarkBy ? `• ${row.remarkBy}` : ''}
                        </p>
                        <p className="whitespace-pre-line text-xs text-gray-700">{row.remark}</p>
                      </div>
                    )}
                  </div>
                </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Standalone completion indicator always visible */}
                    <span
                      title={row.completed ? 'Completed' : 'Not yet completed'}
                      className={cn(
                        'flex items-center justify-center rounded-full',
                        row.completed ? 'text-green-500' : 'text-gray-300'
                      )}
                    >
                      {ticking === row.id
                        ? <Loader2 size={22} className="animate-spin text-brand-400" />
                        : row.completed
                        ? <CheckCircle2 size={22} />
                        : <Circle size={22} />}
                    </span>
                    {!row.dead && !row.completed && (row.canComplete || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => tick(row)}
                        disabled={ticking === row.id}
                        className={cn(
                          'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white cursor-pointer transition-colors disabled:opacity-50',
                          row.isPast ? 'bg-amber-600 hover:bg-amber-700' : 'bg-brand-600 hover:bg-brand-700'
                        )}
                        title={row.isPast ? 'Complete past task (will be recorded as Late)' : 'Mark task complete'}
                      >
                        {row.isPast ? 'Mark Complete (Late)' : 'Mark Complete'}
                      </button>
                    )}
                    {!row.dead && row.completed && (
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium',
                        (row as any).isOnTime === false || ((row as any).isPast && row.completedAt && (row as any).dueDate && row.completedAt.slice(0, 10) > (row as any).dueDate.slice(0, 10))
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-green-200 bg-green-50 text-green-700'
                      )}>
                        <CheckCircle2 size={14} />
                        {(row as any).isOnTime === false ? 'Completed (Late)' : 'Completed'}
                      </span>
                    )}
                    {!row.dead && !row.completed && !row.canComplete && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500"
                      >
                        {(row as any).isFuture ? 'Upcoming' : row.userName}
                      </span>
                    )}
                    {row.completed && !row.dead && row.canUncomplete && (
                      <button
                        type="button"
                        onClick={() => uncomplete(row)}
                        disabled={ticking === row.id}
                        title="Undo accidental complete"
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {ticking === row.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                        Undo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRemarkRow(activeRemarkRow === row.id ? null : row.id);
                        setRemark('');
                      }}
                      className="btn-secondary px-3 py-2"
                      title="Add remark"
                    >
                      <MessageSquare size={15} />
                      Remark
                    </button>
                    {isAdmin && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenMenuRowId(openMenuRowId === row.id ? null : row.id)}
                          disabled={ticking === row.id}
                          className="btn-secondary px-2.5 py-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition"
                          title="More options"
                        >
                          <MoreVertical size={15} />
                        </button>
                        {openMenuRowId === row.id && (
                          <>
                            <div
                              className="fixed inset-0 z-20"
                              onClick={() => setOpenMenuRowId(null)}
                            />
                            <div className="absolute right-0 top-full mt-1 z-30 w-36 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuRowId(null);
                                  setShiftTarget(row);
                                  setShiftTargetUid('');
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-brand-600 transition"
                              >
                                <ArrowRightLeft size={14} className="text-gray-400" />
                                Shift task
                              </button>
                            </div>
                          </>
                        )}
                      </div>
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
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
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

      {isAdmin && shiftTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Shift Recurring Task</h2>
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">{shiftTarget.description}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {shiftTarget.category} · Current assignee: <span className="font-medium text-gray-700">{shiftTarget.userName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShiftTarget(null);
                  setShiftTargetUid('');
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Choose user to shift to:
                </label>
                <select
                  value={shiftTargetUid}
                  onChange={e => setShiftTargetUid(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Select a user...</option>
                  {allUsers
                    .filter(u => u.uid !== shiftTarget.userId)
                    .map(u => (
                      <option key={u.uid} value={u.uid}>
                        {u.name} {u.department ? `(${u.department})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div className="rounded-md border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-800 space-y-1">
                <p className="font-medium">What will change:</p>
                <p>• Today&apos;s uncompleted task and upcoming dates will be assigned to the new user.</p>
                <p>• Next month&apos;s recurring rows will be appended for the new user automatically.</p>
                <p>• Past completed history stays credited to {shiftTarget.userName}.</p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  disabled={isShifting}
                  onClick={() => {
                    setShiftTarget(null);
                    setShiftTargetUid('');
                  }}
                  className="btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!shiftTargetUid || isShifting}
                  onClick={handleShiftTask}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {isShifting ? <Loader2 size={15} className="animate-spin" /> : null}
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdmin && batchDeleteModalOpen && selectedRowsForDelete.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {batchDeleteMode ? 'Confirm permanent deletion' : `Delete ${selectedRowsForDelete.length === 1 ? 'checklist task' : `${selectedRowsForDelete.length} checklist tasks`}`}
                </h2>
                {selectedRowsForDelete.length === 1 ? (
                  <>
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">{selectedRowsForDelete[0].description}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {selectedRowsForDelete[0].userName} · {selectedRowsForDelete[0].periodKey}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    {selectedRowsForDelete.length} occurrences selected across {uniqueTemplatesForDelete.length} recurring template(s)
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setBatchDeleteModalOpen(false);
                  setBatchDeleteMode(null);
                  setBatchDeleteRemark('');
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            {!batchDeleteMode ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setBatchDeleteMode('day')}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-left hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                >
                  <span className="text-sm font-semibold text-amber-900">
                    {selectedRowsForDelete.length === 1
                      ? (selectedRowsForDelete[0].category === 'Daily' && selectedRowsForDelete[0].periodKey === indiaTodayKey() ? "Delete today's task" : "Delete this occurrence")
                      : `Delete selected day occurrences (${selectedRowsForDelete.length})`}
                  </span>
                  <span className="text-xs text-amber-800">
                    Hard deletes only these selected occurrence(s). Other dates stay.
                  </span>
                </button>
                {elevated && (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setBatchDeleteMode('whole')}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-left hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                  >
                    <span className="text-sm font-semibold text-red-800">
                      {uniqueTemplatesForDelete.length === 1 ? 'Delete whole recurring task' : `Delete whole recurring tasks (${uniqueTemplatesForDelete.length})`}
                    </span>
                    <span className="text-xs text-red-700">
                      Hard deletes the recurring templates and future dates. Past history stays.
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setBatchDeleteModalOpen(false);
                    setBatchDeleteMode(null);
                    setBatchDeleteRemark('');
                  }}
                  className="btn-secondary w-full py-2 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {batchDeleteMode === 'day'
                    ? `Are you sure you want to permanently hard delete ${selectedRowsForDelete.length} selected occurrence(s)? This action cannot be undone.`
                    : `Are you sure you want to permanently delete ${uniqueTemplatesForDelete.length} recurring template(s) and their future occurrences? Past history stays.`}
                </p>
                <div>
                  <label className="label text-gray-700">Reason / Remark (optional)</label>
                  <input
                    type="text"
                    value={batchDeleteRemark}
                    onChange={e => setBatchDeleteRemark(e.target.value)}
                    placeholder="e.g. Staff on leave / absent, Salon weekly off..."
                    className="input text-xs"
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setBatchDeleteMode(null)}
                    className="btn-secondary flex-1 py-2 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleBatchDelete(batchDeleteMode)}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50 cursor-pointer',
                      batchDeleteMode === 'day' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
                    )}
                  >
                    {isDeleting ? <Loader2 size={15} className="animate-spin" /> : null}
                    {batchDeleteMode === 'day'
                      ? `Delete ${selectedRowsForDelete.length} occurrence(s)`
                      : `Delete ${uniqueTemplatesForDelete.length} whole task(s)`}
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


