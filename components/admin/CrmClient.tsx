'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDate } from '@/lib/utils';

const STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'];
const STAGE_COLORS: Record<string, string> = {
  New: 'bg-gray-100 text-gray-600',
  Contacted: 'bg-blue-100 text-blue-700',
  Qualified: 'bg-brand-100 text-brand-700',
  Proposal: 'bg-yellow-100 text-yellow-700',
  Won: 'bg-green-100 text-green-700',
  Lost: 'bg-red-100 text-red-700',
};

export default function CrmClient({
  leads: initialLeads,
  users,
}: {
  leads: any[];
  users: { uid: string; name: string; department: string }[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    source: 'Manual',
    stage: 'New',
    ownerUid: users[0]?.uid ?? '',
    notes: '',
    nextFollowUp: '',
  });

  function setF(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(lead =>
      [lead.companyName, lead.contactName, lead.phone, lead.email, lead.source, lead.ownerName]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    );
  }, [leads, query]);

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyName || !form.contactName || !form.phone || !form.ownerUid) {
      toast.error('Please fill company, contact, phone, and owner');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLeads(ls => [data.data, ...ls]);
      setForm(f => ({
        ...f,
        companyName: '',
        contactName: '',
        phone: '',
        email: '',
        notes: '',
        nextFollowUp: '',
      }));
      toast.success('Lead added');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add lead');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={createLead} className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Company *</label>
            <input className="input" value={form.companyName} onChange={e => setF('companyName', e.target.value)} />
          </div>
          <div>
            <label className="label">Contact *</label>
            <input className="input" value={form.contactName} onChange={e => setF('contactName', e.target.value)} />
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input" value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="919876543210" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={form.email} onChange={e => setF('email', e.target.value)} />
          </div>
          <div>
            <label className="label">Stage</label>
            <select className="input" value={form.stage} onChange={e => setF('stage', e.target.value)}>
              {STAGES.map(stage => <option key={stage}>{stage}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Owner</label>
            <select className="input" value={form.ownerUid} onChange={e => setF('ownerUid', e.target.value)}>
              {users.map(user => <option key={user.uid} value={user.uid}>{user.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Source</label>
            <input className="input" value={form.source} onChange={e => setF('source', e.target.value)} />
          </div>
          <div>
            <label className="label">Next Follow-up</label>
            <input type="date" className="input" value={form.nextFollowUp} onChange={e => setF('nextFollowUp', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3">
          <textarea
            className="input h-20 resize-none"
            value={form.notes}
            onChange={e => setF('notes', e.target.value)}
            placeholder="Notes, requirements, next action..."
          />
          <button className="btn-primary self-start" disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Add Lead
          </button>
        </div>
      </form>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 py-2" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search CRM..." />
        </div>
        <p className="text-xs text-gray-400">{filtered.length} of {leads.length} leads</p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Company', 'Contact', 'Stage', 'Owner', 'Follow-up', 'Source'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No leads found</td></tr>
              )}
              {filtered.map(lead => (
                <tr key={lead.id} className="border-b border-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{lead.companyName}</p>
                    <p className="text-xs text-gray-400">{lead.email || 'No email'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700">{lead.contactName}</p>
                    <p className="font-mono text-xs text-gray-400">{lead.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('badge', STAGE_COLORS[lead.stage])}>{lead.stage}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{lead.ownerName}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(lead.nextFollowUp)}</td>
                  <td className="px-4 py-3 text-gray-500">{lead.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
