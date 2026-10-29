import { cookies } from 'next/headers';

const TASK_REFRESH_COOKIE = 'ahl_tasks_refresh_at';

export function shouldRefreshTasks(): boolean {
  const refreshedAt = Number(cookies().get(TASK_REFRESH_COOKIE)?.value);
  return Number.isFinite(refreshedAt) && refreshedAt > 0 && Date.now() - refreshedAt < 30_000;
}

export { TASK_REFRESH_COOKIE };
