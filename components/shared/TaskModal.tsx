'use client';

import { useState } from 'react';
import { X, Calendar, User, Tag, AlertCircle, CheckCircle2, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { cn, formatDate, formatDateTime, STATUS_COLORS, PRIORITY_COLORS, PRIORITY_DOT, getDueBadge } from '@/lib/utils';
import { toast } from 'sonner';
import type { TaskSerialized } from '@/types';

interface Props {
  task: TaskSerialized;
  onClose: () => void;
  role: 'admin' | 'user';
  currentUid: string;
  onUpdate: () => void;
}

export default function TaskModal({ task, onClose, role, currentUid, onUpdate }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showRevision, setShowRevision] = useState(false);
  const [revisionDate, setRevisionDate] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [acceptStartDate, setAcceptStartDate] = useState('');
  const [acceptEndDate, setAcceptEndDate] = useState('');

  const isAssignee = task.assignedTo === currentUid;
  const isHandoff  = task.handoffUid === currentUid;
  const isAdmin    = role === 'admin';
  const due        = getDueBadge(task.endDate);
  const needsDates = isAssignee && task.status === 'In Progress' && (!task.startDate || !task.endDate);

  async function doAction(action: string, extra: Record<string, string> = {}) {
    setLoading(action);
    try {
      const res = await fetch(`/api/tasks/${task.taskId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const successMessage: Record<string, string> = {
        accept: 'Task accepted successfully',
        'set-dates': 'Task dates saved successfully',
        complete: isAdmin ? 'Task completed and verified successfully' : 'Task completed successfully',
        verify: 'Task verified successfully',
      };
      toast.success(successMessage[action] ?? 'Task updated successfully');
      onUpdate();
    } catch (err: any) {
      toast.error(err.message ?? 'Action failed');
    } finally {
      setLoading(null);
    }
  }

  async function submitRevision() {
    if (!revisionDate || !revisionReason.trim()) {
      toast.error('Please fill in all revision fields');
      return;
    }
    setLoading('revision');
    try {
      const res = await fetch('/api/revisions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          taskId:        task.taskId,
          requestedDate: revisionDate,
          reason:        revisionReason,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Revision request submitted');
      onUpdate();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to submit revision');
    } finally {
      setLoading(null);
    }
  }

  async function decideRevision(decision: 'approved' | 'rejected', revisionId: string) {
    setLoading(`revision-${decision}`);
    try {
      const res = await fetch('/api/revisions', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ revisionId, decision, taskId: task.taskId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(`Revision ${decision}`);
      onUpdate();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">{task.taskId}</span>
              <span className={cn('badge', STATUS_COLORS[task.status])}>{task.status}</span>
              <span className={cn('badge', PRIORITY_COLORS[task.priority])}>{task.priority}</span>
            </div>
            <p className="text-base font-semibold text-gray-900 leading-snug">{task.description}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0 ml-3">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            <Detail icon={User} label="Assigned To" value={task.assignedToName} />
            <Detail icon={User} label="Checker" value={task.handoffName} />
            <Detail icon={Tag} label="Category" value={task.category} />
            <Detail icon={Tag} label="Department" value={task.department} />
            <Detail icon={Calendar} label="Start Date" value={formatDate(task.startDate)} />
            <Detail
              icon={Calendar}
              label="Due Date"
              value={
                <span className={cn('badge', due.color)}>{due.label}</span>
              }
            />
            {task.delayedDate && (
              <Detail icon={Calendar} label="Delayed To" value={formatDate(task.delayedDate)} className="col-span-2" />
            )}
          </div>

          {task.notes && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Notes</p>
              <p className="text-sm text-gray-700">{task.notes}</p>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-1.5">
            {task.acceptedAt  && <TimelineItem icon={CheckCircle2} color="text-blue-500"  label="Accepted"  date={task.acceptedAt} />}
            {task.completedAt && <TimelineItem icon={CheckCircle2} color="text-green-500" label="Completed" date={task.completedAt} />}
            {task.verifiedAt  && <TimelineItem icon={CheckCircle2} color="text-brand-500" label="Verified"  date={task.verifiedAt} />}
          </div>

          {/* ── Actions ── */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            {/* Assignee actions */}
            {(isAssignee || isAdmin) && (
              <div className="flex gap-2 flex-wrap">
                {task.status === 'Pending Accept' && (
                  <div className="w-full rounded-xl bg-blue-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-blue-800">
                      {isAdmin ? 'Admin override' : 'Accept and set timeline'}
                    </p>
                    {!isAdmin && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="label text-blue-700">Start Date</label>
                          <input
                            type="date"
                            value={acceptStartDate}
                            onChange={e => setAcceptStartDate(e.target.value)}
                            className="input"
                            min={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                        <div>
                          <label className="label text-blue-700">Due Date</label>
                          <input
                            type="date"
                            value={acceptEndDate}
                            onChange={e => setAcceptEndDate(e.target.value)}
                            className="input"
                            min={acceptStartDate || new Date().toISOString().split('T')[0]}
                          />
                        </div>
                      </div>
                    )}
                    <div className="mt-3">
                      <ActionButton
                        label={isAdmin ? 'Accept Anyway' : 'Accept Task'}
                        onClick={() => {
                          if (!isAdmin && (!acceptStartDate || !acceptEndDate)) {
                            toast.error('Set start and due date before accepting');
                            return;
                          }
                          doAction('accept', { startDate: acceptStartDate, endDate: acceptEndDate });
                        }}
                        loading={loading === 'accept'}
                        color="blue"
                      />
                    </div>
                  </div>
                )}
                {!isAdmin && needsDates && (
                  <div className="w-full rounded-xl bg-blue-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-blue-800">Set task timeline</p>
                    <p className="mb-3 text-xs text-blue-700">This admin-assigned task is active. Add the start and due date before marking it complete.</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="label text-blue-700">Start Date</label>
                        <input
                          type="date"
                          value={acceptStartDate}
                          onChange={e => setAcceptStartDate(e.target.value)}
                          className="input"
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                      <div>
                        <label className="label text-blue-700">Due Date</label>
                        <input
                          type="date"
                          value={acceptEndDate}
                          onChange={e => setAcceptEndDate(e.target.value)}
                          className="input"
                          min={acceptStartDate || new Date().toISOString().split('T')[0]}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <ActionButton
                        label="Save Dates"
                        onClick={() => {
                          if (!acceptStartDate || !acceptEndDate) {
                            toast.error('Set start and due date first');
                            return;
                          }
                          doAction('set-dates', { startDate: acceptStartDate, endDate: acceptEndDate });
                        }}
                        loading={loading === 'set-dates'}
                        color="blue"
                      />
                    </div>
                  </div>
                )}
                {!isAdmin && ['In Progress', 'Delay Requested'].includes(task.status) && task.startDate && task.endDate && (
                  <ActionButton label="Mark Complete" onClick={() => doAction('complete')} loading={loading === 'complete'} color="green" />
                )}
                {isAdmin && task.status !== 'Completed' && task.status !== 'Verified' && (
                  <ActionButton label="Complete and Verify" onClick={() => doAction('complete')} loading={loading === 'complete'} color="green" />
                )}
              </div>
            )}

            {/* Handoff actions */}
            {(isHandoff || isAdmin) && task.status === 'Completed' && (
              <ActionButton label="Verify Task" onClick={() => doAction('verify')} loading={loading === 'verify'} color="brand" />
            )}

            {/* ── Date Management ── */}
            {isAssignee && task.status === 'In Progress' && task.endDate && (
              <div className="bg-orange-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5">
                    <Calendar size={13} /> Date Management
                  </p>
                  <RevisionBadge status={task.revisionStatus} />
                </div>

                {task.revisionStatus !== 'requested' && (
                  <button
                    onClick={() => setShowRevision(!showRevision)}
                    className="text-xs text-orange-700 font-medium hover:underline"
                  >
                    {showRevision ? 'Cancel' : '+ Request Revised Date'}
                  </button>
                )}

                {showRevision && (
                  <div className="mt-3 space-y-2">
                    <div>
                      <label className="label text-orange-700">Requested New Date</label>
                      <input
                        type="date"
                        value={revisionDate}
                        onChange={e => setRevisionDate(e.target.value)}
                        className="input"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div>
                      <label className="label text-orange-700">Reason</label>
                      <textarea
                        value={revisionReason}
                        onChange={e => setRevisionReason(e.target.value)}
                        placeholder="Explain why the date needs to change..."
                        className="input resize-none h-20"
                      />
                    </div>
                    <ActionButton
                      label="Submit Request"
                      onClick={submitRevision}
                      loading={loading === 'revision'}
                      color="orange"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Revision decision for handoff */}
            {(isHandoff || isAdmin) && task.revisionStatus === 'requested' && (
              <div className="bg-yellow-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-yellow-800 mb-2 flex items-center gap-1.5">
                  <RefreshCw size={13} /> Revision Requested
                </p>
                {task.delayReason && (
                  <p className="text-xs text-yellow-700 mb-2">Reason: {task.delayReason}</p>
                )}
                <div className="flex gap-2">
                  <ActionButton
                    label="Approve"
                    onClick={() => decideRevision('approved', task.taskId)}
                    loading={loading === 'revision-approved'}
                    color="green"
                  />
                  <ActionButton
                    label="Reject"
                    onClick={() => decideRevision('rejected', task.taskId)}
                    loading={loading === 'revision-rejected'}
                    color="red"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value, className }: {
  icon: any; label: string; value: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('bg-gray-50 rounded-xl p-3', className)}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon size={12} className="text-gray-400" />
        <p className="text-[11px] text-gray-400 font-medium">{label}</p>
      </div>
      <div className="text-sm font-medium text-gray-700">{value}</div>
    </div>
  );
}

function TimelineItem({ icon: Icon, color, label, date }: {
  icon: any; color: string; label: string; date: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <Icon size={13} className={color} />
      <span>{label}:</span>
      <span className="text-gray-700">{formatDateTime(date)}</span>
    </div>
  );
}

function RevisionBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    none:      'bg-gray-100 text-gray-500',
    requested: 'bg-yellow-100 text-yellow-700',
    accepted:  'bg-green-100 text-green-700',
    rejected:  'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    none:      'No revision',
    requested: 'Revision requested',
    accepted:  'Revision accepted',
    rejected:  'Revision rejected',
  };
  return (
    <span className={cn('badge text-[10px]', map[status] ?? map.none)}>
      {labels[status] ?? status}
    </span>
  );
}

function ActionButton({ label, onClick, loading: isLoading, color }: {
  label: string; onClick: () => void; loading: boolean; color: string;
}) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-600 hover:bg-blue-700 text-white',
    green:  'bg-green-600 hover:bg-green-700 text-white',
    brand:  'bg-brand-600 hover:bg-brand-700 text-white',
    orange: 'bg-orange-600 hover:bg-orange-700 text-white',
    red:    'bg-red-600 hover:bg-red-700 text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-60',
        colors[color] ?? colors.blue,
      )}
    >
      {isLoading && <Loader2 size={12} className="animate-spin" />}
      {label}
    </button>
  );
}
