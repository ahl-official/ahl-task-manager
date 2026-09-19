'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Loader2, X } from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import TaskModal from '@/components/shared/TaskModal';
import type { TaskSerialized } from '@/types';

const POLL_MS = 45_000;

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
  const [items, setItems] = useState<TaskSerialized[]>([]);
  const [selected, setSelected] = useState<TaskSerialized | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const isAdmin = role === 'admin';

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const url = isAdmin
        ? '/api/tasks?scope=all&status=Completed&limit=100'
        : '/api/tasks?scope=handoff&status=Completed&limit=100';
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load notifications');
      const pending = (data.data as TaskSerialized[])
        .filter(task =>
          task.status === 'Completed'
          && isPortalTask(task)
          && (isAdmin || task.handoffUid === currentUid)
        )
        .sort((a, b) => new Date(b.completedAt || b.updatedAt).getTime() - new Date(a.completedAt || a.updatedAt).getTime());
      setItems(pending);
    } catch {
      // Keep last good list; avoid toast spam on background polls.
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUid, isAdmin]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function updateTask(updated?: TaskSerialized) {
    if (!updated) {
      setSelected(null);
      return;
    }
    if (updated.status !== 'Completed') {
      setItems(current => current.filter(task => task.taskId !== updated.taskId));
      setSelected(null);
      return;
    }
    setItems(current => current.map(task => task.taskId === updated.taskId ? updated : task));
    setSelected(updated);
  }

  function removeTask(taskId: string) {
    setItems(current => current.filter(task => task.taskId !== taskId));
    setSelected(null);
  }

  const count = items.length;

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => {
            const nextOpen = !open;
            setOpen(nextOpen);
            if (nextOpen) load(items.length > 0);
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
          <div className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-modal">
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

              {items.map(task => (
                <button
                  key={task.taskId}
                  type="button"
                  onClick={() => {
                    setSelected(task);
                    setOpen(false);
                  }}
                  className="flex w-full gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-brand-50/60"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{task.description}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {task.assignedToName} · {task.taskId}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Completed {formatDateTime(task.completedAt || task.updatedAt)}
                    </p>
                  </div>
                </button>
              ))}
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
