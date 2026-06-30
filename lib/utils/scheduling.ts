import type { TaskPriority, TaskSerialized } from '@/types';

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  High: 300,
  Medium: 180,
  Low: 80,
};

const ACTIVE_STATUSES = new Set(['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue', 'Dead']);

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - startOfToday().getTime()) / 86_400_000);
}

function deadlineWeight(daysLeft: number | null) {
  if (daysLeft === null) return 0;
  if (daysLeft < 0) return 280;
  if (daysLeft === 0) return 240;
  if (daysLeft === 1) return 210;
  if (daysLeft <= 3) return 170;
  if (daysLeft <= 7) return 110;
  if (daysLeft <= 14) return 60;
  return 20;
}

function riskFor(task: TaskSerialized, daysLeft: number | null): 'blocked' | 'overdue' | 'at-risk' | 'tight' | 'on-track' | 'unscheduled' {
  if (task.status === 'Dead') return 'blocked';
  if (daysLeft === null) return 'unscheduled';
  if (daysLeft < 0) return 'overdue';
  if (task.priority === 'High' && daysLeft <= 2) return 'at-risk';
  if (task.priority === 'Medium' && daysLeft <= 1) return 'at-risk';
  if (daysLeft <= 3) return 'tight';
  return 'on-track';
}

export interface ScheduledTask {
  task: TaskSerialized;
  score: number;
  rank: number;
  daysLeft: number | null;
  risk: ReturnType<typeof riskFor>;
  conflict: boolean;
}

export function scheduleTasks(tasks: TaskSerialized[]): ScheduledTask[] {
  const active = tasks.filter(task => ACTIVE_STATUSES.has(task.status));
  const dateLoad = new Map<string, number>();

  for (const task of active) {
    if (!task.endDate) continue;
    const key = task.endDate.slice(0, 10);
    dateLoad.set(key, (dateLoad.get(key) ?? 0) + 1);
  }

  return active
    .map(task => {
      const daysLeft = daysUntil(task.endDate);
      const conflict = task.endDate ? (dateLoad.get(task.endDate.slice(0, 10)) ?? 0) > 1 : false;
      const score = PRIORITY_WEIGHT[task.priority] + deadlineWeight(daysLeft) + (conflict ? 20 : 0);
      return {
        task,
        score,
        rank: 0,
        daysLeft,
        risk: riskFor(task, daysLeft),
        conflict,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(left.task.endDate ?? left.task.createdAt).getTime() - new Date(right.task.endDate ?? right.task.createdAt).getTime();
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function scheduleByTaskId(tasks: TaskSerialized[]) {
  return new Map(scheduleTasks(tasks).map(item => [item.task.taskId, item]));
}
