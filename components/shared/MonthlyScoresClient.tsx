'use client';

import { useEffect, useMemo, useState } from 'react';
import { indiaTodayKey } from '@/lib/utils/indiaDate';

type MonthlyRow = {
  uid: string | null;
  name: string;
  department: string;
  w1Label: string;
  w2Label: string;
  w3Label: string;
  w4Label: string;
  w5Label: string;
  ms: number | null;
  msLabel: string;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function MonthlyScoresClient() {
  const today = indiaTodayKey();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/mis?mode=monthly&year=${year}&month=${month}`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load monthly scores');
        return payload.data as MonthlyRow[];
      })
      .then(data => { if (!controller.signal.aborted) setRows(data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message || 'Could not load monthly scores'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [year, month]);

  const ranked = useMemo(() => [...rows].sort((a, b) => {
    if (a.ms === null) return 1;
    if (b.ms === null) return -1;
    return a.ms - b.ms || a.name.localeCompare(b.name);
  }), [rows]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Monthly Scores</h1>
        <p className="mt-1 text-sm text-gray-500">Weekly scores and their monthly average, ordered from lowest to highest.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-gray-700">Month
          <select aria-label="Month" className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2" value={month} onChange={event => setMonth(Number(event.target.value))}>
            {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700">Year
          <select aria-label="Year" className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2" value={year} onChange={event => setYear(Number(event.target.value))}>
            {Array.from({ length: currentYear - 2024 + 1 }, (_, index) => currentYear - index).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600"><tr>
            <th className="px-4 py-3">Rank</th><th className="px-4 py-3">Person Name</th><th className="px-4 py-3">Department</th>
            {[1, 2, 3, 4, 5].map(week => <th key={week} className="px-4 py-3 text-right">Week {week}</th>)}
            <th className="px-4 py-3 text-right">Monthly Score</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {ranked.map((row, index) => <tr key={row.uid || `${row.name}:${index}`}>
              <td className="px-4 py-3 text-gray-500">{index + 1}</td><td className="px-4 py-3 font-medium text-gray-900">{row.name}</td><td className="px-4 py-3 text-gray-500">{row.department || '—'}</td>
              {[row.w1Label, row.w2Label, row.w3Label, row.w4Label, row.w5Label].map((value, week) => <td key={week} className="px-4 py-3 text-right tabular-nums">{value || '—'}</td>)}
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.msLabel || '—'}</td>
            </tr>)}
          </tbody>
        </table>
        {!loading && !error && ranked.length === 0 && <p className="p-6 text-center text-sm text-gray-500">No saved weekly scores for this month.</p>}
        {loading && <p className="p-6 text-center text-sm text-gray-500">Loading monthly scores…</p>}
      </div>
    </div>
  );
}
