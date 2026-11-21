'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import { createTabCache } from '@/lib/utils/tabCache';
import { downloadMonthlySummaryTablePdf } from '@/lib/mis/directPdf';
import { isVinittUser } from '@/lib/utils/names';
import { toast } from 'sonner';

type MonthlyRow = {
  uid: string | null;
  name: string;
  department: string;
  w1?: number | null;
  w2?: number | null;
  w3?: number | null;
  w4?: number | null;
  w5?: number | null;
  w1Label: string;
  w2Label: string;
  w3Label: string;
  w4Label: string;
  w5Label: string;
  ms: number | null;
  msLabel: string;
  monthName?: string;
  year?: number;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const monthlyReports = createTabCache<MonthlyRow[]>(Infinity);

function ScoreBadge({ score, label, isMonthly = false }: { score?: number | null; label: string; isMonthly?: boolean }) {
  if (score === null || score === undefined || Number.isNaN(score) || label === '—' || !label) {
    return <span className="text-gray-400 text-xs tabular-nums">—</span>;
  }
  const isGood = score >= -20;
  if (isMonthly) {
    return (
      <span
        className={`inline-flex items-center justify-center min-w-[64px] px-2.5 py-1 rounded-md text-xs font-bold tabular-nums shadow-xs ${
          isGood
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            : 'bg-rose-100 text-rose-800 border border-rose-300'
        }`}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[54px] px-2 py-0.5 rounded text-xs font-medium tabular-nums ${
        isGood
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-rose-50 text-rose-700 border border-rose-200'
      }`}
    >
      {label}
    </span>
  );
}

export default function MonthlyScoresClient({ currentUid }: { currentUid: string }) {
  const today = indiaTodayKey();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const forceRefresh = useRef(false);
  const cacheKey = JSON.stringify([currentUid, year, month]);

  const monthName = MONTHS[month - 1] || 'Month';

  // Score mutations update the server; only an explicit refresh replaces this browser's snapshot.
  useEffect(() => {
    const refresh = (event: Event) => {
      const scope = (event as CustomEvent).detail?.scope;
      if (scope && scope !== 'all' && scope !== 'scores') return;
      monthlyReports.clear();
      forceRefresh.current = true;
      setRefreshVersion(value => value + 1);
    };
    window.addEventListener('app-global-refresh', refresh);
    return () => window.removeEventListener('app-global-refresh', refresh);
  }, []);

  useEffect(() => {
    const cached = monthlyReports.get(cacheKey);
    if (cached) {
      setRows(cached);
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    setError('');
    setLoading(true);
    setRows([]);
    // Cache each month separately; cancel requests for filters no longer selected.
    fetch(`/api/mis?mode=monthly&year=${year}&month=${month}${forceRefresh.current ? '&fresh=true' : ''}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load monthly scores');
        return payload.data as MonthlyRow[];
      })
      .then(data => {
        if (controller.signal.aborted) return;
        setRows(data);
        monthlyReports.set(cacheKey, data);
        forceRefresh.current = false;
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message || 'Could not load monthly scores'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [year, month, cacheKey, refreshVersion]);

  // Filter: Only active users (handled by API) and strictly exclude Vinitt Sir
  // Sort: Bad score to good score (ascending gap: -100% -> 0%)
  const ranked = useMemo(() => {
    return rows
      .filter(row => !isVinittUser({ uid: row.uid, name: row.name }))
      .sort((a, b) => {
        if (a.ms === null && b.ms === null) return a.name.localeCompare(b.name);
        if (a.ms === null) return 1;
        if (b.ms === null) return -1;
        return a.ms - b.ms || a.name.localeCompare(b.name);
      });
  }, [rows]);

  // One simple PDF download matching the exact on-screen table
  async function handleDownloadPdf() {
    if (isDownloading || ranked.length === 0) return;
    setIsDownloading(true);
    try {
      await downloadMonthlySummaryTablePdf(ranked, monthName, year);
      toast.success(`Downloaded Monthly Scores PDF for ${monthName} ${year}`);
    } catch (err: any) {
      toast.error(`Failed to generate PDF: ${err?.message || 'Error'}`);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Monthly Scores</h1>
          <p className="mt-1 text-sm text-gray-500">Weekly scores and monthly average for {monthName} {year}, ranked from lowest to highest score.</p>
        </div>

        {/* Single Clean Download PDF Button */}
        <div>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={loading || ranked.length === 0 || isDownloading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors"
            title="Download Monthly Scores table as PDF"
          >
            {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-50/50 p-3 rounded-lg border border-gray-200">
        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Month:
          <select
            aria-label="Month"
            className="ml-2 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-normal text-gray-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            value={month}
            onChange={event => setMonth(Number(event.target.value))}
          >
            {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Year:
          <select
            aria-label="Year"
            className="ml-2 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-normal text-gray-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            value={year}
            onChange={event => setYear(Number(event.target.value))}
          >
            {Array.from({ length: currentYear - 2024 + 1 }, (_, index) => currentYear - index).map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-gray-500 ml-auto">
          {ranked.length} active staff member{ranked.length === 1 ? '' : 's'} ranked
        </span>
      </div>

      {/* Score Legend */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs bg-white p-2.5 rounded-lg border border-gray-200">
        <span className="font-semibold text-gray-600">Indicator:</span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-medium">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          Light Red: Bad Score (&lt; -20% Gap / Under 80%)
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          Light Green: Good Score (≥ -20% Gap / 80%+)
        </span>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600 border-b border-gray-200 font-medium">
            <tr>
              <th className="px-4 py-3 text-center w-12">#</th>
              <th className="px-4 py-3">Person Name</th>
              <th className="px-4 py-3">Department</th>
              {[1, 2, 3, 4, 5].map(week => (
                <th key={week} className="px-4 py-3 text-right">Week {week}</th>
              ))}
              <th className="px-4 py-3 text-right font-semibold text-brand-900">Monthly Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ranked.map((row, index) => {
              const isGood = row.ms !== null && row.ms !== undefined && row.ms >= -20;
              const isBad = row.ms !== null && row.ms !== undefined && row.ms < -20;
              const rowBg = isGood
                ? 'bg-emerald-50/20 hover:bg-emerald-50/40'
                : isBad
                ? 'bg-rose-50/20 hover:bg-rose-50/40'
                : 'hover:bg-gray-50/70';

              return (
                <tr key={row.uid || `${row.name}:${index}`} className={`${rowBg} transition-colors border-b border-gray-100`}>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs font-medium">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{row.department || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBadge score={row.w1} label={row.w1Label} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBadge score={row.w2} label={row.w2Label} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBadge score={row.w3} label={row.w3Label} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBadge score={row.w4} label={row.w4Label} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBadge score={row.w5} label={row.w5Label} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBadge score={row.ms} label={row.msLabel} isMonthly />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !error && ranked.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-500">No saved weekly scores for {monthName} {year}.</p>
        )}
        {loading && (
          <div className="p-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-brand-600" />
            <span>Loading monthly scores…</span>
          </div>
        )}
      </div>
    </div>
  );
}
