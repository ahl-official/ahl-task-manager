'use client';

import { useState } from 'react';
import { Loader2, Plus, Power } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDateTime } from '@/lib/utils';

const TRIGGERS = ['Lead Created', 'Follow-up Due', 'Task Overdue', 'Task Completed'];
const ACTIONS = ['Send WhatsApp', 'Create Task', 'Notify Admin'];

export default function AutomationClient({ rules: initialRules }: { rules: any[] }) {
  const [rules, setRules] = useState(initialRules);
  const [loading, setLoading] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    trigger: 'Follow-up Due',
    action: 'Send WhatsApp',
    target: 'Lead owner',
    messageTemplate: 'Hi {{contactName}}, this is a follow-up from AHL.',
    isActive: true,
  });

  function setF(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.messageTemplate) {
      toast.error('Name and message template are required');
      return;
    }

    setLoading('create');
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRules(rs => [data.data, ...rs]);
      setForm(f => ({ ...f, name: '' }));
      toast.success('Automation created');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create automation');
    } finally {
      setLoading(null);
    }
  }

  async function toggleRule(rule: any) {
    setLoading(rule.id);
    try {
      const res = await fetch('/api/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, isActive: !rule.isActive }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setRules(rs => rs.map(r => r.id === rule.id ? { ...r, isActive: !rule.isActive } : r));
      toast.success(`Automation ${!rule.isActive ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update automation');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={createRule} className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Rule Name *</label>
            <input className="input" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Lead follow-up reminder" />
          </div>
          <div>
            <label className="label">Trigger</label>
            <select className="input" value={form.trigger} onChange={e => setF('trigger', e.target.value)}>
              {TRIGGERS.map(trigger => <option key={trigger}>{trigger}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Action</label>
            <select className="input" value={form.action} onChange={e => setF('action', e.target.value)}>
              {ACTIONS.map(action => <option key={action}>{action}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Target</label>
            <input className="input" value={form.target} onChange={e => setF('target', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3">
          <textarea
            className="input h-20 resize-none"
            value={form.messageTemplate}
            onChange={e => setF('messageTemplate', e.target.value)}
            placeholder="Message template"
          />
          <button className="btn-primary self-start" disabled={loading === 'create'}>
            {loading === 'create' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Add Rule
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rules.length === 0 && (
          <div className="card p-8 text-center text-sm text-gray-400 lg:col-span-2">No automation rules yet</div>
        )}
        {rules.map(rule => (
          <div key={rule.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-gray-900">{rule.name}</h2>
                  <span className={cn('badge', rule.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                    {rule.isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{rule.trigger} &gt; {rule.action}</p>
              </div>
              <button
                onClick={() => toggleRule(rule)}
                disabled={loading === rule.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  rule.isActive ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50',
                )}
              >
                {loading === rule.id ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
                {rule.isActive ? 'Pause' : 'Enable'}
              </button>
            </div>
            <div className="mt-4 bg-gray-50 rounded-xl p-3">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Template</p>
              <p className="text-sm text-gray-700">{rule.messageTemplate}</p>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
              <span>Target: {rule.target}</span>
              <span>{formatDateTime(rule.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
