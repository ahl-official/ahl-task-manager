import { adminGetAllScores } from '@/lib/firebase/scores';
import { adminGetAllTasks, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import { adminGetDepartments, serializeDepartment } from '@/lib/firebase/departments';
import ScoresClient from '@/components/shared/ScoresClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';

export default async function AdminScoresPage() {
  const [scores, tasks, users, departments] = await Promise.all([
    adminGetAllScores(),
    adminGetAllTasks({ limit: null }),
    adminGetAllUsers(),
    adminGetDepartments(),
  ]);
  const serialized = scores.map(s => ({
    ...s,
    lastUpdated: s.lastUpdated.toDate().toISOString(),
  }));
  const hydratedTasks = hydrateTasksWithUsers(tasks, users);

  const serializedTasks = hydratedTasks.map(serializeTask);
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
