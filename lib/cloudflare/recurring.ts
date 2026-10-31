import { cfApi, hasCloudflareApi, CloudflareApiError } from '@/lib/cloudflare/api';
import { indiaTodayKey } from '@/lib/utils/indiaDate';
import { addDaysKey } from '@/lib/mis/week';

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
  startDate?: string | null;
  dueDate?: string | null;
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
  const templateId = data.id || `T-local-${Date.now().toString().slice(-4)}`;
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
      const created = await cfApi<RecurringTemplate>('/recurring/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      // Guarantee period rows are materialized for the current month right now
      // so today's checklist slot appears in the user's portal immediately!
      if (created?.id) {
        await materializeRecurringTemplate(created.id).catch((err) => {
          console.warn('[Recurring] materialize-month call warning:', err?.message);
        });
      }
      return created;
    } catch (err) { throw err; }
  }

  localTemplates.unshift(newTemplate);
  return newTemplate;
}

export async function materializeRecurringTemplate(
  templateId: string,
  monthKey?: string,
): Promise<{ inserted: number; monthKey: string; count: number } | null> {
  if (!hasCloudflareApi()) return null;
  return await cfApi('/recurring/materialize-month', {
    method: 'POST',
    body: JSON.stringify({ templateId, monthKey }),
  });
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
  startDate?: string;
  endDate?: string;
  userName?: string;
  uid?: string;
}): Promise<RecurringChecklistItem[]> {
  if (hasCloudflareApi()) {
    const search = new URLSearchParams();
    if (params.category) search.set('category', params.category);
    if (params.date) search.set('date', params.date);
    if (params.startDate) search.set('startDate', params.startDate);
    if (params.endDate) search.set('endDate', params.endDate);
    if (params.userName) search.set('userName', params.userName);
    if (params.uid) search.set('uid', params.uid);
    search.set('limit', '100');
    const items: RecurringChecklistItem[] = [];
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    for (let pageNumber = 0; pageNumber < 1000; pageNumber++) {
      if (cursor) search.set('cursor', cursor);
      const page = await cfApi<
        RecurringChecklistItem[] |
        { items: RecurringChecklistItem[]; nextCursor: string | null; hasMore: boolean }
      >(`/recurring/checklist?${search.toString()}`);
      if (Array.isArray(page)) return [...items, ...page];
      if (!page || !Array.isArray(page.items)) throw new Error('Invalid checklist response from Cloudflare Worker');
      items.push(...page.items);
      if (!page.hasMore) return items;
      if (!page.nextCursor || seenCursors.has(page.nextCursor)) throw new Error('Checklist pagination did not advance');
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new Error('Checklist exceeded the safe pagination limit');
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
      if (params.date) return t.dayOfWeek == null || t.dayOfWeek === dowIso;
      if (params.category?.toLowerCase() === 'weekly') return true;
      return t.dayOfWeek == null || t.dayOfWeek === dowIso;
    }
    if (cat === 'monthly') {
      if (params.date) {
        const targetDay = t.dayOfMonth ? Math.min(t.dayOfMonth, lastDayOfMonth) : lastDayOfMonth;
        return targetDay === d;
      }
      return true;
    }
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
      const targetDay = t.dayOfMonth ? Math.min(t.dayOfMonth, lastDayOfMonth) : lastDayOfMonth;
      dueDate = `${monthKey}-${String(targetDay).padStart(2, '0')}`;
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

export async function getRecurringChecklistPage(params: {
  category: string;
  date?: string;
  exactDate?: boolean;
  cursor?: string;
  search?: string;
  uid: string;
  userName: string;
  scopeUser?: boolean;
  department?: string;
  isAdmin: boolean;
}): Promise<{ items: RecurringChecklistItem[]; nextCursor: string | null; hasMore: boolean }> {
  const query = new URLSearchParams({ category: params.category, limit: '100' });
  if (params.date) query.set('date', params.date);
  if (params.exactDate) query.set('exactDate', 'true');
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.search) query.set('search', params.search);
  if (!params.isAdmin || params.scopeUser) {
    query.set('scopeUid', params.uid);
    query.set('scopeName', params.userName);
    if (params.department) query.set('scopeDepartment', params.department);
  }
  const response = await cfApi<{ items: RecurringChecklistItem[]; nextCursor: string | null; hasMore: boolean } | RecurringChecklistItem[]>(`/recurring/checklist?${query.toString()}`);
  if (Array.isArray(response)) {
    // Older Workers return an array until the paged endpoint is deployed.
    const term = params.search?.toLowerCase();
    const items = term ? response.filter(row => [row.taskId, row.title, row.description, row.userName, row.department, row.periodKey, row.status, row.remark]
      .some(value => String(value || '').toLowerCase().includes(term))) : response;
    return { items, nextCursor: null, hasMore: false };
  }
  if (!response || !Array.isArray(response.items)) throw new Error('Invalid checklist response from Cloudflare Worker');
  return response;
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
