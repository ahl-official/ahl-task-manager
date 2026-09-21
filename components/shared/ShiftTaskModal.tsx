'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRightLeft, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { roleLabel } from '@/lib/utils/hierarchy';
import type { TaskSerialized, UserRole } from '@/types';

interface Props {
  task: TaskSerialized;
  currentUser?: { uid: string; name?: string; role?: string; department?: string };
  users?: { uid: string; name: string; department?: string; role: UserRole; isActive?: boolean }[];
  onClose: () => void;
  onShifted: (updatedParent: TaskSerialized, childTask: TaskSerialized) => void;
}

export default function ShiftTaskModal({
  task,
  currentUser,
  users,
  onClose,
  onShifted,
}: Props) {
  const [targetUid, setTargetUid] = useState('');
  const [shiftNote, setShiftNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userList, setUserList] = useState(users || []);
  const [fetchingUsers, setFetchingUsers] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!users || users.length === 0) {
      setFetchingUsers(true);
      fetch('/api/users')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.data)) {
            setUserList(data.data);
          }
        })
        .catch(() => {})
        .finally(() => setFetchingUsers(false));
    }
  }, [users]);

  const userRole = currentUser?.role ?? 'member';
  const isMember = userRole === 'member';
  const myDept = (currentUser?.department || '').trim().toLowerCase();
  const currentUid = currentUser?.uid ?? '';

  const eligibleUsers = userList.filter(u => {
    if (u.isActive === false) return false;
    if (u.uid === currentUid || u.uid === task.assignedTo) return false;
    if (isMember) {
      const userDept = (u.department || '').trim().toLowerCase();
      const sameDept = !myDept || userDept === myDept;
      return sameDept && (u.role === 'member' || u.role === 'intern');
    }
    return true; // Admin can shift to anyone
  });

  async function handleShift(e: React.FormEvent) {
    e.preventDefault();
    if (!targetUid) {
      toast.error('Please select a team member to shift this task to');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tasks/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.taskId,
          targetUid,
          shiftNote: shiftNote.trim(),
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to shift task');

      toast.success(`Task ${task.taskId} shifted successfully!`);
      if (data.data?.parentTask && data.data?.childTask) {
        onShifted(data.data.parentTask, data.data.childTask);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to shift task');
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50/70 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-xs">
              <ArrowRightLeft size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-base">Shift Task</h3>
              <p className="text-xs text-gray-500">Reassign task to another team member</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleShift} className="p-6 space-y-4">
          {/* Task Info Summary */}
          <div className="rounded-xl bg-gray-50 p-3.5 border border-gray-100 text-xs text-gray-700 min-w-0">
            <span className="font-semibold text-purple-700 block mb-0.5">{task.taskId}</span>
            <p className="line-clamp-2 text-gray-800 font-medium break-words [overflow-wrap:anywhere]">{task.description}</p>
          </div>

          {/* Shift To Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Shift To *
            </label>
            <select
              value={targetUid}
              onChange={e => setTargetUid(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-600 focus:outline-hidden focus:ring-2 focus:ring-purple-600/20"
              required
              disabled={eligibleUsers.length === 0}
            >
              <option value="">Select team member…</option>
              {eligibleUsers.map(u => (
                <option key={u.uid} value={u.uid}>
                  {u.name} ({roleLabel(u.role)})
                </option>
              ))}
            </select>
            {eligibleUsers.length === 0 && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} />
                No eligible members found in your department to shift to.
              </p>
            )}
          </div>

          {/* Shift Note */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Shift Note / Instructions (Optional)
            </label>
            <textarea
              value={shiftNote}
              onChange={e => setShiftNote(e.target.value)}
              placeholder="Add any specific context or instructions for the recipient..."
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-900 focus:border-purple-600 focus:outline-hidden focus:ring-2 focus:ring-purple-600/20 resize-none"
            />
          </div>

          <div className="rounded-xl bg-purple-50/60 p-3 text-[11px] text-purple-800 border border-purple-100/60">
            <strong>Note:</strong> This task will remain visible in your list with status <span className="font-semibold">Shifted</span>, and a new linked task will be created for the recipient.
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !targetUid}
              className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              {loading ? 'Shifting…' : 'Confirm Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
