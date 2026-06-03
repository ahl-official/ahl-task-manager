import { redirect } from 'next/navigation';
import { getSession } from '@/lib/utils/auth';
import Sidebar from '@/components/shared/Sidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'admin') redirect('/admin');

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar role="user" session={session} />
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        {children}
      </main>
    </div>
  );
}
