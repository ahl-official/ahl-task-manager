import { redirect } from 'next/navigation';
import { getSession } from '@/lib/utils/auth';

export default async function ChecklistRouterPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  if (session.role === 'admin') {
    redirect('/admin/checklist');
  }

  redirect('/portal/checklist');
}
