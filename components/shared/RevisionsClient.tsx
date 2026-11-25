'use client';

import { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, Calendar, User, Loader2, AlertOctagon, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate, STATUS_COLORS } from '@/lib/utils';
import type { TaskSerialized } from '@/types';

interface Props {
  revisions: any[];
  tasks: TaskSerialized[];
  role: 'admin' | 'user';
  currentUid?: string;
}

export default function RevisionsClient({ revisions, tasks, role, currentUid }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  const taskMap = useMemo(() => Object.fromEntries(tasks.map(t => [t.taskId, t])), [tasks]);

  // Sort revisions: Pending first, then resolved (approved/rejected).
  // Within each group, sort by createdAt descending (newest first).
  const sortedRevisions = useMemo(() => {
    return [...revisions].sort((a, b) => {
      const isPendingA = a.status === 'pending' ? 0 : 1;
      const isPendingB = b.status === 'pending' ? 0 : 1;
      if (isPendingA !== isPendingB) return isPendingA - isPendingB;

      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [revisions]);

  // Counts for tabs
  const pendingCount = useMemo(() => revisions.filter(r => r.status === 'pending').length, [revisions]);
  const resolvedCount = useMemo(() => revisions.filter(r => r.status !== 'pending').length, [revisions]);

  // Filter by search query (task ID, task description, requester, reason) and status tab
  const filteredRevisions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedRevisions.filter(rev => {
      // Status tab filter
      if (statusFilter === 'pending' && rev.status !== 'pending') return false;
      if (statusFilter === 'resolved' && rev.status === 'pending') return false;

      // Search query filter
      if (!q) return true;
      const task = taskMap[rev.taskId];
      const matchId = (rev.taskId || '').toLowerCase().includes(q);
      const matchDesc = (task?.description || '').toLowerCase().includes(q);
      const matchRequester = (rev.requestedByName || '').toLowerCase().includes(q);
      const matchReason = (rev.reason || '').toLowerCase().includes(q);
      return matchId || matchDesc || matchRequester || matchReason;
    });
  }, [sortedRevisions, search, statusFilter, taskMap]);

  // Separate pending and resolved for clear visual grouping when viewing "all"
  const pendingItems = useMemo(() => filteredRevisions.filter(r => r.status === 'pending'), [filteredRevisions]);
  const resolvedItems = useMemo(() => filteredRevisions.filter(r => r.status !== 'pending'), [filteredRevisions]);

  async function decide(revisionId: string, taskId: string, decision: 'approved' | 'rejected') {
    setLoading(revisionId + decision);
    try {
      const res = await fetch('/api/revisions', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ revisionId, decision, taskId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(decision === 'approved' ? 'Request approved successfully' : 'Request rejected');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed');
    } finally {
      setLoading(null);
    }
  }

  function renderRevisionCard(rev: any) {
    const task = taskMap[rev.taskId];
    const isDeadRequest = rev.type === 'dead' || task?.status === 'Dead Requested';
    const isDueDateRequest = rev.type === 'due_date' || (task?.notes && task.notes.includes('DUE DATE APPROVAL REQUESTED'));
    const canDecide = rev.status === 'pending' && (
      (isDeadRequest || isDueDateRequest) ? role === 'admin' : (role === 'admin' || task?.handoffUid === currentUid)
    );

    return (
      <div
        key={rev.id}
        className={cn(
          'card p-4 sm:p-5 transition-all shadow-xs hover:shadow-card',
          rev.status === 'pending' ? 'border-amber-200 bg-white ring-1 ring-amber-100' : 'border-gray-100 bg-gray-50/60',
          isDeadRequest && rev.status === 'pending' && 'border-rose-200 ring-rose-100'
        )}
      >
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="flex-1 space-y-2 min-w-0">
            {/* Task info & Type Badge */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-mono text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md font-semibold shrink-0">
                {rev.taskId}
              </span>
              {isDeadRequest ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200 shrink-0">
                  <AlertOctagon size={11} /> Dead Approval Request
                </span>
              ) : isDueDateRequest ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200 shrink-0">
                  <Calendar size={11} /> Due Date Delay (&gt; 10 Days)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200 shrink-0">
                  <Calendar size={11} /> Due Date Delay
                </span>
              )}
              {task && (
                <span className={cn('badge text-[11px] shrink-0', STATUS_COLORS[task.status])}>
                  {task.status}
                </span>
              )}
            </div>

            {task && (
              <p className="text-sm font-medium text-gray-900 leading-snug break-words">{task.description}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <User size={12} className="shrink-0 text-gray-400" />
                <span>Requested by <strong className="text-gray-700">{rev.requestedByName}</strong></span>
              </div>
              {isDeadRequest ? (
                <div className="flex items-center gap-1.5">
                  <AlertOctagon size={12} className="text-rose-500 shrink-0" />
                  <span>Action requested: <strong className="text-rose-700">Flag Task Dead</strong></span>
                </div>
              ) : isDueDateRequest ? (
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="shrink-0 text-gray-400" />
                  <span>Requested date: <strong className="text-gray-700">{formatDate(rev.requestedDate)}</strong></span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="shrink-0 text-gray-400" />
                  <span>New date: <strong className="text-gray-700">{formatDate(rev.requestedDate)}</strong></span>
                </div>
              )}

              {/* Initial due date request: show task assigned date */}
              {isDueDateRequest && task && (
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="shrink-0 text-gray-400" />
                  <span>Task assigned date: <strong className="text-gray-700">{formatDate(task.createdAt || task.dayKey || rev.createdAt)}</strong></span>
                </div>
              )}

              {/* Regular delay requests: show current due if distinct */}
              {task && !isDueDateRequest && task.endDate && formatDate(task.endDate) !== formatDate(rev.requestedDate) && (
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="shrink-0 text-gray-400" />
                  <span>Current due: <strong className="text-gray-700">{formatDate(task.endDate)}</strong></span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span>Submitted: {formatDate(rev.createdAt)}</span>
              </div>
            </div>

            <div className={cn('rounded-lg p-3', isDeadRequest ? 'bg-rose-50/70 border border-rose-100' : 'bg-orange-50/80')}>
              <p className={cn('text-xs font-semibold mb-0.5', isDeadRequest ? 'text-rose-900' : 'text-orange-800')}>
                {isDeadRequest ? 'Remark / Reason for Dead' : 'Reason'}
              </p>
              <p className={cn('text-sm break-words', isDeadRequest ? 'text-rose-800' : 'text-orange-700')}>{rev.reason}</p>
            </div>
          </div>

          {/* Actions */}
          {canDecide && (
            <div className="flex flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => decide(rev.id, rev.taskId, 'approved')}
                disabled={!!loading}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:py-2 bg-green-600 text-white rounded-xl text-xs font-medium hover:bg-green-700 disabled:opacity-60 transition-colors shadow-xs"
              >
                {loading === rev.id + 'approved'
                  ? <Loader2 size={12} className="animate-spin" />
                  : <CheckCircle2 size={13} />
                }
                {isDeadRequest ? 'Approve Dead' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => decide(rev.id, rev.taskId, 'rejected')}
                disabled={!!loading}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-medium hover:bg-red-100 disabled:opacity-60 transition-colors shadow-xs"
              >
                {loading === rev.id + 'rejected'
                  ? <Loader2 size={12} className="animate-spin" />
                  : <XCircle size={13} />
                }
                Reject
              </button>
            </div>
          )}

          {!canDecide && (
            <div className="shrink-0 flex items-center">
              {rev.status === 'pending' && isDeadRequest && role !== 'admin' ? (
                <span className="badge text-xs bg-amber-100 text-amber-800 border border-amber-200">
                  Pending Admin Approval
                </span>
              ) : (
                <span className={cn('badge text-xs',
                  rev.status === 'approved' ? 'bg-green-100 text-green-700' :
                  rev.status === 'pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                  'bg-red-100 text-red-700'
                )}>
                  {rev.status === 'pending' ? 'Pending Approval' : rev.status === 'approved' ? 'Approved' : 'Rejected'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (revisions.length === 0) {
    return (
      <div className="card p-12 text-center">
        <CheckCircle2 size={40} className="mx-auto text-green-400 mb-3" />
        <p className="text-gray-500 font-medium">No revision requests</p>
        <p className="text-sm text-gray-400 mt-1">All clear!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Bar & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by task ID or task name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm border border-gray-200 rounded-xl bg-white shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 shrink-0 bg-gray-100/80 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
              statusFilter === 'all'
                ? 'bg-white text-gray-900 shadow-2xs'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            All ({revisions.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all inline-flex items-center gap-1.5',
              statusFilter === 'pending'
                ? 'bg-amber-500 text-white shadow-2xs'
                : 'text-amber-800 hover:bg-amber-50'
            )}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('resolved')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
              statusFilter === 'resolved'
                ? 'bg-white text-gray-900 shadow-2xs'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            Resolved ({resolvedCount})
          </button>
        </div>
      </div>

      {/* No search matches */}
      {filteredRevisions.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-gray-600 font-medium">No revision requests found</p>
          <p className="text-xs text-gray-400 mt-1">
            {search ? `No matches for "${search}"` : 'No items match the selected filter'}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition"
            >
              Clear search
            </button>
          )}
        </div>
      ) : statusFilter === 'all' ? (
        /* When "All" is active, render Pending Approval at top with a distinct header, then Resolved below */
        <div className="space-y-6">
          {pendingItems.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Pending Approval ({pendingItems.length})
                </h3>
              </div>
              <div className="space-y-3">
                {pendingItems.map(renderRevisionCard)}
              </div>
            </div>
          )}

          {resolvedItems.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 px-1 pt-2 border-t border-gray-100">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Approved & Rejected ({resolvedItems.length})
                </h3>
              </div>
              <div className="space-y-3">
                {resolvedItems.map(renderRevisionCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* When filtered to specific tab (Pending or Resolved) */
        <div className="space-y-3">
          {filteredRevisions.map(renderRevisionCard)}
        </div>
      )}
    </div>
  );
}
