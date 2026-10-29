'use client';

import { AlertTriangle, PlusCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 max-w-4xl">
      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-6 text-amber-950 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <AlertTriangle size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">Server Limit Reached</h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                ⚡ Task Creation Active
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Database reads could not be loaded right now due to server/read quota limits.
              However, <strong>task creation and delegations are unaffected</strong> because new tasks save directly without reading existing records.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
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
      </div>
    </div>
  );
}
