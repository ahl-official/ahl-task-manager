import { getSession } from '@/lib/utils/auth';
import FmsClient from '@/components/shared/FmsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PortalFmsPage() {
  const session = await getSession();
  if (!session) return null;

  return (
    <FmsClient currentUser={session.name} role={session.role} />
  );
}
