import type { TaskSerialized } from '@/types';

const PENDING_KEY = 'ahl:pendingCreatedTask:';
const CACHE_KEY = 'ahl:dashboardTasksCache';

function canUseStorage() {
  try { return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'; } catch { return false; }
}

/** Stash a just-created task so the next dashboard mount can show it without refetching. */
export function stashPendingCreatedTask(task: TaskSerialized, uid: string) {
  if (!canUseStorage() || !task?.taskId || !uid) return;
  try {
    sessionStorage.setItem(PENDING_KEY + uid, JSON.stringify(task));
  } catch {
    // ignore quota / private mode
  }
}

export function takePendingCreatedTask(uid: string): TaskSerialized | null {
  if (!canUseStorage() || !uid) return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY + uid);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY + uid);
    const task = JSON.parse(raw) as TaskSerialized;
    return task?.taskId ? task : null;
  } catch {
    return null;
  }
}

export function cacheDashboardTasks(tasks: TaskSerialized[], uid: string) {
  if (!canUseStorage() || !Array.isArray(tasks) || !uid) return;
  try {
    sessionStorage.setItem(CACHE_KEY + ':' + uid, JSON.stringify(tasks.slice(0, 1000)));
  } catch {
    // ignore
  }
}

export function readDashboardTasksCache(uid: string): TaskSerialized[] {
  if (!canUseStorage() || !uid) return [];
  try {
    const raw = sessionStorage.getItem(CACHE_KEY + ':' + uid);
    if (!raw) return [];
    const tasks = JSON.parse(raw);
    return Array.isArray(tasks) ? tasks : [];
  } catch {
    return [];
  }
}

export function clearTaskStorage() {
  if (!canUseStorage()) return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('ahl:pendingCreatedTask') || key?.startsWith(CACHE_KEY)) sessionStorage.removeItem(key);
    }
  } catch { /* private-mode storage may be unavailable */ }
}

/** Merge pending create + optional SSR/cache into one list (newest first). */
export function mergeTasksWithPending(
  base: TaskSerialized[],
  pending: TaskSerialized | null,
): TaskSerialized[] {
  if (!pending?.taskId) return base;
  const rest = base.filter(task => task.taskId !== pending.taskId);
  return [pending, ...rest];
}
