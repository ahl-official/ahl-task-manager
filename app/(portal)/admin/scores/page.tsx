import { adminGetAllScores } from '@/lib/firebase/scores';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminGetDepartments, serializeDepartment } from '@/lib/firebase/departments';
import ScoresClient from '@/components/shared/ScoresClient';

function scoreLastUpdatedIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  return new Date().toISOString();
}

export default async function AdminScoresPage() {
  const [scores, users, departments] = await Promise.all([
    adminGetAllScores(),
    adminGetAllUsers(),
    adminGetDepartments(),
  ]);
  const serialized = scores.map(s => ({
    ...s,
    lastUpdated: scoreLastUpdatedIso(s.lastUpdated),
  }));
  const serializedUsers = users.map(user => ({
    uid: user.uid,
    name: user.name,
    department: user.department,
    role: user.role,
    isActive: user.isActive,
  }));

  return (
    <div className="p-6">
      <div className="mb-6 pr-14">
        <h1 className="text-xl font-semibold text-gray-900">MIS Scores</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Open a department → member to view the MIS report (Checklist + Delegation + FMS) and download PDF.
        </p>
      </div>
      <ScoresClient
        scores={serialized}
        users={serializedUsers}
        tasks={[]}
        departments={departments.map(serializeDepartment)}
        viewerRole="admin"
        showDepartments
      />
    </div>
  );
}
