'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Calendar, User, Loader2, AlertOctagon } from 'lucide-react';
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

  const taskMap = Object.fromEntries(tasks.map(t => [t.taskId, t]));

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
    <div className="space-y-3">
      {revisions.map(rev => {
        const task = taskMap[rev.taskId];
        const isDeadRequest = rev.type === 'dead' || task?.status === 'Dead Requested';
        const canDecide = rev.status === 'pending' && (
          isDeadRequest ? role === 'admin' : (role === 'admin' || task?.handoffUid === currentUid)
        );

        return (
          <div key={rev.id} className={cn('card p-5 transition-all', isDeadRequest && 'border-rose-200')}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                {/* Task info & Type Badge */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md font-semibold">
                    {rev.taskId}
                  </span>
                  {isDeadRequest ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200">
                      <AlertOctagon size={11} /> Dead Approval Request
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                      <Calendar size={11} /> Date Extension
                    </span>
                  )}
                  {task && (
                    <span className={cn('badge text-xs', STATUS_COLORS[task.status])}>
                      {task.status}
                    </span>
                  )}
                </div>

                {task && (
                  <p className="text-sm font-medium text-gray-900">{task.description}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <User size={12} />
                    <span>Requested by <strong className="text-gray-700">{rev.requestedByName}</strong></span>
                  </div>
                  {isDeadRequest ? (
                    <div className="flex items-center gap-1.5">
                      <AlertOctagon size={12} className="text-rose-500" />
                      <span>Action requested: <strong className="text-rose-700">Flag Task Dead</strong></span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} />
                      <span>New date: <strong className="text-gray-700">{formatDate(rev.requestedDate)}</strong></span>
                    </div>
                  )}
                  {task && (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} />
                      <span>Current due: <strong className="text-gray-700">{formatDate(task.endDate)}</strong></span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span>Submitted: {formatDate(rev.createdAt)}</span>
                  </div>
                </div>

                <div className={cn('rounded-lg p-3', isDeadRequest ? 'bg-rose-50/70 border border-rose-100' : 'bg-orange-50')}>
                  <p className={cn('text-xs font-semibold mb-0.5', isDeadRequest ? 'text-rose-900' : 'text-orange-800')}>
                    {isDeadRequest ? 'Remark / Reason for Dead' : 'Reason'}
                  </p>
                  <p className={cn('text-sm', isDeadRequest ? 'text-rose-800' : 'text-orange-700')}>{rev.reason}</p>
                </div>
              </div>

              {/* Actions */}
              {canDecide && (
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => decide(rev.id, rev.taskId, 'approved')}
                    disabled={!!loading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-xl text-xs font-medium hover:bg-green-700 disabled:opacity-60 transition-colors shadow-xs"
                  >
                    {loading === rev.id + 'approved'
                      ? <Loader2 size={12} className="animate-spin" />
                      : <CheckCircle2 size={13} />
                    }
                    {isDeadRequest ? 'Approve Dead' : 'Approve'}
                  </button>
                  <button
                    onClick={() => decide(rev.id, rev.taskId, 'rejected')}
                    disabled={!!loading}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-medium hover:bg-red-100 disabled:opacity-60 transition-colors shadow-xs"
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
                      rev.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {rev.status}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
