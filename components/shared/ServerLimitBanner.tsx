'use client';

import { AlertTriangle, PlusCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface Props {
  role?: 'admin' | 'user';
  message?: string;
  onRefresh?: () => void;
  className?: string;
}

export default function ServerLimitBanner({
  role = 'user',
  message = 'Server read limit reached. Database reads are temporarily paused by quota. Task creation is fully functional — new tasks save directly without reading.',
  onRefresh,
  className = '',
}: Props) {
  const createTaskHref = role === 'admin' ? '/admin/create-task' : '/portal/create-task';

  return (
    <div
      className={`mb-6 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-amber-900 shadow-sm backdrop-blur-sm transition-all animate-in fade-in-50 duration-300 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 mt-0.5">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-amber-950">Server Read Limit Reached</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                ⚡ Task Creation Active
              </span>
            </div>
            <p className="mt-1 text-xs text-amber-800 leading-relaxed max-w-2xl">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100/50 transition-colors"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          )}
          <Link
            href={createTaskHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 shadow-sm transition-colors"
          >
            <PlusCircle size={14} />
            Create Task
          </Link>
        </div>
      </div>
    </div>
  );
}
