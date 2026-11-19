import DeletedTasksClient from '@/components/shared/DeletedTasksClient';
import { getSession } from '@/lib/utils/auth';

export default async function DeletedTasksPage() {
  const session = await getSession();
  return session?.role === 'admin' ? <DeletedTasksClient viewerUid={session.uid} /> : null;
}
