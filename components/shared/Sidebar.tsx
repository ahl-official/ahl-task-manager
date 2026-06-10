'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, CheckSquare, Users, Calendar,
  BarChart2, RefreshCw, PlusCircle, LogOut, Menu, X,
  Building2, ListChecks, HelpCircle,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/firebase/client';
import { signOut } from 'firebase/auth';
import { toast } from 'sonner';
import type { SessionUser } from '@/types';

const ADMIN_NAV = [
  { href: '/admin',             icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/checklist',          icon: ListChecks,      label: 'Checklist'  },
  { href: '/admin/tasks',       icon: CheckSquare,     label: 'All Tasks'  },
  { href: '/admin/calendar',    icon: Calendar,        label: 'Calendar'   },
  { href: '/admin/create-task', icon: PlusCircle,      label: 'Create Task'},
  { href: '/admin/revisions',   icon: RefreshCw,       label: 'Revisions'  },
  { href: '/admin/scores',      icon: BarChart2,       label: 'Scores'     },
  { href: '/admin/users',       icon: Users,           label: 'Team'       },
];

const USER_NAV = [
  { href: '/portal',             icon: LayoutDashboard, label: 'My Tasks'       },
  { href: '/checklist',           icon: ListChecks,      label: 'Checklist'      },
  { href: '/portal/department',  icon: Building2,       label: 'Dept Tasks'     },
  { href: '/portal/revisions',   icon: RefreshCw,       label: 'Revisions'      },
  { href: '/portal/create-task', icon: PlusCircle,      label: 'Create Task'    },
  { href: '/portal/scores',      icon: BarChart2,       label: 'My Score'       },
  { href: '/portal/help',        icon: HelpCircle,      label: 'Help'           },
];

export default function Sidebar({
  role,
  session,
}: {
  role: 'admin' | 'user';
  session: SessionUser;
}) {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen] = useState(false);
  const nav = role === 'admin'
    ? ADMIN_NAV
    : USER_NAV.filter(item => item.href !== '/portal/department' || session.role === 'leader');

  async function handleLogout() {
    await signOut(auth);
    await fetch('/api/auth/session', { method: 'DELETE' });
    toast.success('Logged out');
    router.push('/login');
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
            AHL
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Task Manager</p>
            <p className="text-[11px] text-gray-400 capitalize">{role} portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, icon: Icon, label }) => {
          const active =
            pathname === href ||
            (href === '/checklist' && pathname.endsWith('/checklist')) ||
            (href !== '/admin' && href !== '/portal' && href !== '/checklist' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <Icon size={17} className={active ? 'text-brand-600' : ''} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 pb-4 border-t border-gray-100 pt-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center">
            {session.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{session.name}</p>
            <p className="text-[11px] text-gray-400 truncate">{session.department}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[var(--sidebar-width)] bg-white border-r border-gray-100 shrink-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-xl shadow-card border border-gray-100"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Mobile drawer */}
      {open && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 w-64 bg-white border-r border-gray-100">
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  );
}
