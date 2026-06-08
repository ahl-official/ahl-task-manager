import type { AHLUser, Task } from '@/types';

type UserLite = Pick<AHLUser, 'uid' | 'name' | 'department' | 'waNumber'>;

function normalizeName(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function aliasKey(value: unknown) {
  return normalizeName(value).replace(/[^a-z0-9]+/g, '');
}

function userAliases(name: unknown) {
  const raw = normalizeName(name);
  const parts = raw.split(/[\s_-]+/).filter(part => part.length > 1);
  return Array.from(new Set([raw, aliasKey(raw), ...parts, ...parts.map(aliasKey)].filter(Boolean)));
}

export function hydrateTasksWithUsers<T extends Task>(tasks: T[], users: UserLite[]): T[] {
  const usersByUid = new Map(users.map(user => [user.uid, user]));
  const usersByName = new Map<string, UserLite>();
  const ambiguousAliases = new Set<string>();

  for (const user of users) {
    for (const alias of userAliases(user.name)) {
      if (ambiguousAliases.has(alias)) continue;
      if (usersByName.has(alias)) {
        usersByName.delete(alias);
        ambiguousAliases.add(alias);
        continue;
      }
      usersByName.set(alias, user);
    }
  }

  return tasks.map(task => {
    const assignee = usersByUid.get(task.assignedTo)
      ?? usersByName.get(normalizeName(task.assignedToName))
      ?? usersByName.get(aliasKey(task.assignedToName));
    const handoff = usersByUid.get(task.handoffUid)
      ?? usersByName.get(normalizeName(task.handoffName))
      ?? usersByName.get(aliasKey(task.handoffName));

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
