import { getSession } from '@/lib/utils/auth';
import HelpDeskClient from '@/components/shared/HelpDeskClient';

export default async function PortalHelpPage() {
  const session = await getSession();
  return <HelpDeskClient session={session} />;
}
