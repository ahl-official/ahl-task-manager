import type { AHLUser, UserRole } from '@/types';

export const TEAM_ROLES: UserRole[] = ['leader', 'member', 'intern'];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  leader: 'Leader',
  member: 'Member',
  intern: 'Intern',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function canAssignTask(creator: Pick<AHLUser, 'uid' | 'role' | 'department'>, assignee: Pick<AHLUser, 'uid' | 'role' | 'department'>): boolean {
  if (creator.role === 'admin') return true;
  if (creator.role === 'intern') {
    // Intern can assign tasks to themselves
    return creator.uid === assignee.uid;
  }

  const sameDepartment = Boolean(
    creator.department &&
    assignee.department &&
    creator.department.trim().toLowerCase() === assignee.department.trim().toLowerCase()
  );

  if (creator.role === 'leader') {
    if (creator.uid === assignee.uid) return true;
    if (sameDepartment) return ['member', 'intern'].includes(assignee.role);
    return assignee.role === 'leader';
  }

  if (creator.role === 'member') {
    // Member can assign to themselves or interns in their department
    if (creator.uid === assignee.uid) return true;
    return sameDepartment && assignee.role === 'intern';
  }

  return false;
}

export function getAssignableUsers(creator: Pick<AHLUser, 'uid' | 'role' | 'department'>, users: AHLUser[]): AHLUser[] {
  return users.filter(user => user.isActive && canAssignTask(creator, user));
}

export function describeAssignmentRule(role: UserRole): string {
  if (role === 'admin') return 'Admins can assign tasks to anyone.';
  if (role === 'leader') return 'Leaders can assign across departments to leaders, or to members and interns in their department.';
  if (role === 'member') return 'Members can create tasks for themselves or assign to interns in their department.';
  if (role === 'intern') return 'Interns can create tasks for themselves with a department member as checker.';
  return 'Interns can create tasks for themselves.';
}
