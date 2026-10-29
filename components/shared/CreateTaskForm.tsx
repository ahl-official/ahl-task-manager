'use client';

import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Mic, Square, Wand2, AlertTriangle } from 'lucide-react';
import { canAssignTask, describeAssignmentRule, roleLabel } from '@/lib/utils/hierarchy';
import { stashPendingCreatedTask } from '@/lib/utils/pendingCreatedTask';
import type { UserRole } from '@/types';

const CATEGORIES = ['Daily', 'Weekly', 'Monthly', 'One Time'];
const PRIORITIES = ['High', 'Medium', 'Low'];

interface Props {
  users: { uid: string; name: string; department: string; role: UserRole; isActive: boolean }[];
  currentUser: { uid: string; name: string; department: string; role: UserRole };
  redirectTo: string;
  isReadLimit?: boolean;
}

export default function CreateTaskForm({ users, currentUser, redirectTo, isReadLimit }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Cache and resolve team members across sessions
  const [effectiveUsers, setEffectiveUsers] = useState(users);

  useEffect(() => {
    if (users && users.length > 0) {
      setEffectiveUsers(users);
      try {
        localStorage.setItem('ahl_cached_team_users', JSON.stringify(users));
      } catch {}
    } else {
      try {
        const cached = localStorage.getItem('ahl_cached_team_users');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEffectiveUsers(parsed);
            return;
          }
        }
      } catch {}
      if (currentUser?.uid) {
        setEffectiveUsers([
          {
            uid: currentUser.uid,
            name: currentUser.name,
            department: currentUser.department,
            role: currentUser.role,
            isActive: true,
          },
        ]);
      }
    }
  }, [users, currentUser]);

  const assignableUsers = effectiveUsers.filter(user => canAssignTask(currentUser as any, user as any));
  const isIntern = currentUser.role === 'intern';
  const isMember = currentUser.role === 'member';
  const myDept = (currentUser.department || '').trim().toLowerCase();

  const checkerUsers = effectiveUsers.filter(user => {
    if (!user.isActive) return false;
    if (user.role === 'admin') return true;

    if (isIntern) {
      if (user.uid === currentUser.uid) return false;
      const sameDept = !myDept || (user.department || '').trim().toLowerCase() === myDept;
      return sameDept && ['member', 'leader'].includes(user.role);
    }

    if (isMember) {
      if (user.uid === currentUser.uid) return true;
      const sameDept = !myDept || (user.department || '').trim().toLowerCase() === myDept;
      return sameDept && ['member', 'leader'].includes(user.role);
    }

    if (currentUser.role === 'leader') {
      if (user.uid === currentUser.uid) return true;
      const sameDept = !myDept || (user.department || '').trim().toLowerCase() === myDept;
      return sameDept || user.role === 'leader';
    }

    return true;
  });

  const defaultAssignedTo = isIntern || isMember ? currentUser.uid : '';
  const defaultDepartment = isIntern || isMember ? currentUser.department : '';
  const defaultHandoffUid = isIntern ? '' : currentUser.uid;

  const [form, setForm] = useState({
    description: '',
    assignedTo:  defaultAssignedTo,
    category:    'Daily',
    priority:    'Medium',
    startDate:   '',
    endDate:     '',
    handoffUid:  defaultHandoffUid,
    notes:       '',
    department:  defaultDepartment,
  });

  function set(field: string, value: string) {
    setForm(f => {
      const next = { ...f, [field]: value };
      // Auto-fill department from assignee
      if (field === 'assignedTo') {
        const user = effectiveUsers.find(u => u.uid === value);
        if (user) next.department = user.department;
      }
      return next;
    });
  }

  async function transcribeVoiceNote(audioBlob: Blob) {
    setVoiceLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'task-note.webm');

      const res = await fetch('/api/voice-notes', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      set('notes', data.data.notes);
      toast.success('Voice note added to notes');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to process voice note');
    } finally {
      setVoiceLoading(false);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Voice recording is not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        if (audioBlob.size === 0) {
          toast.error('No audio was recorded');
          return;
        }
        transcribeVoiceNote(audioBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      toast.error('Microphone permission was denied');
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.assignedTo || !form.handoffUid) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
      toast.error('Due date must be after start date');
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
      // Show on dashboard immediately from POST body — skip the 1000-task refetch.
      stashPendingCreatedTask(data.data, currentUser.uid);
      const sep = redirectTo.includes('?') ? '&' : '?';
      router.push(`${redirectTo}${sep}created=1`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  const showLimitNotice = isReadLimit || users.length === 0;

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-5">
      {/* Read Limit Notice inside Create Task form */}
      {showLimitNotice && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 flex items-start gap-3 shadow-xs">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-900 text-sm">Server Read Limit Active</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                ⚡ Direct Save Active
              </span>
            </div>
            <p className="mt-1 text-amber-800 leading-relaxed">
              Database reads are currently paused, but <strong>task creation writes directly without reading</strong>. Your new task will be saved into the database immediately.
            </p>
          </div>
        </div>
      )}

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
          {effectiveUsers.length > 0 ? (
            <select
              value={form.assignedTo}
              onChange={e => {
                const selectedUid = e.target.value;
                const user = effectiveUsers.find(u => u.uid === selectedUid);
                set('assignedTo', selectedUid);
                if (user?.department) set('department', user.department);
              }}
              className="input"
              required
            >
              <option value="">Select member…</option>
              {assignableUsers.map(u => (
                <option key={u.uid} value={u.uid}>{u.name} ({roleLabel(u.role)})</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={form.assignedTo}
              onChange={e => set('assignedTo', e.target.value)}
              placeholder="Enter member UID or name..."
              className="input"
              required
            />
          )}
          <p className="mt-1 text-[11px] text-gray-400">{describeAssignmentRule(currentUser.role)}</p>
        </div>

        {/* Checker */}
        <div>
          <label className="label">Checker / Handoff *</label>
          {effectiveUsers.length > 0 ? (
            <select
              value={form.handoffUid}
              onChange={e => set('handoffUid', e.target.value)}
              className="input"
              required
            >
              <option value="">Select checker…</option>
              {checkerUsers.map(u => (
                <option key={u.uid} value={u.uid}>
                  {u.name}{u.uid === currentUser.uid ? ' (You)' : ''} ({roleLabel(u.role)})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={form.handoffUid}
              onChange={e => set('handoffUid', e.target.value)}
              placeholder="Enter checker UID or name..."
              className="input"
              required
            />
          )}
          <p className="mt-1 text-[11px] text-gray-400">
            {isIntern
              ? 'Select another person or leader from your department to verify and check your work.'
              : 'The person who will verify and accept this task (defaults to you).'}
          </p>
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

        <div>
          <label className="label">Start Date</label>
          <input
            type="date"
            value={form.startDate}
            onChange={e => set('startDate', e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label">Due Date</label>
          <input
            type="date"
            value={form.endDate}
            onChange={e => set('endDate', e.target.value)}
            className="input"
            min={form.startDate || undefined}
          />
        </div>

        <div className="col-span-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {['Daily', 'Weekly', 'Monthly'].includes(form.category)
            ? `📌 Recurring ${form.category} Task: Repeats automatically on schedule. (Default due date: ${form.category === 'Monthly' ? 'End of Month (30th)' : "Today's date in IST"}).`
            : 'Admin-created tasks become active immediately. Add dates now, or the assigned person will be asked to set dates in the portal.'}
        </div>
      </div>

      {/* Notes */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <label className="label mb-0">Notes (optional)</label>
          <div className="flex items-center gap-2">
            {voiceLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600">
                <Loader2 size={12} className="animate-spin" />
                Transcribing
              </span>
            )}
            {recording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                <Square size={13} />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={voiceLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {voiceLoading ? <Wand2 size={13} /> : <Mic size={13} />}
                Voice Note
              </button>
            )}
          </div>
        </div>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Any additional context or instructions..."
          className="input resize-none h-20"
        />
        <p className="mt-1 text-[11px] text-gray-400">
          Record a quick note and it will be transcribed, cleaned up, and inserted here.
        </p>
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={loading || (!form.assignedTo && assignableUsers.length === 0)}
          className="btn-primary"
        >
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
