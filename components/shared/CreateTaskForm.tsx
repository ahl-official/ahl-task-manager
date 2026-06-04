'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { canAssignTask, describeAssignmentRule, roleLabel } from '@/lib/utils/hierarchy';
import type { UserRole } from '@/types';

const CATEGORIES = ['Daily', 'Weekly', 'Monthly', 'One Time'];
const PRIORITIES = ['High', 'Medium', 'Low'];

interface Props {
  users: { uid: string; name: string; department: string; role: UserRole; isActive: boolean }[];
  currentUser: { uid: string; name: string; department: string; role: UserRole };
  redirectTo: string;
}

export default function CreateTaskForm({ users, currentUser, redirectTo }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const assignableUsers = users.filter(user => canAssignTask(currentUser as any, user as any));
  const checkerUsers = [
    { ...currentUser, isActive: true },
    ...users.filter(user => user.uid !== currentUser.uid),
  ];
  const [form, setForm] = useState({
    description: '',
    assignedTo:  '',
    category:    'Daily',
    priority:    'Medium',
    handoffUid:  currentUser.uid,
    notes:       '',
    department:  '',
  });

  function set(field: string, value: string) {
    setForm(f => {
      const next = { ...f, [field]: value };
      // Auto-fill department from assignee
      if (field === 'assignedTo') {
        const user = users.find(u => u.uid === value);
        if (user) next.department = user.department;
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.assignedTo || !form.handoffUid) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(`Task ${data.data.taskId} created successfully!`);
      router.push(redirectTo);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-5">
      {/* Description */}
      <div>
        <label className="label">Task Description *</label>
        <textarea
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Describe the task clearly..."
          className="input resize-none h-24"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Assigned To */}
        <div>
          <label className="label">Assign To *</label>
          <select
            value={form.assignedTo}
            onChange={e => set('assignedTo', e.target.value)}
            className="input"
            required
            disabled={assignableUsers.length === 0}
          >
            <option value="">Select member…</option>
            {assignableUsers.map(u => (
              <option key={u.uid} value={u.uid}>{u.name} ({u.department || 'No department'} / {roleLabel(u.role)})</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-400">{describeAssignmentRule(currentUser.role)}</p>
        </div>

        {/* Checker */}
        <div>
          <label className="label">Checker / Handoff *</label>
          <select
            value={form.handoffUid}
            onChange={e => set('handoffUid', e.target.value)}
            className="input"
            required
          >
            {checkerUsers.map(u => (
              <option key={u.uid} value={u.uid}>
                {u.name}{u.uid === currentUser.uid ? ' (You)' : ''} ({roleLabel(u.role)})
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-400">Defaults to the person assigning this task.</p>
        </div>

        {/* Category */}
        <div>
          <label className="label">Category *</label>
          <select
            value={form.category}
            onChange={e => set('category', e.target.value)}
            className="input"
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className="label">Priority *</label>
          <select
            value={form.priority}
            onChange={e => set('priority', e.target.value)}
            className="input"
          >
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>

        <div className="col-span-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
          The assigned person will set the start and due date when accepting the task.
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="label">Notes (optional)</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Any additional context or instructions..."
          className="input resize-none h-20"
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={loading || assignableUsers.length === 0} className="btn-primary">
          {loading && <Loader2 size={15} className="animate-spin" />}
          {loading ? 'Creating…' : 'Create Task'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
