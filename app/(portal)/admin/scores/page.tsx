import { adminGetAllScores } from '@/lib/firebase/scores';
import ScoresClient from '@/components/shared/ScoresClient';

export default async function AdminScoresPage() {
  const scores = await adminGetAllScores();
  const serialized = scores.map(s => ({
    ...s,
    lastUpdated: s.lastUpdated.toDate().toISOString(),
  }));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">MIS Scores</h1>
        <p className="text-sm text-gray-500 mt-0.5">Team performance rankings</p>
      </div>
      <ScoresClient scores={serialized} showAll />
    </div>
  );
}
