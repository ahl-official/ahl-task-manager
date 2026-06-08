import { adminGetAllScores } from '@/lib/firebase/scores';
import { adminGetAllTasks } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminGetDepartments, serializeDepartment } from '@/lib/firebase/departments';
import ScoresClient from '@/components/shared/ScoresClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function AdminScoresPage() {
  const [scores, tasks, users, departments] = await Promise.all([
    adminGetAllScores(),
    adminGetAllTasks(),
    adminGetAllUsers(),
    adminGetDepartments(),
  ]);
  const serialized = scores.map(s => ({
    ...s,
    lastUpdated: s.lastUpdated.toDate().toISOString(),
  }));
  const hydratedTasks = hydrateTasksWithUsers(tasks, users);

  const serializedTasks = hydratedTasks.map(t => ({
    ...t,
    startDate:   t.startDate?.toDate().toISOString() ?? null,
    endDate:     t.endDate?.toDate().toISOString() ?? null,
    delayedDate: t.delayedDate?.toDate().toISOString() ?? null,
    acceptedAt:  t.acceptedAt?.toDate().toISOString() ?? null,
    completedAt: t.completedAt?.toDate().toISOString() ?? null,
    verifiedAt:  t.verifiedAt?.toDate().toISOString() ?? null,
    createdAt:   t.createdAt.toDate().toISOString(),
    updatedAt:   t.updatedAt.toDate().toISOString(),
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
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">MIS Scores</h1>
        <p className="text-sm text-gray-500 mt-0.5">Department and individual performance rankings</p>
      </div>
      <ScoresClient
        scores={serialized}
        users={serializedUsers}
        tasks={serializedTasks}
        departments={departments.map(serializeDepartment)}
        viewerRole="admin"
        showDepartments
      />
    </div>
  );
}
