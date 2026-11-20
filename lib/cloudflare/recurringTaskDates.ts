import { cfApi } from '@/lib/cloudflare/api';

type RecurringSummary = { taskId: string; recurringDueDate: string | null; recurringOpenDate: string | null; recurringStatus: string | null };
// Enrich only the loaded All Tasks page; never fetch every recurring occurrence.
export async function withRecurringTaskDates<T extends { taskId: string; category: string }>(tasks: T[], fresh = false) {
  const recurring = tasks.filter(task => ['daily', 'weekly', 'monthly'].includes(task.category.toLowerCase()));
  if (!recurring.length) return tasks;
  const byId = new Map<string, RecurringSummary>();
  try {
    const ids = Array.from(new Set(recurring.map(task => task.taskId)));
    for (let offset = 0; offset < ids.length; offset += 100) {
      const params = new URLSearchParams({ ids: ids.slice(offset, offset + 100).sort().join(',') });
      if (fresh) params.set('fresh', 'true');
      const rows = await cfApi<RecurringSummary[]>('/recurring/task-dates?' + params);
      for (const row of rows) byId.set(row.taskId, row);
    }
  } catch (error) {
    console.error('Recurring occurrence date lookup failed', error);
  }
  return tasks.map(task => ['daily', 'weekly', 'monthly'].includes(task.category.toLowerCase())
    ? { ...task, recurringDueDate: byId.get(task.taskId)?.recurringDueDate ?? null, recurringOpenDate: byId.get(task.taskId)?.recurringOpenDate ?? null, recurringStatus: byId.get(task.taskId)?.recurringStatus ?? null }
    : task);
}
