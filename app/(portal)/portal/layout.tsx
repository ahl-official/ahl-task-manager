import { redirect } from 'next/navigation';
import { getSession } from '@/lib/utils/auth';
import Sidebar from '@/components/shared/Sidebar';
import GlobalRefreshButton from '@/components/shared/GlobalRefreshButton';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'admin') redirect('/admin');

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar role="user" session={session} />
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Dedicated top utility bar - completely separate from content, zero overlap */}
        <header className="h-16 border-b border-gray-200/90 bg-white px-4 sm:px-8 flex items-center justify-between shrink-0 z-20 shadow-xs">
          <div className="flex items-center gap-3 pl-12 md:pl-0">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 hidden sm:inline">
              Team Member Portal
            </span>
          </div>
          <div className="flex items-center gap-3">
            <GlobalRefreshButton />
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
