import { redirect } from 'next/navigation';
import { getSession } from '@/lib/utils/auth';

export default async function RootPage() {
  const session = await getSession();
  if (session) {
    redirect(session.role === 'admin' ? '/admin' : '/portal');
  }
  redirect('/login');
}
