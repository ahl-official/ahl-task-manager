'use client';

import { AlertTriangle, PlusCircle, RefreshCw, LayoutDashboard, CheckSquare, ListChecks, Layers, BarChart2 } from 'lucide-react';
import Link from 'next/link';

function isQuotaError(error: Error & { digest?: string }) {
  const text = `${error.name} ${error.message}`.toLowerCase();
  return (
    text.includes('firestore quota') ||
    text.includes('quota exceeded') ||
    text.includes('resource_exhausted') ||
    text.includes('read limit') ||
    text.includes('rate limit') ||
    text.includes('limit') ||
    text.includes('429')
  );
}

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const quotaError = isQuotaError(error);

  const navLinks = [
    { href: '/admin', label: 'Admin Dashboard', icon: LayoutDashboard },
    { href: '/admin/tasks', label: 'All Tasks', icon: CheckSquare },
    { href: '/admin/checklist', label: 'Checklist', icon: ListChecks },
    { href: '/admin/fms', label: 'FMS', icon: Layers },
    { href: '/admin/scores', label: 'Scores', icon: BarChart2 },
    { href: '/portal', label: 'Member Portal', icon: LayoutDashboard },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top persistent navigation bar with tabs */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
              AHL
            </div>
            <span className="font-semibold text-gray-900 text-sm hidden sm:inline">AHL Task Manager</span>
          </div>

          {/* Quick Tabs */}
          <nav className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none text-xs">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-700 hover:text-gray-900 hover:bg-gray-100 font-medium transition-colors whitespace-nowrap"
              >
                <Icon size={14} className="text-gray-500" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {/* Create Task Button */}
          <Link
            href="/admin/create-task"
            className="btn-primary text-xs shrink-0 inline-flex items-center gap-1.5 shadow-sm"
          >
            <PlusCircle size={14} />
            <span>Create Task</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-6">
        <section className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-card">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 mt-0.5">
              <AlertTriangle size={22} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900">
                  {quotaError ? 'Server Read Limit Reached' : 'The page could not load data'}
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  ⚡ Task Creation Active
                </span>
              </div>

              <p className="mt-2 text-sm leading-6 text-gray-600">
                {quotaError
                  ? 'Database reads are temporarily paused by quota limits. You can still create and delegate tasks — task creation writes directly to the database without reading.'
                  : 'The data request failed before the page could render. You can still navigate between tabs or create a new task.'}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/admin/create-task"
                  className="btn-primary inline-flex items-center gap-2 shadow-sm"
                >
                  <PlusCircle size={16} />
                  Create Task
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
