'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type TabScope = 'scores' | 'tasks' | 'checklist' | 'fms' | 'users' | 'revisions' | 'calendar' | 'all';

function getTabScope(pathname: string): { scope: TabScope; label: string } {
  const p = pathname.toLowerCase();
  if (p.includes('/scores')) return { scope: 'scores', label: 'Scores' };
  if (p.includes('/checklist')) return { scope: 'checklist', label: 'Checklist' };
  if (p.includes('/fms')) return { scope: 'fms', label: 'FMS' };
  if (p.includes('/users')) return { scope: 'users', label: 'Team' };
  if (p.includes('/revisions')) return { scope: 'revisions', label: 'Revisions' };
  if (p.includes('/calendar')) return { scope: 'calendar', label: 'Calendar' };
  if (
    p.includes('/tasks') ||
    p === '/admin' ||
    p === '/portal' ||
    p.includes('/department')
  ) {
    return { scope: 'tasks', label: 'Tasks' };
  }
  return { scope: 'all', label: 'Data' };
}

export default function GlobalRefreshButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [refreshing, setRefreshing] = useState(false);

  const { scope, label } = getTabScope(pathname || '');

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);

    try {
      // 1. Invalidate ONLY this specific tab's server cache and restart its timer
      const res = await fetch(`/api/cache/refresh?scope=${scope}`, { method: 'POST' });
      if (!res.ok) throw new Error('Cache reset returned non-OK status');

      // 2. Broadcast event to any client-rendered components on this specific tab
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-global-refresh', { detail: { scope } }));
      }

      // 3. Re-execute ONLY the current active tab's Server Component
      router.refresh();

      toast.success(`${label} refreshed & cache timer restarted`);
    } catch (err) {
      console.error('Refresh error:', err);
      toast.error(`Failed to refresh ${label}`);
    } finally {
      setTimeout(() => {
        setRefreshing(false);
      }, 600);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      title={`Rescan ${label} from database & restart cache timer`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm backdrop-blur-xs transition-all hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 active:scale-95 disabled:cursor-wait disabled:opacity-75',
        refreshing && 'border-brand-300 bg-brand-50/50'
      )}
    >
      <RotateCw
        size={14}
        className={cn('text-brand-600 transition-transform', refreshing && 'animate-spin')}
      />
      <span className="hidden sm:inline">
        {refreshing ? `Refreshing ${label}…` : `Refresh ${label}`}
      </span>
      <span className="sm:hidden">{refreshing ? '…' : 'Refresh'}</span>
    </button>
  );
}
