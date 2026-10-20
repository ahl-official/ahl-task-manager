import { cfApi, hasCloudflareApi, CloudflareApiError } from '@/lib/cloudflare/api';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import type { Task } from '@/types';

export interface RecurringTemplate {
  id: string;
  category: 'Daily' | 'Weekly' | 'Monthly' | string;
  title: string;
  description: string;
  assignedTo: string;
  assignedToName: string;
  department: string;
  frequency: string;
  dayOfWeek: number | null; // 1=Mon, 2=Tue, ..., 5=Fri, 6=Sat, 7=Sun
  dayOfMonth: number | null; // 1-31
  timeOfDay: string;
  isActive: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringTemplateInput {
  id?: string;
  category: 'Daily' | 'Weekly' | 'Monthly' | string;
  title: string;
  description?: string;
  assignedTo?: string;
  assignedToName: string;
  department?: string;
  frequency?: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timeOfDay?: string;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

export interface RecurringChecklistItem {
  id: string;
  taskId: string;
  templateId: string;
  userId: string;
  userName: string;
  department: string;
  description: string;
  title: string;
  notes: string;
  category: 'Daily' | 'Weekly' | 'Monthly';
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  periodKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  isOnTime: boolean;
  status: 'Completed' | 'Verified' | 'Pending' | 'Dead';
  dead: boolean;
  deadAt: string | null;
  remark: string;
  remarkBy: string;
  label: string;
  canComplete: boolean;
  canManage: boolean;
  mine?: boolean;
}

export interface RecurringMisCounts {
  weekStart: string;
  weekEnd: string;
  byName: Record<string, {
    name: string;
    department: string;
    planned: number;
    done: number;
    onTime: number;
    byCategory: {
      office: { planned: number; done: number; onTime: number };
      salon: { planned: number; done: number; onTime: number };
      weekly: { planned: number; done: number; onTime: number };
    };
  }>;
}

export interface LocalCompletionRecord {
  templateId: string;
  title?: string;
  description?: string;
  department?: string;
  userId?: string;
  userName?: string;
  category?: string;
  completedAt: string;
  status: 'Completed' | 'Verified' | 'Dead';
  remark?: string;
  remarkBy?: string;
}

// In-memory store for local testing prior to Cloudflare Worker deployment
const localTemplates: RecurringTemplate[] = [];
const localCompletions = new Map<string, LocalCompletionRecord>();

export async function getRecurringTemplates(params?: {
  category?: string;
  assignedToName?: string;
  isActive?: boolean | string;
}): Promise<RecurringTemplate[]> {
  if (hasCloudflareApi()) {
    try {
      const search = new URLSearchParams();
      if (params?.category) search.set('category', params.category);
      if (params?.assignedToName) search.set('assignedToName', params.assignedToName);
      if (params?.isActive !== undefined) search.set('isActive', String(params.isActive));
      const qs = search.toString();
      return await cfApi<RecurringTemplate[]>(`/recurring/templates${qs ? `?${qs}` : ''}`);
    } catch (err: any) {
      if (!(err instanceof CloudflareApiError && err.status === 404)) {
        console.warn('Cloudflare getRecurringTemplates error, using local state', err.message);
      }
    }
  }

  let list = [...localTemplates];
  if (params?.category) list = list.filter(t => t.category.toLowerCase() === params.category!.toLowerCase());
  if (params?.assignedToName) list = list.filter(t => t.assignedToName.toLowerCase() === params.assignedToName!.toLowerCase());
  if (params?.isActive !== undefined) list = list.filter(t => String(t.isActive) === String(params.isActive));
  return list;
}

export async function createRecurringTemplate(data: RecurringTemplateInput): Promise<RecurringTemplate> {
  const templateId = data.id || `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const newTemplate: RecurringTemplate = {
    id: templateId,
    category: data.category,
    title: data.title,
    description: data.description || '',
    assignedTo: data.assignedTo || '',
    assignedToName: data.assignedToName,
    department: data.department || '',
    frequency: data.frequency || data.category,
    dayOfWeek: data.dayOfWeek ?? null,
    dayOfMonth: data.dayOfMonth ?? null,
    timeOfDay: data.timeOfDay || '10:00',
    isActive: data.isActive !== false,
    metadata: data.metadata || {},
    createdAt: now,
    updatedAt: now,
  };

  if (hasCloudflareApi()) {
    try {
      return await cfApi<RecurringTemplate>('/recurring/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (err) { throw err; }
  }

  localTemplates.unshift(newTemplate);
  return newTemplate;
}

export async function updateRecurringTemplate(
  id: string,
  data: Partial<RecurringTemplateInput>,
): Promise<RecurringTemplate> {
  if (hasCloudflareApi()) {
    try {
      return await cfApi<RecurringTemplate>(`/recurring/templates/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    } catch (err) { throw err; }
  }

  const idx = localTemplates.findIndex(t => t.id === id);
  if (idx >= 0) {
    localTemplates[idx] = { ...localTemplates[idx], ...data, updatedAt: new Date().toISOString() } as RecurringTemplate;
    return localTemplates[idx];
  }
  throw new Error('Template not found');
}

export async function getRecurringTemplate(id: string): Promise<RecurringTemplate> {
  return cfApi<RecurringTemplate>('/recurring/templates/'+encodeURIComponent(id));
}
export async function deleteRecurringTemplate(id: string): Promise<{ deletedId: string; permanent: boolean }> {
  if (!hasCloudflareApi()) throw new Error('Cloudflare D1 is not configured');
  return cfApi('/recurring/templates/'+encodeURIComponent(id), {method:'DELETE'});
}

export async function getRecurringChecklist(params: {
  category?: string;
  date?: string;
  userName?: string;
  uid?: string;
}): Promise<RecurringChecklistItem[]> {
  const today = indiaTodayKey();
  if (params.date && params.date > today) {
    return [];
  }

  if (hasCloudflareApi()) {
    try {
      const search = new URLSearchParams();
      if (params.category) search.set('category', params.category);
      if (params.date) search.set('date', params.date);
      if (params.userName) search.set('userName', params.userName);
      if (params.uid) search.set('uid', params.uid);
      const qs = search.toString();
      return await cfApi<RecurringChecklistItem[]>(`/recurring/checklist${qs ? `?${qs}` : ''}`);
    } catch (err: any) {
      if (!(err instanceof CloudflareApiError && err.status === 404)) {
        console.warn('Cloudflare getRecurringChecklist error, using tasks fallback', err.message);
      }
      try {
        const tasksRes = await cfApi<Task[]>('/tasks?limit=all');
        const tasksList = Array.isArray(tasksRes) ? tasksRes : (tasksRes as any)?.data || (tasksRes as any)?.tasks || [];
        const targetDate = params.date || indiaTodayKey();

        // 1. Group tasks by recurring definition key: description + assignee + category
        const normalizeKey = (t: any) =>
          `${(t.description || '').trim().toLowerCase()}::${(t.assignedToName || t.assignedTo || '').trim().toLowerCase()}::${(t.category || '').trim().toLowerCase()}`;

        const distinctMap = new Map<string, { definition: any; history: any[] }>();

        for (const t of tasksList) {
          const cat = (t.category || '').toLowerCase();
          if (!['daily', 'weekly', 'monthly'].includes(cat)) continue;
          if (params.category && params.category.toLowerCase() !== 'all' && cat !== params.category.toLowerCase()) continue;
          if (params.userName && (t.assignedToName || '').toLowerCase() !== params.userName.toLowerCase()) continue;
          if (params.uid && t.assignedTo !== params.uid) continue;

          const key = normalizeKey(t);
          if (!distinctMap.has(key)) {
            distinctMap.set(key, { definition: t, history: [t] });
          } else {
            const entry = distinctMap.get(key)!;
            entry.history.push(t);
            // Keep the one with latest ID or richest metadata as the definition
            if (t.taskId > entry.definition.taskId) {
              entry.definition = t;
            }
          }
        }

        const distinctEntries = Array.from(distinctMap.values());

        if (distinctEntries.length > 0) {
          const [y, m, d] = targetDate.split('-').map(Number);
          const dt = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
          const dow = dt.getUTCDay();
          const dowIso = dow === 0 ? 7 : dow; // 1 = Mon .. 7 = Sun
          const mondayDate = new Date(Date.UTC(y, m - 1, d - (dowIso - 1), 6, 0, 0));
          const sundayDate = new Date(Date.UTC(y, m - 1, d + (7 - dowIso), 6, 0, 0));

          const weekStartStr = mondayDate.toISOString().slice(0, 10);
          const weekEndStr = sundayDate.toISOString().slice(0, 10);

          const monthKey = `${y}-${String(m).padStart(2, '0')}`;
          const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const endOfMonthDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

          return distinctEntries.map(({ definition: t, history }) => {
            const cat = (t.category || 'Daily').toLowerCase();
            const isMonthly = cat === 'monthly';
            const isWeekly = cat === 'weekly';

            let dueDate = targetDate;
            let periodStart: string | null = targetDate;
            let periodEnd: string | null = targetDate;
            let periodKey = targetDate;

            if (isMonthly) {
              periodKey = monthKey;
              dueDate = endOfMonthDate;
              periodStart = `${y}-${String(m).padStart(2, '0')}-01`;
              periodEnd = endOfMonthDate;
            } else if (isWeekly) {
              // Determine day of week (1=Mon..7=Sun) from task or its date
              let taskDow = t.dayOfWeek;
              if (!taskDow && t.endDate) {
                const parts = t.endDate.split('-');
                if (parts.length === 3) {
                  const tdt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 6, 0, 0));
                  const tdow = tdt.getUTCDay();
                  taskDow = tdow === 0 ? 7 : tdow;
                }
              }
              taskDow = taskDow || 5; // default Friday

              // Calculate date for this week's occurrence
              const weekOccurDate = new Date(mondayDate.getTime() + (taskDow - 1) * 86400000);
              const wy = weekOccurDate.getUTCFullYear();
              const wm = String(weekOccurDate.getUTCMonth() + 1).padStart(2, '0');
              const wd = String(weekOccurDate.getUTCDate()).padStart(2, '0');
              const calculatedWeekDate = `${wy}-${wm}-${wd}`;

              dueDate = calculatedWeekDate;
              periodStart = weekStartStr;
              periodEnd = weekEndStr;
              periodKey = weekStartStr;
            }

            const comp = localCompletions.get(`${t.taskId}:${periodKey}`);
            let isCompleted = Boolean(comp && (comp.status === 'Completed' || comp.status === 'Verified'));
            let completedAt = comp?.completedAt || null;
            let itemStatus: 'Completed' | 'Verified' | 'Pending' | 'Dead' = comp ? (comp.status as any) : 'Pending';

            // Check if any task in history was completed/verified for this period
            if (!isCompleted) {
              for (const hist of history) {
                if ((hist.status === 'Completed' || hist.status === 'Verified') && hist.completedAt) {
                  const compDate = String(hist.completedAt).slice(0, 10);
                  let matched = false;
                  if (isMonthly) {
                    matched = compDate.startsWith(monthKey);
                  } else if (isWeekly) {
                    matched = Boolean(periodStart && periodEnd && compDate >= periodStart && compDate <= periodEnd);
                  } else {
                    matched = compDate === targetDate;
                  }

                  if (matched) {
                    isCompleted = true;
                    completedAt = String(hist.completedAt);
                    itemStatus = hist.status === 'Verified' ? 'Verified' : 'Completed';
                    break;
                  }
                }
              }
            }

            return {
              id: `${t.taskId}:${periodKey}`,
              taskId: t.taskId,
              templateId: t.taskId,
              userId: t.assignedTo,
              userName: t.assignedToName,
              department: t.department || '',
              description: t.description,
              title: t.description.split('\n')[0].slice(0, 100),
              notes: t.notes || '',
              category: (t.category ? t.category.charAt(0).toUpperCase() + t.category.slice(1).toLowerCase() : 'Daily') as any,
              frequency: t.category || 'Daily',
              dayOfWeek: t.dayOfWeek || null,
              dayOfMonth: t.dayOfMonth || null,
              timeOfDay: t.timeOfDay || '10:00',
              periodKey,
              periodStart,
              periodEnd,
              dueDate,
              completed: isCompleted,
              completedAt: isCompleted ? completedAt : null,
              isOnTime: true,
              status: itemStatus,
              dead: itemStatus === 'Dead',
              deadAt: null,
              remark: t.notes || '',
              remarkBy: '',
              label: `${t.category || 'Recurring'} Task`,
              canComplete: true,
              canManage: true,
            };
          });
        }
      } catch (tasksErr) {
        console.warn('Failed to fetch recurring tasks fallback', tasksErr);
      }
    }
  }

  // Local calculation
  const targetDate = params.date || indiaTodayKey();
  const [y, m, d] = targetDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
  const dow = dt.getUTCDay();
  const dowIso = dow === 0 ? 7 : dow;
  const monthKey = `${y}-${String(m).padStart(2, '0')}`;
  const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endOfMonthDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

  const due = localTemplates.filter(t => {
    if (!t.isActive) return false;

    // Do not show task on dates before it was created!
    const createdDateStr = (t.createdAt || '').slice(0, 10);
    if (createdDateStr) {
      if (t.category.toLowerCase() === 'monthly') {
        if (createdDateStr.slice(0, 7) > monthKey) return false;
      } else {
        if (createdDateStr > targetDate) return false;
      }
    }

    if (params.category && params.category.toLowerCase() !== 'all' && t.category.toLowerCase() !== params.category.toLowerCase()) {
      return false;
    }
    if (params.userName && t.assignedToName.toLowerCase() !== params.userName.toLowerCase()) {
      return false;
    }
    const cat = t.category.toLowerCase();
    if (cat === 'daily') return true;
    if (cat === 'weekly') {
      if (params.category?.toLowerCase() === 'weekly') return true;
      return t.dayOfWeek == null || t.dayOfWeek === dowIso;
    }
    if (cat === 'monthly') return true;
    return true;
  });

  const resultItems = due.map(t => {
    const cat = t.category.toLowerCase();
    let periodKey = targetDate;
    let dueDate = targetDate;
    let periodStart: string | null = targetDate;
    let periodEnd: string | null = targetDate;

    if (cat === 'monthly') {
      periodKey = monthKey;
      dueDate = endOfMonthDate;
      periodStart = `${y}-${String(m).padStart(2, '0')}-01`;
      periodEnd = endOfMonthDate;
    }

    const comp = localCompletions.get(`${t.id}:${periodKey}`);
    const completed = Boolean(comp && (comp.status === 'Completed' || comp.status === 'Verified'));
    const isDead = Boolean(comp && comp.status === 'Dead');
    const itemStatus: 'Completed' | 'Verified' | 'Pending' | 'Dead' = comp ? (comp.status as any) : 'Pending';

    return {
      id: `${t.id}:${periodKey}`,
      taskId: t.id,
      templateId: t.id,
      userId: t.assignedTo,
      userName: t.assignedToName,
      department: t.department,
      description: t.description || t.title,
      title: t.title,
      notes: t.description,
      category: t.category as any,
      frequency: t.frequency,
      dayOfWeek: t.dayOfWeek,
      dayOfMonth: t.dayOfMonth,
      timeOfDay: t.timeOfDay,
      periodKey,
      periodStart,
      periodEnd,
      dueDate,
      completed,
      completedAt: comp?.completedAt || null,
      isOnTime: true,
      status: itemStatus,
      dead: isDead,
      deadAt: isDead ? comp?.completedAt || null : null,
      remark: comp?.remark || '',
      remarkBy: comp?.remarkBy || '',
      label: `${t.category} Task`,
      canComplete: true,
      canManage: true,
    };
  });

  // Also include completed tasks whose template was deleted so past date filters still show them
  const existingIds = new Set(resultItems.map(it => it.taskId));
  localCompletions.forEach((comp, k) => {
    const [tId, pKey] = k.split(':');
    const matchesPeriod = pKey === targetDate || (params.category?.toLowerCase() === 'monthly' && pKey === monthKey);
    if (matchesPeriod && !existingIds.has(tId)) {
      if (params.category && params.category.toLowerCase() !== 'all' && comp.category?.toLowerCase() !== params.category.toLowerCase()) return;
      if (params.userName && comp.userName?.toLowerCase() !== params.userName.toLowerCase()) return;

      resultItems.push({
        id: `${tId}:${pKey}`,
        taskId: tId,
        templateId: tId,
        userId: comp.userId || '',
        userName: comp.userName || 'Unassigned',
        department: comp.department || '',
        description: comp.description || comp.title || 'Recurring Task (Completed)',
        title: comp.title || 'Recurring Task',
        notes: comp.description || '',
        category: (comp.category ? comp.category.charAt(0).toUpperCase() + comp.category.slice(1).toLowerCase() : 'Daily') as any,
        frequency: comp.category || 'Daily',
        dayOfWeek: null,
        dayOfMonth: null,
        timeOfDay: '10:00',
        periodKey: pKey,
        periodStart: pKey,
        periodEnd: pKey,
        dueDate: pKey,
        completed: comp.status === 'Completed' || comp.status === 'Verified',
        completedAt: comp.completedAt,
        isOnTime: true,
        status: comp.status,
        dead: comp.status === 'Dead',
        deadAt: comp.status === 'Dead' ? comp.completedAt : null,
        remark: comp.remark || '',
        remarkBy: comp.remarkBy || '',
        label: `${comp.category || 'Recurring'} Task`,
        canComplete: false,
        canManage: true,
      });
    }
  });

  return resultItems;
}

export async function getRecurringPeriod(templateId: string, periodKey: string): Promise<RecurringChecklistItem> {
  return cfApi<RecurringChecklistItem>('/recurring/period?' + new URLSearchParams({ templateId, periodKey }));
}

export async function completeRecurringTask(data: {
  templateId: string; title?: string; description?: string; department?: string;
  uid?: string; userName?: string; category?: string; periodKey: string;
  action?: 'complete' | 'uncomplete' | 'dead' | 'skip_day' | 'remark' | 'verify' | 'revive';
  isAdmin?: boolean; remark?: string; remarkBy?: string;
}): Promise<Record<string, unknown>> {
  if (!hasCloudflareApi()) throw new Error('Cloudflare D1 is not configured');
  // A checklist occurrence never changes the standing task definition.
  // Propagate write failures: an in-memory fallback must not report a persisted completion.
  return cfApi<Record<string, unknown>>('/recurring/completions', {
    method: 'POST', body: JSON.stringify(data),
  });
}

export async function getRecurringMisCounts(weekStart: string, weekEnd: string): Promise<RecurringMisCounts> {
  if (hasCloudflareApi()) {
    try {
      return await cfApi<RecurringMisCounts>(
        `/recurring/mis-counts?weekStart=${encodeURIComponent(weekStart)}&weekEnd=${encodeURIComponent(weekEnd)}`
      );
    } catch (err: any) {
      throw err;
    }
  }

  throw new Error('Cloudflare MIS counts are not configured');
}
