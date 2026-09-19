import { ScoresDepartmentGridSkeleton, Skeleton } from '@/components/shared/ScoreSkeleton';

export default function AdminScoresLoading() {
  return (
    <div className="p-6">
      <div className="mb-6 pr-14 space-y-1">
        <Skeleton className="h-7 w-36 rounded" />
        <Skeleton className="h-4 w-96 max-w-full rounded" />
      </div>
      <ScoresDepartmentGridSkeleton />
    </div>
  );
}
