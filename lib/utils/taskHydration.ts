import type { AHLUser, Task } from '@/types';

type UserLite = Pick<AHLUser, 'uid' | 'name' | 'department' | 'waNumber'>;

function normalizeName(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function hydrateTasksWithUsers<T extends Task>(tasks: T[], users: UserLite[]): T[] {
  const usersByUid = new Map(users.map(user => [user.uid, user]));
  const usersByName = new Map(users.map(user => [normalizeName(user.name), user]));

  return tasks.map(task => {
    const assignee = usersByUid.get(task.assignedTo) ?? usersByName.get(normalizeName(task.assignedToName));
    const handoff = usersByUid.get(task.handoffUid) ?? usersByName.get(normalizeName(task.handoffName));

    if (!assignee && !handoff) return task;

    return {
      ...task,
      assignedTo: assignee?.uid ?? task.assignedTo,
      assignedToName: assignee?.name ?? task.assignedToName,
      assignedToWa: assignee?.waNumber ?? task.assignedToWa,
      department: assignee?.department ?? task.department,
      handoffUid: handoff?.uid ?? task.handoffUid,
      handoffName: handoff?.name ?? task.handoffName,
      handoffWa: handoff?.waNumber ?? task.handoffWa,
    };
  });
}
