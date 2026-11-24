import { pendingVerification } from './pending-verification.js';
// Read-only reporting routes. No schema creation, materialization, or database writes.
const cache = new Map();
const periodCache = new Map();
const TTL = 300_000;
export function invalidateReadCache() {
  periodCache.clear();
  for (const key of cache.keys()) {
    if (['/tasks/counts','/mis/weekly','/mis/weekly/latest','/mis/reconciled','/mis/delegation-counts','/recurring/mis-counts','/recurring/task-dates'].includes(new URL(key).pathname)) cache.delete(key);
  }
}

function patchSearchEntry(entryUrl, list, mutatedTasks, deletedTaskId) {
  let changed = false;
  let next = list;
  if (deletedTaskId) {
    const filtered = next.filter(item => item && item.taskId !== deletedTaskId);
    if (filtered.length !== next.length) {
      next = filtered;
      changed = true;
    }
  }
  const isVerificationPending = entryUrl.searchParams.get('verificationPending') === 'true';
  for (const task of mutatedTasks) {
    if (!task?.taskId) continue;
    const idx = next.findIndex(item => item && item.taskId === task.taskId);
    if (isVerificationPending && (task.status !== 'Completed' || task.verifiedAt)) {
      if (idx !== -1) {
        next = next.filter(item => item && item.taskId !== task.taskId);
        changed = true;
      }
      continue;
    }
    if (idx !== -1) {
      next = next.slice();
      next[idx] = { ...next[idx], ...task };
      changed = true;
    }
  }
  return changed ? next : null;
}

export async function syncCachedTasksFromMutation(req, url, response) {
  if (req.method === 'GET' || !response?.ok) return;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return;
  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return;
  }
  const data = payload?.data;
  if (!data) return;
  const deletedTaskId = data.deleted && data.taskId ? String(data.taskId) : null;
  const mutatedTasks = Array.isArray(data.tasks) ? data.tasks : (data.taskId && !deletedTaskId ? [data] : []);
  if (!deletedTaskId && mutatedTasks.length === 0) return;

  const nowIso = new Date().toISOString();
  for (const [key, entry] of cache.entries()) {
    const entryUrl = new URL(key);
    if (entryUrl.pathname !== '/tasks/search') continue;
    try {
      const parsed = JSON.parse(entry.body);
      if (!Array.isArray(parsed?.data)) continue;
      const updatedList = patchSearchEntry(entryUrl, parsed.data, mutatedTasks, deletedTaskId);
      if (updatedList) {
        parsed.data = updatedList;
        if (parsed.meta) parsed.meta.asOf = nowIso;
        entry.body = JSON.stringify(parsed);
        entry.asOf = nowIso;
      }
    } catch {
      // Ignore malformed cached JSON
    }
  }
}
export function getCachedRead(req, url) {
  if (req.method !== 'GET' || url.searchParams.get('fresh') === 'true') return null;
  const keyUrl = new URL(url.href);
  if (url.pathname === '/recurring/task-dates') keyUrl.searchParams.set('asOfDay', today());
  const entry = cache.get(keyUrl.href);
  if (!entry || entry.until <= Date.now()) { cache.delete(keyUrl.href); return null; }
  return new Response(entry.body, { status: 200, headers: { 'content-type': 'application/json', 'x-data-as-of': entry.asOf } });
}
export async function cacheRead(req, url, response) {
  if (req.method !== 'GET' || response.status !== 200 || !['/tasks/counts','/tasks/search','/users','/departments','/mis/delegation-counts','/recurring/mis-counts','/recurring/task-dates','/mis/reconciled','/mis/weekly','/mis/weekly/latest'].includes(url.pathname)) return;
  const body = await response.clone().text();
  if (body.length > 1_000_000) return;
  const cacheUrl = new URL(url.href);
  cacheUrl.searchParams.delete('fresh');
  if (url.pathname === '/recurring/task-dates') cacheUrl.searchParams.set('asOfDay', today());
  // A fresh GET replaces its own cache entry without evicting unrelated reads.
  if (!cache.has(cacheUrl.href) && cache.size >= 128) {
    if (url.searchParams.get('fresh') === 'true') return;
    cache.delete(cache.keys().next().value);
  }
  const ttl = url.pathname === '/recurring/task-dates' ? 60_000 : url.pathname === '/tasks/search' && url.searchParams.get('verificationPending') === 'true' ? 10_000 : TTL;
  cache.set(cacheUrl.href, { body, until: Date.now() + ttl, asOf: new Date().toISOString() });
}
const json = data => new Response(JSON.stringify({success:true,data,meta:{asOf:new Date().toISOString()}}),{headers:{'content-type':'application/json'}});
function scopeFilters(url) {
  const clauses=["status!='Deleted'"],binds=[],scope=url.searchParams.get('scope')||'all',uid=url.searchParams.get('uid');
  if (scope !== 'all') {
    if (!uid) throw new Error('A scoped request requires uid');
    if (scope==='visible') { clauses.push('(assigned_to=? OR created_by=? OR handoff_uid=?)');binds.push(uid,uid,uid); }
    else if (scope==='mine'||scope==='handoff') {clauses.push((scope==='mine'?'assigned_to':'handoff_uid')+'=?');binds.push(uid);}
    else throw new Error('Invalid task scope');
  }
  const department=url.searchParams.get('department');if(department){clauses.push('department=?');binds.push(department);}
  if(url.searchParams.get('excludeRecurring')==='true')clauses.push("(category NOT IN ('Daily','Weekly','Monthly') OR category IS NULL)");
  for(const [param,col] of [['assignedTo','assigned_to'],['category','category'],['priority','priority']]){const value=url.searchParams.get(param);if(value){clauses.push(col+'=?');binds.push(value);}}
  const weekStart=url.searchParams.get('weekStart'),weekEnd=url.searchParams.get('weekEnd');
  if(weekStart||weekEnd){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart||'')||!/^\d{4}-\d{2}-\d{2}$/.test(weekEnd||'')||weekStart>weekEnd)throw new Error('Invalid task date range');
    clauses.push("date(COALESCE(NULLIF(delayed_date,''),NULLIF(end_date,''),NULLIF(start_date,''),NULLIF(completed_at,'')),'+5 hours','+30 minutes') BETWEEN ? AND ?");
    binds.push(weekStart,weekEnd);
  }
  return {clauses,binds};
}
const empty=()=>({total:0,pending:0,inProgress:0,delayRequested:0,overdue:0,completed:0,verified:0,dead:0,active:0});
function add(bucket,status,n,overdue){
  const normalized=String(status||'').replace(/^Shifted \((.*)\)$/,'$1');
  bucket.total+=n;
  const field={'Pending':'pending','Pending Accept':'pending','In Progress':'inProgress','Delay Requested':'delayRequested','Completed':'completed','Verified':'verified','Dead':'dead'}[normalized];
  if(field)bucket[field]+=n;
  if(overdue)bucket.overdue+=n;
  if(['In Progress','Delay Requested','Overdue'].includes(normalized))bucket.active+=n;
}
const today=()=>new Date(Date.now()+19_800_000).toISOString().slice(0,10);
function statusFilter(clauses,binds,status){
  if(status==='Completed')clauses.push("status IN ('Completed','Verified','Shifted (Completed)','Shifted (Verified)')");
  else if(status==='Pending Accept'){
    clauses.push("(status IN ('Pending','Pending Accept','Shifted (Pending)','Shifted (Pending Accept)') AND (end_date IS NULL OR date(end_date,'+5 hours','+30 minutes') >= ?))");
    binds.push(today());
  }
  else if(status==='In Progress'){
    clauses.push("(status IN ('In Progress','Delay Requested','Shifted (In Progress)') AND (end_date IS NULL OR date(end_date,'+5 hours','+30 minutes') >= ?))");
    binds.push(today());
  }
  else if(status==='Overdue'){
    clauses.push("(status='Overdue' OR (status IN ('Pending','Pending Accept','In Progress','Delay Requested','Shifted (In Progress)') AND end_date IS NOT NULL AND date(end_date,'+5 hours','+30 minutes') < ?))");
    binds.push(today());
  }
  else if(status){clauses.push('(status=? OR status=?)');binds.push(status,'Shifted ('+status+')');}
}
let taskCountsTableReady = false;
export async function ensureTaskCountsTable(env) {
  if (taskCountsTableReady) return;
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS task_counts_summary (
        assigned_to TEXT NOT NULL DEFAULT '',
        department TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (assigned_to, department, status)
      )
    `).run();

    taskCountsTableReady = true;
  } catch (err) {
    console.error("ensureTaskCountsTable error:", err);
  }
}

export async function adjustTaskCount(env, oldTask, newTask) {
  try {
    const bucket = task => task && [task.assigned_to || '', task.department || '', task.status || ''].join('\u0000');
    if (bucket(oldTask) === bucket(newTask)) return;
    await ensureTaskCountsTable(env);
    const stmts = [];
    if (oldTask && oldTask.status) {
      const oldStatus = oldTask.status;
      const oldDept = oldTask.department || '';
      const oldUser = oldTask.assigned_to || '';
      stmts.push(
        env.DB.prepare(
          "UPDATE task_counts_summary SET count = MAX(0, count - 1) WHERE assigned_to = ? AND department = ? AND status = ?"
        ).bind(oldUser, oldDept, oldStatus)
      );
    }
    if (newTask && newTask.status) {
      const newStatus = newTask.status;
      const newDept = newTask.department || '';
      const newUser = newTask.assigned_to || '';
      stmts.push(
        env.DB.prepare(
          `INSERT INTO task_counts_summary (assigned_to, department, status, count)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(assigned_to, department, status) DO UPDATE SET count = count + 1`
        ).bind(newUser, newDept, newStatus)
      );
    }
    if (stmts.length > 0) {
      await env.DB.batch(stmts);
    }
  } catch (err) {
    console.error('adjustTaskCount error:', err);
  }
}

export async function routeReadOptimizations(req,env,url,mapTask=row=>row){
  if (req.method === 'GET' && url.pathname === '/tasks/verification-pending') return pendingVerification(env, url, mapTask);
  if (url.pathname === '/recurring/task-dates' && req.method === 'GET') {
    const ids = [...new Set((url.searchParams.get('ids') || '').split(',').filter(Boolean))];
    if (!ids.length || ids.length > 100 || ids.some(id => !/^T-[a-z0-9-]+$/i.test(id))) throw new Error('Invalid recurring task IDs');
    const output = [];
    // Prefer today's occurrence, then the latest past one; use the next future occurrence only when no earlier row exists.
    for (let offset = 0; offset < ids.length; offset += 90) {
      const batch = ids.slice(offset, offset + 90);
      const lookup = (operator, direction) => `(SELECT p.id FROM recurring_period_rows p
        WHERE p.template_id=w.template_id AND p.is_deleted=0 AND p.status!='Deleted'
        AND p.due_date${operator}ctx.day ORDER BY p.due_date ${direction},p.id ${direction} LIMIT 1)`;
      const result = await env.DB.prepare(`WITH wanted(template_id) AS (VALUES ${batch.map(() => '(?)').join(',')}), ctx(day) AS (VALUES (?)),
        picked AS MATERIALIZED (SELECT w.template_id,COALESCE(${lookup('<=','DESC')},${lookup('>','ASC')}) AS row_id FROM wanted w CROSS JOIN ctx)
        SELECT picked.template_id,p.due_date,p.status FROM picked LEFT JOIN recurring_period_rows p ON p.id=picked.row_id`)
        .bind(...batch, today()).all();
      for (const row of result.results || []) output.push({
        taskId: row.template_id, recurringDueDate: row.due_date || null,
        recurringOpenDate: row.due_date || null, recurringStatus: row.status || null,
      });
    }
    return json(output);
  }
  if(req.method!=='GET')return null;
  if(url.pathname==='/sheet-sync/candidates'){
    const kind=url.searchParams.get('kind'),cursor=url.searchParams.get('after')||'';
    const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get('limit'))||1000));
    const open="('Pending','Pending Accept','In Progress','Delay Requested','Overdue')";
    let sql;
    if(kind==='delegation'){
      sql=`SELECT task_id,assigned_to,assigned_to_name,description,status,start_date,end_date,delayed_date,updated_at
        FROM tasks_current WHERE task_id>? AND status IN ${open}
        AND LOWER(COALESCE(category,'')) NOT IN ('daily','weekly','monthly') ORDER BY task_id LIMIT ?`;
    }else if(kind==='recurring-legacy'){
      sql=`SELECT task_id,assigned_to,assigned_to_name,description,status,category
        FROM tasks_current WHERE task_id>? AND LOWER(COALESCE(category,'')) IN ('daily','weekly','monthly') ORDER BY task_id LIMIT ?`;
    }else if(kind==='recurring-period'){
      sql=`SELECT id,template_id,period_key,due_date,assigned_to,assigned_to_name,department,description,title,category,status
        FROM recurring_period_rows WHERE id>? AND status IN ('Pending','Pending Accept','In Progress','Delay Requested','Overdue') AND is_deleted=0 ORDER BY id LIMIT ?`;
    }else throw new Error('Invalid sheet sync candidate kind');
    const rows=await env.DB.prepare(sql).bind(cursor,limit).all();
    return json(rows.results||[]);
  }
  if(url.pathname==='/sheet-sync/recurring-history'){
    const rows=await env.DB.prepare(
      "SELECT assigned_to_name,category,COALESCE(NULLIF(description,''),title) AS description FROM recurring_period_rows GROUP BY assigned_to_name,category,COALESCE(NULLIF(description,''),title) LIMIT 5001"
    ).all();
    return json(rows.results||[]);
  }
  if(url.pathname==='/tasks/reminders'){
    const mode=url.searchParams.get('mode'),day=url.searchParams.get('day'),uid=url.searchParams.get('uid');
    const cursor=url.searchParams.get('after')||'';
    if(!['due','recent','high','priority','open'].includes(mode)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day||'')||(mode==='open'&&!uid))throw new Error('Invalid reminder filter');
    const shift=(n)=>{const d=new Date(`${day}T00:00:00.000Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
    const clauses=["status IN ('Pending Accept','In Progress','Delay Requested','Overdue')"],binds=[];
    if(mode!=='high')clauses.push("LOWER(COALESCE(NULLIF(category,''),'One Time')) IN ('one time','one-time')");
    if(uid){clauses.push('assigned_to=?');binds.push(uid);}
    if(mode==='due'||mode==='recent'){
      clauses.push('end_date>=? AND end_date<?');
      binds.push(mode==='due'?day:shift(-2),mode==='due'?shift(1):day);
    }
    if(mode==='high')clauses.push("(LOWER(priority) IN ('high','urgent') OR priority LIKE '%🔴%' OR LOWER(priority) LIKE '%red%')");
    const where=clauses.join(' AND ');
    const sql=mode==='priority'
      ? `WITH ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY assigned_to ORDER BY CASE WHEN status='Overdue' THEN 0 ELSE 1 END,CASE WHEN LOWER(priority)='high' THEN 0 WHEN LOWER(priority)='medium' THEN 1 ELSE 2 END,CASE WHEN end_date IS NULL THEN 1 ELSE 0 END,end_date,created_at) AS rank_in_user FROM tasks_current WHERE ${where}) SELECT * FROM ranked WHERE rank_in_user<=5 AND task_id>? ORDER BY task_id LIMIT 100`
      : `SELECT * FROM tasks_current WHERE ${where} AND task_id>? ORDER BY task_id LIMIT 100`;
    const rows=await env.DB.prepare(sql).bind(...binds,cursor).all();
    return json((rows.results||[]).map(mapTask));
  }
  if(url.pathname==='/tasks/counts'){
    const scope=url.searchParams.get('scope')||'all',uid=url.searchParams.get('uid');
    const dept=url.searchParams.get('department');
    const assignedTo=url.searchParams.get('assignedTo');
    const reqStatus=url.searchParams.get('status');
    const category=url.searchParams.get('category');

    if (category && ['Daily', 'Weekly', 'Monthly'].includes(category)) {
      const recClauses = ["is_active = 1", "LOWER(category) = LOWER(?)"], recBinds = [category];
      if (assignedTo) {
        recClauses.push("(assigned_to = ? OR LOWER(assigned_to_name) = (SELECT LOWER(name) FROM users WHERE uid = ? LIMIT 1) OR LOWER(assigned_to_name) = LOWER(?))");
        recBinds.push(assignedTo, assignedTo, assignedTo);
      }
      if (dept) {
        recClauses.push("department = ?");
        recBinds.push(dept);
      }
      const countRes = await env.DB.prepare(`SELECT COUNT(*) as total FROM recurring_templates WHERE ${recClauses.join(' AND ')}`).bind(...recBinds).first();
      const total = Number(countRes?.total || 0);

      const todayVal = today();
      const periodClauses = ["category = ?", "is_deleted = 0", "status != 'Deleted'", "due_date = ?"];
      const periodBinds = [category, todayVal];
      if (assignedTo) {
        periodClauses.push("(assigned_to = ? OR LOWER(assigned_to_name) = (SELECT LOWER(name) FROM users WHERE uid = ? LIMIT 1) OR LOWER(assigned_to_name) = LOWER(?))");
        periodBinds.push(assignedTo, assignedTo, assignedTo);
      }
      if (dept) {
        periodClauses.push("department = ?");
        periodBinds.push(dept);
      }
      const periodRes = await env.DB.prepare(`SELECT status, COUNT(*) as n FROM recurring_period_rows WHERE ${periodClauses.join(' AND ')} GROUP BY status`).bind(...periodBinds).all();
      let completed = 0;
      for (const row of periodRes.results || []) {
        if (['Completed', 'Verified'].includes(row.status)) completed += Number(row.n || 0);
      }
      const pending = Math.max(0, total - completed);
      return json({
        total,
        pending,
        inProgress: pending,
        delayRequested: 0,
        overdue: 0,
        completed,
        verified: 0,
        dead: 0,
        active: pending,
        byUser: Object.create(null),
        byDepartment: Object.create(null)
      });
    }

    if (assignedTo || (scope !== 'all' && uid)) {
      const scoped = scopeFilters(url);
      if (reqStatus) statusFilter(scoped.clauses, scoped.binds, reqStatus);
      const todayVal = today();
      const userRes = await env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN (status IN ('Pending','Pending Accept','Shifted (Pending)','Shifted (Pending Accept)')) AND (end_date IS NULL OR date(end_date,'+5 hours','+30 minutes') >= ?) THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN (status IN ('In Progress','Delay Requested','Shifted (In Progress)')) AND (end_date IS NULL OR date(end_date,'+5 hours','+30 minutes') >= ?) THEN 1 ELSE 0 END) AS inProgress,
          SUM(CASE WHEN status = 'Delay Requested' THEN 1 ELSE 0 END) AS delayRequested,
          SUM(CASE WHEN (status='Overdue' OR (status IN ('Pending','Pending Accept','In Progress','Delay Requested','Shifted (In Progress)') AND end_date IS NOT NULL AND date(end_date,'+5 hours','+30 minutes') < ?)) THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN status IN ('Completed','Shifted (Completed)') THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status IN ('Verified','Shifted (Verified)') THEN 1 ELSE 0 END) AS verified,
          SUM(CASE WHEN status IN ('Dead','Shifted (Dead)') THEN 1 ELSE 0 END) AS dead
        FROM tasks_current
        WHERE ${scoped.clauses.join(' AND ')}
      `).bind(todayVal, todayVal, todayVal, ...scoped.binds).first();

      const overall = {
        total: Number(userRes?.total || 0),
        pending: Number(userRes?.pending || 0),
        inProgress: Number(userRes?.inProgress || 0),
        delayRequested: Number(userRes?.delayRequested || 0),
        overdue: Number(userRes?.overdue || 0),
        completed: Number(userRes?.completed || 0),
        verified: Number(userRes?.verified || 0),
        dead: Number(userRes?.dead || 0),
        active: Number(userRes?.inProgress || 0) + Number(userRes?.overdue || 0),
      };

      const params = url.searchParams;
      if (params.get('includeChecklist') === 'true' && scope === 'mine' && uid && (!reqStatus || ['Completed','In Progress'].includes(reqStatus)) && (!params.get('category') || params.get('category') === 'Daily') && (!params.get('priority') || params.get('priority') === 'Medium')) {
        const department = params.get('department');
        const periods = await env.DB.prepare("SELECT department,status,COUNT(*) AS n FROM recurring_period_rows WHERE assigned_to=? AND category='Daily' AND is_deleted=0 AND status!='Deleted' AND due_date=?" + (department ? ' AND department=?' : '') + " GROUP BY department,status LIMIT 50").bind(uid, todayVal, ...(department ? [department] : [])).all();
        for (const row of periods.results || []) {
          const status = ['Completed', 'Verified'].includes(row.status) ? 'Completed' : 'In Progress';
          if (reqStatus && status !== reqStatus) continue;
          const n = Number(row.n || 0);
          if (status === 'Completed') overall.completed += n;
          else { overall.inProgress += n; overall.active += n; }
          overall.total += n;
        }
      }

      return json({ ...overall, byUser: Object.create(null), byDepartment: Object.create(null) });
    }

    const summaryClauses=[],summaryBinds=[];
    if(dept){summaryClauses.push('department=?');summaryBinds.push(dept);}
    if(reqStatus){summaryClauses.push('status=?');summaryBinds.push(reqStatus);}

    const isGlobal = summaryClauses.length === 0;
    const overall = empty(), byUser = Object.create(null), byDepartment = Object.create(null);
    if (isGlobal) {
      const result = await env.DB.prepare("SELECT assigned_to,department,status,count AS n FROM task_counts_summary").all();
      for (const row of result.results || []) {
        const n = Number(row.n || 0), user = row.assigned_to || '', d = row.department || 'Unassigned';
        add(overall, row.status, n, row.status === 'Overdue');
        add(byUser[user] ??= empty(), row.status, n, row.status === 'Overdue');
        add(byDepartment[d] ??= empty(), row.status, n, row.status === 'Overdue');
      }
    } else {
      const whereSql = 'WHERE ' + summaryClauses.join(' AND ');
      const result = await env.DB.prepare(`SELECT assigned_to,department,status,count AS n FROM task_counts_summary ${whereSql}`).bind(...summaryBinds).all();
      for (const row of result.results || []) {
        const n = Number(row.n || 0), user = row.assigned_to || '', d = row.department || 'Unassigned';
        add(overall, row.status, n, row.status === 'Overdue');
        add(byUser[user] ??= empty(), row.status, n, row.status === 'Overdue');
        add(byDepartment[d] ??= empty(), row.status, n, row.status === 'Overdue');
      }
    }

    return json({...overall,byUser,byDepartment});
  }
  if(url.pathname==='/tasks/search'){
    const category = url.searchParams.get('category');
    const isRecurringCategory = category && ['Daily', 'Weekly', 'Monthly'].includes(category);
    const assignedTo = url.searchParams.get('assignedTo');
    const dept = url.searchParams.get('department');
    const q = (url.searchParams.get('q') || '').trim();
    const limit = isRecurringCategory ? Math.min(Math.max(Number(url.searchParams.get('limit')) || 2000, 1000), 5000) : Math.min(Math.max(Number(url.searchParams.get('limit')) || 2000, 1), 5000);

    if (isRecurringCategory) {
      const clauses = ["is_active = 1", "LOWER(category) = LOWER(?)"];
      const binds = [category];
      if (assignedTo) {
        clauses.push("(assigned_to = ? OR LOWER(assigned_to_name) = (SELECT LOWER(name) FROM users WHERE uid = ? LIMIT 1) OR LOWER(assigned_to_name) = LOWER(?))");
        binds.push(assignedTo, assignedTo, assignedTo);
      }
      if (dept) {
        clauses.push("department = ?");
        binds.push(dept);
      }
      if (q) {
        const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
        clauses.push("(id LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR assigned_to_name LIKE ? ESCAPE '\\')");
        binds.push(pattern, pattern, pattern, pattern);
      }
      const sql = `SELECT * FROM recurring_templates WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`;
      const result = await env.DB.prepare(sql).bind(...binds, limit).all();
      const tasks = (result.results || []).map(row => ({
        task_id: row.id,
        description: row.description || row.title,
        assigned_to: row.assigned_to || '',
        assigned_to_name: row.assigned_to_name || '',
        assigned_to_wa: '',
        created_by: 'system',
        created_by_name: 'Recurring System',
        handoff_uid: '',
        handoff_name: '',
        handoff_wa: '',
        category: row.category,
        priority: 'Medium',
        status: 'In Progress',
        department: row.department || '',
        start_date: null,
        end_date: null,
        delayed_date: null,
        delay_reason: null,
        revision_status: 'none',
        notes: null,
        accepted_at: null,
        completed_at: null,
        verified_at: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        day_key: null,
        week_key: null,
        week_start: null,
        week_end: null,
        month_key: null,
      }));
      return json(tasks.map(mapTask));
    }

    const {clauses,binds}=scopeFilters(url);
    const status=url.searchParams.get('status');
    if(url.searchParams.get('verificationPending')==='true')clauses.push("status='Completed' AND (verified_at IS NULL OR verified_at='')");
    else statusFilter(clauses,binds,status);
    const id=q.match(/^T-?(\d+)$/i);
    if(id){clauses.push('task_id=?');binds.push('T-'+id[1].padStart(4,'0'));}
    else if(q){
      if(q.length<3)return json([]);
      const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
      clauses.push("(task_id LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");binds.push(pattern,pattern);
    }else if(!status&&url.searchParams.get('verificationPending')!=='true'&&!url.searchParams.get('assignedTo')&&!url.searchParams.get('category')&&!url.searchParams.get('priority')&&!url.searchParams.get('department')&&(url.searchParams.get('scope')||'all')==='all')return json([]);
    const where=clauses.join(' AND ');
    const query=index=>{
      if(index){
        // Separate NULL and empty verification timestamps so both index columns can be searched.
        const base=where.replace("status='Completed' AND (verified_at IS NULL OR verified_at='')", "status='Completed'");
        const branch=condition=>`SELECT task_id,created_at FROM tasks_current INDEXED BY ${index} WHERE ${base} AND ${condition} ORDER BY created_at DESC,task_id DESC LIMIT ?`;
        return env.DB.prepare(`WITH a AS (${branch('verified_at IS NULL')}), b AS (${branch("verified_at=''")}),
          page AS (SELECT * FROM (SELECT * FROM a UNION ALL SELECT * FROM b) ORDER BY created_at DESC,task_id DESC LIMIT ?)
          SELECT t.* FROM page p JOIN tasks_current t ON t.task_id=p.task_id ORDER BY p.created_at DESC,p.task_id DESC`)
          .bind(...binds,limit,...binds,limit,limit).all();
      }
      return env.DB.prepare(`SELECT * FROM tasks_current WHERE ${where} ORDER BY created_at DESC,task_id DESC LIMIT ?`).bind(...binds,limit).all();
    };
    // Full status/verification indexes avoid D1 partial-index planner mismatches.
    const verification=url.searchParams.get('verificationPending')==='true' && url.searchParams.get('excludeRecurring')==='true';
    const scope=url.searchParams.get('scope')||'all';
    const index=verification && !q ? (scope==='all' ? 'idx_tasks_verification_status' : scope==='handoff' ? 'idx_tasks_verification_handoff_status' : '') : '';
    let result;
    try { result=await query(index); }
    catch(error) {
      if(!index || !/no such index|no query solution/i.test(String(error?.message||error)))throw error;
      result=await query('');
    }
    let items = (result.results||[]).map(mapTask);
    if (assignedTo && (!category || category === 'all') && url.searchParams.get('excludeRecurring') !== 'true') {
      const recClauses = ["is_active = 1", "(assigned_to = ? OR LOWER(assigned_to_name) = (SELECT LOWER(name) FROM users WHERE uid = ? LIMIT 1) OR LOWER(assigned_to_name) = LOWER(?))"];
      const recBinds = [assignedTo, assignedTo, assignedTo];
      if (dept) { recClauses.push("department = ?"); recBinds.push(dept); }
      if (q) {
        const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
        recClauses.push("(id LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR assigned_to_name LIKE ? ESCAPE '\\')");
        recBinds.push(pattern, pattern, pattern, pattern);
      }
      const recRes = await env.DB.prepare(`SELECT * FROM recurring_templates WHERE ${recClauses.join(' AND ')} ORDER BY category ASC, id DESC LIMIT 50`).bind(...recBinds).all();
      const recMapped = (recRes.results || []).map(row => mapTask({
        task_id: row.id,
        description: row.description || row.title,
        assigned_to: row.assigned_to || '',
        assigned_to_name: row.assigned_to_name || '',
        assigned_to_wa: '',
        created_by: 'system',
        created_by_name: 'Recurring System',
        handoff_uid: '',
        handoff_name: '',
        handoff_wa: '',
        category: row.category,
        priority: 'Medium',
        status: 'In Progress',
        department: row.department || '',
        start_date: null,
        end_date: null,
        delayed_date: null,
        delay_reason: null,
        revision_status: 'none',
        notes: null,
        accepted_at: null,
        completed_at: null,
        verified_at: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        day_key: null,
        week_key: null,
        week_start: null,
        week_end: null,
        month_key: null,
      }));
      items = [...recMapped, ...items].slice(0, Math.max(limit, items.length + recMapped.length));
    } else if (q && q.length >= 2 && url.searchParams.get('excludeRecurring') !== 'true') {
      const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
      const recClauses = ["is_active = 1", "(id LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR assigned_to_name LIKE ? ESCAPE '\\')"];
      const recBinds = [pattern, pattern, pattern, pattern];
      if (category && ['Daily', 'Weekly', 'Monthly'].includes(category)) {
        recClauses.push("LOWER(category) = LOWER(?)");
        recBinds.push(category);
      }
      if (dept) {
        recClauses.push("department = ?");
        recBinds.push(dept);
      }
      const recRes = await env.DB.prepare(`SELECT * FROM recurring_templates WHERE ${recClauses.join(' AND ')} ORDER BY category ASC, id DESC LIMIT 50`).bind(...recBinds).all();
      const existingIds = new Set(items.map(t => t.taskId || t.task_id));
      const recMapped = (recRes.results || []).filter(r => !existingIds.has(r.id)).map(row => mapTask({
        task_id: row.id,
        description: row.description || row.title,
        assigned_to: row.assigned_to || '',
        assigned_to_name: row.assigned_to_name || '',
        assigned_to_wa: '',
        created_by: 'system',
        created_by_name: 'Recurring System',
        handoff_uid: '',
        handoff_name: '',
        handoff_wa: '',
        category: row.category,
        priority: 'Medium',
        status: 'In Progress',
        department: row.department || '',
        start_date: null,
        end_date: null,
        delayed_date: null,
        delay_reason: null,
        revision_status: 'none',
        notes: null,
        accepted_at: null,
        completed_at: null,
        verified_at: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        day_key: null,
        week_key: null,
        week_start: null,
        week_end: null,
        month_key: null,
      }));
      items = [...recMapped, ...items];
    }
    return json(items);
  }
  if(url.pathname==='/mis/delegation-counts'){
    const start=url.searchParams.get('weekStart'),end=url.searchParams.get('weekEnd');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||start>end)throw new Error('Invalid MIS week');
    const final="date(COALESCE(NULLIF(t.delayed_date,''),NULLIF(t.end_date,''),NULLIF(t.start_date,''),NULLIF(t.completed_at,'')),'+5 hours','+30 minutes')";
    const first="date(t.start_date,'+5 hours','+30 minutes')";
    const revised="date(COALESCE(NULLIF(t.delayed_date,''),NULLIF(t.end_date,'')),'+5 hours','+30 minutes')";
    const done="t.status NOT IN ('Pending','Shifted')";
    const result=await env.DB.prepare(`SELECT t.assigned_to AS uid,COALESCE(NULLIF(u.name,''),t.assigned_to_name) AS name,COALESCE(NULLIF(u.department,''),t.department) AS department,u.wa_number AS waNumber,COUNT(*) AS planned,SUM(CASE WHEN t.status IN ('In Progress','Shifted (In Progress)') THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN t.status IN ('Pending','Pending Accept','Shifted (Pending Accept)') THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN t.status IN ('Completed','Verified','Shifted (Completed)','Shifted (Verified)') THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN t.status='Overdue' OR (t.status IN ('Pending','Pending Accept','In Progress','Delay Requested','Shifted (In Progress)') AND date(t.end_date,'+5 hours','+30 minutes')<date('now','+5 hours','+30 minutes')) THEN 1 ELSE 0 END) AS overdue,SUM(CASE WHEN ${done} THEN 1 ELSE 0 END) AS done,SUM(CASE WHEN ${done} AND NOT (t.status IN ('Completed','Verified') AND COALESCE(${first}<${revised},0)) THEN 1 ELSE 0 END) AS onTime FROM tasks_current t LEFT JOIN users u ON u.uid=t.assigned_to WHERE t.status!='Deleted' AND LOWER(COALESCE(t.category,'')) NOT IN ('daily','weekly','monthly') AND ${final}>=? AND ${final}<=? GROUP BY t.assigned_to,COALESCE(NULLIF(u.name,''),t.assigned_to_name),COALESCE(NULLIF(u.department,''),t.department),u.wa_number`).bind(start,end).all();
    return json(result.results||[]);
  }
  return null;
}
export async function aggregatePeriods(env,start,end,fresh=false){
  const key=start+':'+end,cached=periodCache.get(key);
  if(!fresh&&cached&&cached.until>Date.now())return cached.promise;
  const promise=loadPeriodAggregates(env,start,end).catch(error=>{
    if(periodCache.get(key)?.promise===promise)periodCache.delete(key);
    throw error;
  });
  if(!periodCache.has(key)&&periodCache.size>=32){
    if(fresh)return promise;
    periodCache.delete(periodCache.keys().next().value);
  }
  periodCache.set(key,{promise,until:Date.now()+TTL});
  return promise;
}
async function loadPeriodAggregates(env,start,end){
  // Resolve provenance only for periods in the requested week. The old LEFT
  // JOIN grouped every source row in the database on every MIS request.
  const result=await env.DB.prepare(`WITH periods AS MATERIALIZED (
    SELECT p.assigned_to_name AS name,p.department,p.category,p.status,p.is_on_time,
      (SELECT MIN(s.source_kind) FROM recurring_period_sources s WHERE s.period_row_id=p.id) AS source_kind
    FROM recurring_period_rows p
    WHERE p.is_deleted=0 AND p.status!='Deleted' AND p.due_date>=? AND p.due_date<=?
  )
  SELECT name,department,category,source_kind,COUNT(*) AS planned,
    SUM(CASE WHEN status IN ('Completed','Verified') THEN 1 ELSE 0 END) AS done,
    SUM(CASE WHEN status IN ('Completed','Verified') AND COALESCE(is_on_time,1)=1 THEN 1 ELSE 0 END) AS onTime
  FROM periods GROUP BY name,department,category,source_kind`).bind(start,end).all();
  return result.results||[];
}
