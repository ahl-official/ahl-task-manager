'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X, Clock, Calendar, Check, AlertTriangle, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { RecurringTemplate, RecurringTemplateInput } from '@/lib/cloudflare/recurring';

interface UserOption {
  uid: string;
  name: string;
  department?: string;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

export default function RecurringTemplatesModal({
  isOpen,
  onClose,
  onTemplatesChanged,
}: {
  isOpen: boolean;
  onClose: () => void;
  onTemplatesChanged?: () => void;
}) {
  const [tab, setTab] = useState<'list' | 'create' | 'edit'>('list');
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState<'Daily' | 'Weekly' | 'Monthly'>('Daily');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedToName, setAssignedToName] = useState('');
  const [department, setDepartment] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<number>(5); // default Friday
  const [dayOfMonth, setDayOfMonth] = useState<number>(30); // default 30th
  const [timeOfDay, setTimeOfDay] = useState('10:00');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Daily' | 'Weekly' | 'Monthly'>('All');

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      loadUsers();
    }
  }, [isOpen]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch('/api/recurring/templates');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTemplates(data.data || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load recurring templates');
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setUsers(data.data.map((u: any) => ({
          uid: u.uid,
          name: u.name,
          department: u.department || '',
        })));
      }
    } catch (err) {
      console.warn('Failed to load users for template assignment', err);
    }
  }

  function resetForm() {
    setEditingId(null);
    setCategory('Daily');
    setDescription('');
    setAssignedToName('');
    setDepartment('');
    setDayOfWeek(5);
    setDayOfMonth(30);
    setTimeOfDay('10:00');
  }

  function startEdit(template: RecurringTemplate) {
    setEditingId(template.id);
    setCategory(template.category as any);
    const combinedDesc = template.description
      ? (template.title && !template.description.startsWith(template.title)
          ? `${template.title}\n\n${template.description}`
          : template.description)
      : template.title || '';
    setDescription(combinedDesc);
    setAssignedToName(template.assignedToName);
    setDepartment(template.department || '');
    setDayOfWeek(template.dayOfWeek ?? 5);
    setDayOfMonth(template.dayOfMonth ?? 30);
    setTimeOfDay(template.timeOfDay || '10:00');
    setTab('edit');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const descTrimmed = description.trim();
    if (!descTrimmed || !assignedToName.trim()) {
      toast.error('Task description and Assignee are required');
      return;
    }

    const firstLine = descTrimmed.split('\n')[0].slice(0, 100).trim();
    const titleVal = firstLine || 'Recurring Task';

    setSubmitting(true);
    try {
      const payload: RecurringTemplateInput = {
        title: titleVal,
        description: descTrimmed,
        category,
        frequency: category,
        assignedToName: assignedToName.trim(),
        department: department.trim(),
        dayOfWeek: category === 'Weekly' ? dayOfWeek : null,
        dayOfMonth: category === 'Monthly' ? dayOfMonth : null,
        timeOfDay: timeOfDay || '10:00',
        isActive: true,
      };

      if (editingId) {
        const res = await fetch(`/api/recurring/templates/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        toast.success('Recurring task template updated');
      } else {
        const res = await fetch('/api/recurring/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        toast.success('Recurring task template created');
      }

      resetForm();
      setTab('list');
      await loadTemplates();
      onTemplatesChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save recurring template');
    } finally {
      setSubmitting(false);
    }
  }


  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to permanently delete this recurring task template? This action cannot be undone.')) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/recurring/templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      toast.success('Recurring task template permanently deleted');
      setTemplates(prev => prev.filter(t => t.id !== id));
      onTemplatesChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete template');
    } finally {
      setDeletingId(null);
    }
  }

  if (!isOpen) return null;

  const filteredTemplates = templates.filter(t => {
    if (categoryFilter === 'All') return true;
    return t.category.toLowerCase() === categoryFilter.toLowerCase();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Manage Recurring Tasks</h2>
            <p className="text-xs text-gray-500">Configure daily, weekly, and monthly recurring task templates</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-100 px-6 pt-2">
          <button
            onClick={() => { setTab('list'); resetForm(); }}
            className={cn(
              'border-b-2 px-4 py-2.5 text-sm font-medium transition',
              tab === 'list'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            All Templates ({templates.length})
          </button>
          <button
            onClick={() => { setTab('create'); resetForm(); }}
            className={cn(
              'border-b-2 px-4 py-2.5 text-sm font-medium transition flex items-center gap-1.5',
              tab === 'create' || tab === 'edit'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            <Plus className="h-4 w-4" />
            {tab === 'edit' ? 'Edit Template' : 'Add New Recurring Task'}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'list' ? (
            <div className="space-y-4">
              {/* Category Filter Pills */}
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  {(['All', 'Daily', 'Weekly', 'Monthly'] as const).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition',
                        categoryFilter === cat
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setTab('create'); resetForm(); }}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Template
                </button>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
                  <p className="mt-2 text-sm">Loading recurring templates...</p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
                  <Calendar className="mx-auto h-10 w-10 text-gray-300" />
                  <p className="mt-2 text-sm font-medium text-gray-600">No recurring task templates found</p>
                  <p className="text-xs text-gray-400">Click &apos;Add New Recurring Task&apos; to create one.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredTemplates.map(t => (
                    <div
                      key={t.id}
                      className="group flex items-start justify-between rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
                              t.category.toLowerCase() === 'daily' && 'bg-blue-100 text-blue-800',
                              t.category.toLowerCase() === 'weekly' && 'bg-purple-100 text-purple-800',
                              t.category.toLowerCase() === 'monthly' && 'bg-amber-100 text-amber-800',
                            )}
                          >
                            {t.category}
                          </span>
                          <h3 className="font-semibold text-gray-900">{t.title}</h3>
                        </div>

                        {t.description && (
                          <p className="text-xs text-gray-600 whitespace-pre-line line-clamp-3">
                            {t.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 pt-1">
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            <strong className="text-gray-700">{t.assignedToName}</strong>
                            {t.department && <span className="text-gray-400">({t.department})</span>}
                          </span>

                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                            {t.category.toLowerCase() === 'weekly' && t.dayOfWeek
                              ? `Every ${DAYS_OF_WEEK.find(d => d.value === t.dayOfWeek)?.label || 'Friday'} at ${t.timeOfDay || '10:00'}`
                              : t.category.toLowerCase() === 'monthly'
                              ? `Monthly (Day ${t.dayOfMonth ?? 30}) at ${t.timeOfDay || '10:00'}`
                              : `Daily at ${t.timeOfDay || '10:00'}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100">
                        <button
                          onClick={() => startEdit(t)}
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600 transition"
                          title="Edit Template"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          disabled={deletingId === t.id}
                          onClick={() => handleDelete(t.id)}
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                          title="Permanently Delete Template"
                        >
                          {deletingId === t.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Frequency / Category *</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="input mt-1 w-full text-sm"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">Time of Day (IST)</label>
                  <input
                    type="time"
                    value={timeOfDay}
                    onChange={e => setTimeOfDay(e.target.value)}
                    className="input mt-1 w-full text-sm"
                  />
                </div>
              </div>

              {category === 'Weekly' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Day of Week *</label>
                  <select
                    value={dayOfWeek}
                    onChange={e => setDayOfWeek(Number(e.target.value))}
                    className="input mt-1 w-full text-sm"
                  >
                    {DAYS_OF_WEEK.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {category === 'Monthly' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Day of Month (1-31)</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={e => setDayOfMonth(Number(e.target.value))}
                    className="input mt-1 w-full text-sm"
                    placeholder="30 (End of month)"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700">Task Description / Instructions *</label>
                <textarea
                  rows={5}
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Oracle Server Cost Check 🚨&#10;&#10;Please complete this quick check every Friday morning to ensure our cloud infrastructure remains on the Free Tier and Vinit Sir's card is protected.&#10;&#10;Instructions:&#10;1. Log into the Oracle Cloud Dashboard...&#10;2. Verify $0.00 cost to date"
                  className="input mt-1 w-full text-sm font-sans"
                />
              </div>


              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Assigned To (Employee) *</label>
                  <input
                    type="text"
                    required
                    list="user-suggestions"
                    value={assignedToName}
                    onChange={e => {
                      const val = e.target.value;
                      setAssignedToName(val);
                      const matched = users.find(u => u.name.toLowerCase() === val.toLowerCase());
                      if (matched && matched.department) {
                        setDepartment(matched.department);
                      }
                    }}
                    placeholder="Type or select employee name..."
                    className="input mt-1 w-full text-sm"
                  />
                  <datalist id="user-suggestions">
                    {users.map(u => (
                      <option key={u.uid} value={u.name}>{u.department ? `${u.name} (${u.department})` : u.name}</option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="e.g. Operations, IT, Salon..."
                    className="input mt-1 w-full text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setTab('list'); resetForm(); }}
                  className="btn-secondary py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary py-2 text-sm flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      {tab === 'edit' ? 'Update Template' : 'Create Template'}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
