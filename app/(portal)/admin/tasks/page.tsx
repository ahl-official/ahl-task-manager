import { getSession } from '@/lib/utils/auth';
import { adminGetAllTasks, adminGetTaskCounts, serializeTask } from '@/lib/firebase/tasks';
import { adminGetAllUsers } from '@/lib/firebase/users';
import TaskListClient from '@/components/shared/TaskListClient';
import { hydrateTasksWithUsers } from '@/lib/utils/taskHydration';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminTasksPage() {
  const [session, tasks, counts, users] = await Promise.all([
    getSession(),
    adminGetAllTasks({ limit: 1000 }),
    adminGetTaskCounts(),
    adminGetAllUsers(),
  ]);

  const hydratedTasks = hydrateTasksWithUsers(tasks, users);

  const serialized = hydratedTasks.map(serializeTask);
  const serializedUsers = users.map(u => ({
    uid: u.uid,
    name: u.name,
    department: u.department,
    role: u.role,
    isActive: u.isActive,
  }));

  return (
    <div className="p-6">
      <TaskListClient
        headerTitle="All Tasks"
        headerSubtitle={
          tasks.length < counts.total
            ? `Showing recent ${tasks.length} of ${counts.total} tasks.`
            : `Showing all ${counts.total} tasks.`
        }
        tasks={serialized}
        role="admin"
        currentUid={session?.uid || ''}
        currentUserName={session?.name || ''}
        users={serializedUsers}
        initialCounts={counts}
        totalCount={counts.total}
      />
    </div>
  );
}

