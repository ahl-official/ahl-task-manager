import ChecklistClient from '@/components/shared/ChecklistClient';

export default function PortalChecklistPage({
  searchParams,
}: {
  searchParams?: { category?: string; taskId?: string; date?: string };
}) {
  const category = ['Daily', 'Weekly', 'Monthly'].includes(searchParams?.category ?? '')
    ? searchParams?.category as 'Daily' | 'Weekly' | 'Monthly'
    : 'Daily';

  return (
    <div className="p-6">
      <ChecklistClient
        initialCategory={category}
        initialTaskId={searchParams?.taskId?.slice(0, 100)}
        initialDate={searchParams?.date?.slice(0, 10)}
      />
    </div>
  );
}
