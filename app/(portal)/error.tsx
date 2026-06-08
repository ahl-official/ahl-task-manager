'use client';

import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

function isQuotaError(error: Error & { digest?: string }) {
  const text = `${error.name} ${error.message}`.toLowerCase();
  return text.includes('firestore quota') || text.includes('quota exceeded') || text.includes('resource_exhausted');
}

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const quotaError = isQuotaError(error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <section className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <AlertTriangle size={22} />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-gray-900">
              {quotaError ? 'Firestore quota is exhausted' : 'The portal could not load data'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {quotaError
                ? 'Firebase is refusing database reads right now, so the website cannot display tasks, users, scores, or departments until quota is restored.'
                : 'The data request failed before the page could render. Try again, and check Vercel logs if it continues.'}
            </p>

            {quotaError && (
              <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-900">
                <p className="font-medium">What to do now</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Open Firebase Console for this project and check Firestore usage/quota.</li>
                  <li>Enable billing or wait for the daily Firestore quota reset.</li>
                  <li>After quota is restored, refresh this page. The mapping fixes are already deployed.</li>
                </ul>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="btn-primary"
              >
                <RefreshCw size={16} />
                Try again
              </button>
              {quotaError && (
                <a
                  href="https://console.firebase.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  <ExternalLink size={16} />
                  Open Firebase Console
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
