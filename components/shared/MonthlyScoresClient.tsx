'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Loader2, CheckSquare, Square } from 'lucide-react';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import { createTabCache } from '@/lib/utils/tabCache';
import { downloadMisMonthlyPdf, downloadMonthlySummaryTablePdf } from '@/lib/mis/directPdf';
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

export default function MonthlyScoresClient({ currentUid }: { currentUid: string }) {
  const today = indiaTodayKey();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [isDownloadingSummary, setIsDownloadingSummary] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
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
      setSelectedUids(cached.map(r => r.uid || r.name));
      setLoading(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    setError('');
    setLoading(true);
    setRows([]);
    setSelectedUids([]);
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
        setSelectedUids(data.map(r => r.uid || r.name));
        monthlyReports.set(cacheKey, data);
        forceRefresh.current = false;
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message || 'Could not load monthly scores'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [year, month, cacheKey, refreshVersion]);

  const ranked = useMemo(() => [...rows].sort((a, b) => {
    if (a.ms === null) return 1;
    if (b.ms === null) return -1;
    return a.ms - b.ms || a.name.localeCompare(b.name);
  }), [rows]);

  // Individual person monthly report PDF
  async function handleDownloadPersonPdf(row: MonthlyRow) {
    if (downloadingName) return;
    setDownloadingName(row.name);
    try {
      await downloadMisMonthlyPdf({
        name: row.name,
        department: row.department,
        w1: row.w1,
        w2: row.w2,
        w3: row.w3,
        w4: row.w4,
        w5: row.w5,
        ms: row.ms,
        monthName,
        year,
      });
      toast.success(`Downloaded monthly report for ${row.name}`);
    } catch (err: any) {
      toast.error(`Failed to generate PDF for ${row.name}: ${err?.message || 'Error'}`);
    } finally {
      setDownloadingName(null);
    }
  }

  // Summary Table PDF
  async function handleDownloadSummaryPdf() {
    if (isDownloadingSummary || ranked.length === 0) return;
    setIsDownloadingSummary(true);
    try {
      await downloadMonthlySummaryTablePdf(ranked, monthName, year);
      toast.success(`Downloaded ${monthName} ${year} Monthly Summary PDF`);
    } catch (err: any) {
      toast.error(`Failed to generate summary PDF: ${err?.message || 'Error'}`);
    } finally {
      setIsDownloadingSummary(false);
    }
  }

  // Bulk download selected employee monthly PDFs
  async function handleDownloadSelectedPdfs() {
    if (isBulkDownloading || ranked.length === 0) return;
    const selected = ranked.filter(r => selectedUids.includes(r.uid || r.name));
    if (selected.length === 0) {
      toast.error('No members selected for download');
      return;
    }

    setIsBulkDownloading(true);
    let count = 0;
    try {
      for (const row of selected) {
        setDownloadProgress(`Preparing ${count + 1} of ${selected.length}: ${row.name}`);
        try {
          await downloadMisMonthlyPdf({
            name: row.name,
            department: row.department,
            w1: row.w1,
            w2: row.w2,
            w3: row.w3,
            w4: row.w4,
            w5: row.w5,
            ms: row.ms,
            monthName,
            year,
          });
          count += 1;
          await new Promise(r => setTimeout(r, 400));
        } catch (itemErr) {
          console.error(`Failed PDF for ${row.name}:`, itemErr);
        }
      }
      toast.success(`Downloaded ${count} of ${selected.length} monthly PDFs`);
      setDownloadProgress(`Completed ${count} of ${selected.length} downloads.`);
    } finally {
      setIsBulkDownloading(false);
      setTimeout(() => setDownloadProgress(null), 6000);
    }
  }

  // Member search for picker
  const filteredRanked = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(r => r.name.toLowerCase().includes(q) || r.department.toLowerCase().includes(q));
  }, [ranked, memberQuery]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Monthly Scores</h1>
          <p className="mt-1 text-sm text-gray-500">Weekly scores and their monthly average for {monthName} {year}, ordered from lowest to highest gap.</p>
        </div>

        {/* Global PDF Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadSummaryPdf}
            disabled={loading || ranked.length === 0 || isDownloadingSummary}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            title="Download complete Monthly Scores summary table as a PDF"
          >
            {isDownloadingSummary ? <Loader2 size={16} className="animate-spin text-gray-500" /> : <FileText size={16} className="text-brand-600" />}
            <span>Summary Table PDF</span>
          </button>

          {/* Member Picker Dropdown for Bulk Download */}
          <details className="relative min-w-[200px]">
            <summary className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 flex items-center justify-between gap-2">
              <span>Select Members ({selectedUids.length}/{ranked.length})</span>
            </summary>
            <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
              <input
                type="search"
                placeholder="Search staff..."
                value={memberQuery}
                onChange={e => setMemberQuery(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 mb-2"
              />
              <div className="flex items-center justify-between border-b border-gray-100 px-1 pb-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedUids(ranked.map(r => r.uid || r.name))}
                  className="text-brand-600 hover:underline font-medium"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUids([])}
                  className="text-gray-500 hover:underline"
                >
                  Clear All
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto py-1 space-y-0.5">
                {filteredRanked.map(r => {
                  const key = r.uid || r.name;
                  const isChecked = selectedUids.includes(key);
                  return (
                    <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) setSelectedUids(prev => [...prev, key]);
                          else setSelectedUids(prev => prev.filter(k => k !== key));
                        }}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="font-medium text-gray-800 truncate">{r.name}</span>
                      <span className="text-gray-400 text-[10px] ml-auto truncate">{r.department}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </details>

          <button
            type="button"
            onClick={handleDownloadSelectedPdfs}
            disabled={loading || selectedUids.length === 0 || isBulkDownloading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            title="Download individual Monthly Reports for all selected staff"
          >
            {isBulkDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span>Download Selected PDFs</span>
          </button>
        </div>
      </div>

      {downloadProgress && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-3.5 py-2 text-xs font-medium text-blue-700 flex items-center gap-2">
          {isBulkDownloading && <Loader2 size={14} className="animate-spin" />}
          <span>{downloadProgress}</span>
        </div>
      )}

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
          {ranked.length} staff member{ranked.length === 1 ? '' : 's'} ranked
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
              <th className="px-4 py-3 text-center w-28">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ranked.map((row, index) => {
              const isBusy = downloadingName === row.name;
              return (
                <tr key={row.uid || `${row.name}:${index}`} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-gray-500">{row.department || '—'}</td>
                  {[row.w1Label, row.w2Label, row.w3Label, row.w4Label, row.w5Label].map((value, week) => (
                    <td key={week} className="px-4 py-3 text-right tabular-nums text-gray-700">{value || '—'}</td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-700">{row.msLabel || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDownloadPersonPdf(row)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-xs hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 transition-colors"
                      title={`Download official Monthly Performance Report PDF for ${row.name}`}
                    >
                      {isBusy ? <Loader2 size={12} className="animate-spin text-brand-600" /> : <Download size={12} className="text-gray-500" />}
                      <span>PDF</span>
                    </button>
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
