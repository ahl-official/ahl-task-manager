'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, CheckSquare, Loader2, Square, X } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import TaskModal from '@/components/shared/TaskModal';
import { toast } from 'sonner';
import type { TaskSerialized } from '@/types';

const STALE_THRESHOLD_MS = 5 * 60_000;

function isPortalTask(task: TaskSerialized) {
  return task.createdBy !== 'timely-sheet' && !/^(office|salon|weekly)-/i.test(task.taskId);
}

export default function VerificationNotificationBell({
  currentUid,
  role,
}: {
  currentUid: string;
  role: 'admin' | 'user';
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [batchVerifying, setBatchVerifying] = useState(false);
  const [items, setItems] = useState<TaskSerialized[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<TaskSerialized | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastLoadedAt = useRef(0);
  const isAdmin = role === 'admin';

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const url = isAdmin
        ? '/api/tasks?scope=all&filter=true&verificationPending=true&excludeRecurring=true&limit=50'
        : '/api/tasks?scope=handoff&filter=true&verificationPending=true&excludeRecurring=true&limit=50';
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load notifications');
      const pending = (data.data as TaskSerialized[])
        .filter(task =>
          task.status === 'Completed'
          && !task.verifiedAt
          && isPortalTask(task)
          && (isAdmin || task.handoffUid === currentUid)
        )
        .sort((a, b) => new Date(b.completedAt || b.updatedAt).getTime() - new Date(a.completedAt || a.updatedAt).getTime());
      setItems(pending);
      lastLoadedAt.current = Date.now();
    } catch {
      // Keep last good list; avoid toast spam on background polls.
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUid, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    function onTaskStatusUpdated(event: Event) {
      const task = (event as CustomEvent<TaskSerialized>).detail;
      if (!task?.taskId) return;
      setItems(current => {
        const other = current.filter(item => item.taskId !== task.taskId);
        if (task.status !== 'Completed' || task.verifiedAt || !isPortalTask(task) || (!isAdmin && task.handoffUid !== currentUid)) return other;
        return [task, ...other].slice(0, 50);
      });
      setSelectedIds(prev => {
        if (!prev.has(task.taskId)) return prev;
        const next = new Set(prev);
        if (task.status !== 'Completed' || task.verifiedAt) {
          next.delete(task.taskId);
        }
        return next;
      });
    }
    window.addEventListener('task-status-updated', onTaskStatusUpdated);
    return () => window.removeEventListener('task-status-updated', onTaskStatusUpdated);
  }, [currentUid, isAdmin]);

  function updateTask(updated?: TaskSerialized) {
    if (!updated) {
      setSelected(null);
      return;
    }
    if (updated.status !== 'Completed' || updated.verifiedAt) {
      setItems(current => current.filter(task => task.taskId !== updated.taskId));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(updated.taskId);
        return next;
      });
      setSelected(null);
      return;
    }
    setItems(current => current.map(task => task.taskId === updated.taskId ? updated : task));
    setSelected(updated);
  }

  function removeTask(taskId: string) {
    setItems(current => current.filter(task => task.taskId !== taskId));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    setSelected(null);
  }

  const count = items.length;
  const selectedCount = selectedIds.size;
  const allSelected = count > 0 && selectedCount === count;

  function toggleSelect(taskId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(items.map(t => t.taskId)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function handleBatchVerify() {
    const targetIds = Array.from(selectedIds);
    if (targetIds.length === 0 || batchVerifying) return;

    setBatchVerifying(true);
    const successTasks: TaskSerialized[] = [];
    const failedIds: string[] = [];

    try {
      const results = await Promise.allSettled(
        targetIds.map(async (taskId) => {
          const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify' }),
          });
          const data = await res.json();
          if (!data.success) {
            throw new Error(data.error || `Failed to verify ${taskId}`);
          }
          return data.data as TaskSerialized;
        })
      );

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.status === 'fulfilled') {
          successTasks.push(res.value);
        } else {
          failedIds.push(targetIds[i]);
        }
      }

      if (successTasks.length > 0) {
        for (const verifiedTask of successTasks) {
          window.dispatchEvent(new CustomEvent('task-status-updated', { detail: verifiedTask }));
        }

        const successSet = new Set(successTasks.map(t => t.taskId));
        setItems(prev => prev.filter(t => !successSet.has(t.taskId)));

        setSelectedIds(prev => {
          const next = new Set(prev);
          successTasks.forEach(t => next.delete(t.taskId));
          return next;
        });

        toast.success(`${successTasks.length} task${successTasks.length === 1 ? '' : 's'} verified successfully`);
      }

      if (failedIds.length > 0) {
        toast.error(`Failed to verify ${failedIds.length} task${failedIds.length === 1 ? '' : 's'}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Batch verification failed');
    } finally {
      setBatchVerifying(false);
    }
  }

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => {
            const nextOpen = !open;
            setOpen(nextOpen);
            if (nextOpen && Date.now() - lastLoadedAt.current >= STALE_THRESHOLD_MS) load(items.length > 0);
          }}
          className={cn(
            'relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900',
            open && 'border-brand-200 bg-brand-50 text-brand-700',
          )}
          aria-label="Verification notifications"
          title="Tasks waiting for verification"
        >
          <Bell size={18} />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,25rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-modal">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Awaiting verification</p>
                <p className="text-[11px] text-gray-400">{count} completed task{count === 1 ? '' : 's'}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close notifications"
              >
                <X size={16} />
              </button>
            </div>

            {/* Action Bar with Deselect / Select All and Verify buttons */}
            {count > 0 && (
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectedCount > 0 ? deselectAll : selectAll}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-2xs transition-colors hover:bg-gray-50 hover:text-gray-900 active:scale-95"
                  >
                    {selectedCount > 0 ? (
                      <>
                        <Square size={13} className="text-gray-500" />
                        <span>Deselect {selectedCount > 0 ? `(${selectedCount})` : ''}</span>
                      </>
                    ) : (
                      <>
                        <CheckSquare size={13} className="text-gray-500" />
                        <span>Select All</span>
                      </>
                    )}
                  </button>

                  {selectedCount > 0 && selectedCount < count && (
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-[11px] font-medium text-brand-600 hover:text-brand-700 hover:underline"
                    >
                      Select all ({count})
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleBatchVerify}
                  disabled={selectedCount === 0 || batchVerifying}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold text-white shadow-sm transition-all',
                    selectedCount > 0 && !batchVerifying
                      ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                      : 'cursor-not-allowed bg-gray-200 text-gray-400 shadow-none'
                  )}
                >
                  {batchVerifying ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={13} />
                      <span>Verify {selectedCount > 0 ? `(${selectedCount})` : ''}</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* List */}
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {loading && items.length === 0 && (
                <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin" />
                  Loading...
                </div>
              )}

              {!loading && items.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-gray-400">
                  No tasks waiting for verification
                </div>
              )}

              {items.map(task => {
                const isSelected = selectedIds.has(task.taskId);
                return (
                  <div
                    key={task.taskId}
                    className={cn(
                      'flex w-full items-center gap-2.5 border-b border-gray-100 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-gray-50/80',
                      isSelected && 'bg-brand-50/50 hover:bg-brand-50/70',
                    )}
                  >
                    {/* Tickbox */}
                    <label
                      htmlFor={`verify-check-${task.taskId}`}
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-black/5 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      <input
                        id={`verify-check-${task.taskId}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(task.taskId)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        aria-label={`Select task ${task.taskId}`}
                      />
                    </label>

                    {/* Task Details Button (opens modal) */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(task);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left focus:outline-none"
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                        <CheckCircle2 size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{task.description}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500 truncate">
                          {task.assignedToName} · <span className="font-mono text-gray-400">{task.taskId}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          Completed {formatDateTime(task.completedAt || task.updatedAt)}
                        </p>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <TaskModal
          task={selected}
          onClose={() => setSelected(null)}
          role={role}
          currentUid={currentUid}
          onUpdate={updateTask}
          onDelete={isAdmin ? removeTask : undefined}
        />
      )}
    </>
  );
}
