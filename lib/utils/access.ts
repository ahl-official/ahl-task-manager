import type { AHLUser, SessionUser, Task, UserScore } from '@/types';

export function isDepartmentLeader(session: Pick<SessionUser, 'role'>): boolean {
  return session.role === 'leader';
}

export function canViewDepartmentData(session: Pick<SessionUser, 'role'>): boolean {
  return session.role === 'admin' || session.role === 'leader';
}

export function canViewTask(session: Pick<SessionUser, 'uid' | 'role' | 'department'>, task: Pick<Task, 'assignedTo' | 'createdBy' | 'handoffUid' | 'department'>): boolean {
  if (session.role === 'admin') return true;
  if (session.role === 'leader') return Boolean(session.department) && task.department === session.department;
  return task.assignedTo === session.uid || task.createdBy === session.uid || task.handoffUid === session.uid;
}

export function filterTasksForSession<T extends Pick<Task, 'assignedTo' | 'createdBy' | 'handoffUid' | 'department'>>(
  session: Pick<SessionUser, 'uid' | 'role' | 'department'>,
  tasks: T[],
): T[] {
  return tasks.filter(task => canViewTask(session, task));
}

export function filterUsersForSession<T extends Pick<AHLUser, 'uid' | 'department'>>(
  session: Pick<SessionUser, 'uid' | 'role' | 'department'>,
  users: T[],
): T[] {
  if (session.role === 'admin') return users;
  if (session.role === 'leader') return users.filter(user => user.department === session.department);
  return users.filter(user => user.uid === session.uid);
}

export function filterScoresForSession<T extends Pick<UserScore, 'uid' | 'department'>>(
  session: Pick<SessionUser, 'uid' | 'role' | 'department'>,
  scores: T[],
): T[] {
  if (session.role === 'admin') return scores;
  if (session.role === 'leader') return scores.filter(score => score.department === session.department);
  return scores.filter(score => score.uid === session.uid);
}
