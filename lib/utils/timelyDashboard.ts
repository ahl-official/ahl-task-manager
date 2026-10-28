import type { SessionUser, Task } from '@/types';
import { timestamp } from '@/lib/cloudflare/timestamp';
import { indiaNoonIso } from '@/lib/utils/indiaDate';

export async function getPersonalTimelyTasks(session: SessionUser): Promise<Task[]> {
  try {
    const { hasCloudflareApi } = await import('@/lib/cloudflare/api');
    if (hasCloudflareApi()) {
      const { getRecurringChecklist } = await import('@/lib/cloudflare/recurring');
      const { indiaTodayKey } = await import('@/lib/utils/indiaDate');
      const { addDaysKey } = await import('@/lib/mis/week');

      const today = indiaTodayKey();
      const yesterday = addDaysKey(today, -1);
      const tomorrow = addDaysKey(today, 1);

      const rawItems = await getRecurringChecklist({
        startDate: yesterday,
        endDate: tomorrow,
        userName: session.name,
        uid: session.uid,
      });

      const d1Items = (rawItems || []).filter(item => {
        const d = String(item.dueDate || item.periodKey || '').slice(0, 10);
        return d >= yesterday && d <= tomorrow;
      });
      if (d1Items && d1Items.length > 0) {
        return d1Items.map(item => {
          const due = timestamp(indiaNoonIso(item.dueDate || item.periodKey))!;
          const done = item.completed ? timestamp(indiaNoonIso(item.completedAt || item.dueDate || item.periodKey)) : null;
          const created = (item as any).createdAt ? timestamp((item as any).createdAt)! : timestamp(indiaNoonIso('2026-09-01'))!;
          return {
            taskId: item.taskId,
            description: item.description,
            assignedTo: session.uid,
            assignedToName: session.name,
            assignedToWa: session.waNumber,
            createdBy: 'recurring-db',
            createdByName: 'Recurring Task',
            handoffUid: session.uid,
            handoffName: session.name,
            handoffWa: session.waNumber,
            category: item.category as any,
            priority: 'Medium',
            status: item.completed ? 'Completed' : 'In Progress',
            department: session.department || item.department,
            startDate: due,
            endDate: due,
            delayedDate: null,
            delayReason: null,
            revisionStatus: 'none',
            notes: item.notes || null,
            acceptedAt: due,
            completedAt: done,
            verifiedAt: null,
            createdAt: created,
            updatedAt: done || due,
            dayKey: item.dueDate || item.periodKey,
            monthKey: (item.dueDate || item.periodKey).slice(0, 7),
          };
        });
      }
    }
  } catch (err) {
    console.warn('Failed to load personal recurring tasks from D1', err);
  }

  return [];
}

export function isOneTimeCategory(category?: string | null): boolean {
  if (!category) return true;
  const lower = category.toLowerCase().replace(/[^a-z]/g, '');
  return lower === 'onetime' || !['daily', 'weekly', 'monthly'].includes(lower);
}

export function mergePersonalDashboardTasks(databaseTasks: Task[], timelyTasks: Task[]) {
  const delegated = databaseTasks
    .filter(task => isOneTimeCategory(task.category))
    .map(task => ({
      ...task,
      category: 'One Time' as const,
    }));
  return [...timelyTasks, ...delegated].sort((a, b) => {
    const aTime = typeof (a.createdAt as any)?.toMillis === 'function' ? a.createdAt.toMillis() : new Date(a.createdAt as any).getTime() || 0;
    const bTime = typeof (b.createdAt as any)?.toMillis === 'function' ? b.createdAt.toMillis() : new Date(b.createdAt as any).getTime() || 0;
    return bTime - aTime;
  });
}
