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
  if (creator.uid === assignee.uid) return false;
  if (!creator.department || !assignee.department) return false;

  const sameDepartment = creator.department === assignee.department;

  if (creator.role === 'leader') {
    if (sameDepartment) return ['member', 'intern'].includes(assignee.role);
    return assignee.role === 'leader';
  }

  if (creator.role === 'member') {
    return sameDepartment && assignee.role === 'intern';
  }

  return false;
}

export function getAssignableUsers(creator: Pick<AHLUser, 'uid' | 'role' | 'department'>, users: AHLUser[]): AHLUser[] {
  return users.filter(user => user.isActive && canAssignTask(creator, user));
}

export function describeAssignmentRule(role: UserRole): string {
  if (role === 'admin') return 'Admins can assign tasks to anyone.';
  if (role === 'leader') return 'Leaders can assign across departments only to leaders, or down to members and interns inside their own department.';
  if (role === 'member') return 'Members can assign only to interns inside their own department.';
  return 'Interns cannot assign tasks.';
}
