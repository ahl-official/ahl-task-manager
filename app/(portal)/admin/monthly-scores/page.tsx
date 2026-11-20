import MonthlyScoresClient from '@/components/shared/MonthlyScoresClient';
import { getSession } from '@/lib/utils/auth';

export default async function MonthlyScoresPage() {
  const session = await getSession();
  return session?.role === 'admin' ? <MonthlyScoresClient currentUid={session.uid} /> : null;
}
