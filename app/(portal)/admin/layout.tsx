import { redirect } from 'next/navigation';
import { getSession } from '@/lib/utils/auth';
import Sidebar from '@/components/shared/Sidebar';
import VerificationNotificationBell from '@/components/shared/VerificationNotificationBell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/portal');

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar role="admin" session={session} />
      <main className="relative flex-1 overflow-y-auto scrollbar-thin">
        <div className="pointer-events-none absolute right-4 top-5 z-30 sm:right-6 sm:top-6">
          <div className="pointer-events-auto">
            <VerificationNotificationBell currentUid={session.uid} role="admin" />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
