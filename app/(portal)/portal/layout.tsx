import { redirect } from 'next/navigation';
import { getSession } from '@/lib/utils/auth';
import Sidebar from '@/components/shared/Sidebar';
import VerificationNotificationBell from '@/components/shared/VerificationNotificationBell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'admin') redirect('/admin');

  const showVerifyBell = session.role !== 'intern';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar role="user" session={session} />
      <main className="relative flex-1 overflow-y-auto scrollbar-thin pt-14 md:pt-0">
        {showVerifyBell && (
          <div className="pointer-events-none absolute right-4 top-4 z-30 sm:right-6 sm:top-6">
            <div className="pointer-events-auto">
              <VerificationNotificationBell currentUid={session.uid} role="user" />
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
