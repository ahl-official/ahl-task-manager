'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type DeletedRow = {
  id: string;
  kind: 'one-time' | 'recurring-day' | 'recurring-whole';
  description: string;
  assignedToName: string;
  category: string;
  deletedAt: string;
  dueDate?: string;
  previousStatus?: string;
};

const labels: Record<DeletedRow['kind'], string> = {
  'one-time': 'One Time',
  'recurring-day': 'Checklist day',
  'recurring-whole': 'Whole recurring task',
};

export default function DeletedTasksClient() {
  const [kind, setKind] = useState<'all' | 'one-time' | 'recurring'>('all');
  const [rows, setRows] = useState<DeletedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal, cursor?: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/deleted?kind=${kind}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store', signal });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load deleted tasks');
      if (!signal?.aborted) {
        setRows(current => cursor ? [...current, ...payload.data.items] : payload.data.items);
        setHasMore(Boolean(payload.data.hasMore));
        setNextCursor(payload.data.nextCursor || null);
      }
    } catch (err: any) {
      if (!signal?.aborted) setError(err.message || 'Could not load deleted tasks');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function restore(row: DeletedRow) {
    if (!window.confirm(`Restore ${labels[row.kind].toLowerCase()} ${row.id}?`)) return;
    setBusyId(row.id);
    try {
      const response = await fetch('/api/deleted', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, kind: row.kind }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not restore task');
      sessionStorage.setItem('ahl-checklist-restored-at', String(Date.now()));
      window.dispatchEvent(new CustomEvent('app-global-refresh', { detail: { scope: 'all' } }));
      toast.success('Task restored');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Could not restore task');
    } finally {
      setBusyId('');
    }
  }

  return <div className="p-6 space-y-5">
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Deleted Tasks</h1>
      <p className="mt-1 text-sm text-gray-500">Restore a one-time task, one checklist day, or a whole recurring task.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      {(['all', 'one-time', 'recurring'] as const).map(value => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-lg px-3 py-2 text-sm ${kind === value ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}>{value === 'all' ? 'All' : value === 'one-time' ? 'One Time' : 'Recurring'}</button>)}
      <button type="button" onClick={() => void load()} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">Refresh</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="px-4 py-3">Task</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Assigned To</th><th className="px-4 py-3">Deleted</th><th className="px-4 py-3">Action</th></tr></thead>
        <tbody className="divide-y divide-gray-100">{rows.map(row => <tr key={`${row.kind}:${row.id}`}>
          <td className="max-w-xl px-4 py-3"><span className="font-medium text-gray-900">{row.id}</span><span className="ml-2 text-gray-600">{row.description}</span>{row.dueDate && <span className="block text-xs text-gray-500">Due {row.dueDate}</span>}</td>
          <td className="px-4 py-3">{labels[row.kind]}</td><td className="px-4 py-3">{row.assignedToName || '—'}</td>
          <td className="px-4 py-3">{row.deletedAt ? new Date(row.deletedAt).toLocaleString('en-IN') : '—'}</td>
          <td className="px-4 py-3"><button type="button" disabled={busyId === row.id} onClick={() => void restore(row)} className="rounded-lg border border-brand-200 px-3 py-1.5 font-medium text-brand-700 disabled:opacity-50">{busyId === row.id ? 'Restoring…' : 'Undo delete'}</button></td>
        </tr>)}</tbody>
      </table>
      {!loading && !error && rows.length === 0 && <p className="p-6 text-center text-sm text-gray-500">No deleted tasks in this view.</p>}
      {loading && <p className="p-6 text-center text-sm text-gray-500">Loading deleted tasks…</p>}
    </div>
    {hasMore && nextCursor && !loading && <button type="button" onClick={() => void load(undefined, nextCursor)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm">Load more</button>}
  </div>;
}
