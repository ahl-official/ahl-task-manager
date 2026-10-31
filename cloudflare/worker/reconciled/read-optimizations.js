// Read-only reporting routes. No schema creation, materialization, or database writes.
const cache = new Map();
const periodCache = new Map();
const TTL = 300_000;
export function invalidateReadCache() {
  periodCache.clear();
  for (const key of cache.keys()) {
    if (new URL(key).pathname === '/tasks/counts') cache.delete(key);
  }
}
export function getCachedRead(req, url) {
  if (req.method !== 'GET' || url.searchParams.get('fresh') === 'true') return null;
  const entry = cache.get(url.href);
  if (!entry || entry.until <= Date.now()) { cache.delete(url.href); return null; }
  return new Response(entry.body, { status: 200, headers: { 'content-type': 'application/json', 'x-data-as-of': entry.asOf } });
}
export async function cacheRead(req, url, response) {
  if (req.method !== 'GET' || response.status !== 200 || !['/tasks/counts','/tasks/search','/users','/departments','/mis/delegation-counts','/recurring/mis-counts','/mis/reconciled','/mis/weekly','/mis/weekly/latest'].includes(url.pathname)) return;
  const body = await response.clone().text();
  if (body.length > 1_000_000) return;
  if (cache.size >= 128) cache.delete(cache.keys().next().value);
  const cacheUrl = new URL(url.href);
  cacheUrl.searchParams.delete('fresh');
  cache.set(cacheUrl.href, { body, until: Date.now() + TTL, asOf: new Date().toISOString() });
}
const json = data => new Response(JSON.stringify({success:true,data,meta:{asOf:new Date().toISOString()}}),{headers:{'content-type':'application/json'}});
function scopeFilters(url) {
  const clauses=[],binds=[],scope=url.searchParams.get('scope')||'all',uid=url.searchParams.get('uid');
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
  else if(status==='Pending Accept')clauses.push("status IN ('Pending','Pending Accept','Shifted (Pending)','Shifted (Pending Accept)')");
  else if(status==='Overdue'){clauses.push("(status='Overdue' OR (status IN ('Pending Accept','In Progress','Delay Requested') AND date(end_date,'+5 hours','+30 minutes') < ?))");binds.push(today());}
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
    const summaryClauses=[],summaryBinds=[];
    const scope=url.searchParams.get('scope')||'all',uid=url.searchParams.get('uid');
    if(scope==='mine'&&uid){summaryClauses.push('assigned_to=?');summaryBinds.push(uid);}
    const dept=url.searchParams.get('department');
    if(dept){summaryClauses.push('department=?');summaryBinds.push(dept);}
    const assignedTo=url.searchParams.get('assignedTo');
    if(assignedTo){summaryClauses.push('assigned_to=?');summaryBinds.push(assignedTo);}
    const reqStatus=url.searchParams.get('status');
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


    const params=url.searchParams;
    if(params.get('includeChecklist')==='true'&&params.get('scope')==='mine'&&(!params.get('assignedTo')||params.get('assignedTo')===uid)&&(!params.get('category')||params.get('category')==='Daily')&&(!params.get('priority')||params.get('priority')==='Medium')){
      const department=params.get('department');
      const periods=await env.DB.prepare("SELECT department,status,COUNT(*) AS n FROM recurring_period_rows WHERE assigned_to=? AND category='Daily' AND is_deleted=0 AND status!='Deleted' AND due_date=?"+(department?' AND department=?':'')+" GROUP BY department,status LIMIT 50").bind(uid,today(),...(department?[department]:[])).all();
      for(const row of periods.results||[]){const status=['Completed','Verified'].includes(row.status)?'Completed':'In Progress',requested=params.get('status');if(requested&&requested!==status&&!(requested==='Completed'&&status==='Verified'))continue;const n=Number(row.n),uidVal=url.searchParams.get('uid'),deptVal=row.department||'Unassigned';add(overall,status,n,false);add(byUser[uidVal]??=empty(),status,n,false);add(byDepartment[deptVal]??=empty(),status,n,false);}
    }
    return json({...overall,byUser,byDepartment});
  }
  if(url.pathname==='/tasks/search'){
    const {clauses,binds}=scopeFilters(url),q=(url.searchParams.get('q')||'').trim();

    const limit=Math.min(Math.max(Number(url.searchParams.get('limit'))||2000,1),5000);
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
    const result=await env.DB.prepare(`SELECT * FROM tasks_current WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC,task_id DESC LIMIT ?`).bind(...binds,limit).all();
    return json((result.results||[]).map(mapTask));
  }
  if(url.pathname==='/mis/delegation-counts'){
    const start=url.searchParams.get('weekStart'),end=url.searchParams.get('weekEnd');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||start>end)throw new Error('Invalid MIS week');
    const final="date(COALESCE(NULLIF(t.delayed_date,''),NULLIF(t.end_date,''),NULLIF(t.start_date,''),NULLIF(t.completed_at,'')),'+5 hours','+30 minutes')";
    const first="date(t.start_date,'+5 hours','+30 minutes')";
    const revised="date(COALESCE(NULLIF(t.delayed_date,''),NULLIF(t.end_date,'')),'+5 hours','+30 minutes')";
    const done="t.status NOT IN ('Pending','Shifted')";
    const result=await env.DB.prepare(`SELECT t.assigned_to AS uid,COALESCE(NULLIF(u.name,''),t.assigned_to_name) AS name,COALESCE(NULLIF(u.department,''),t.department) AS department,u.wa_number AS waNumber,COUNT(*) AS planned,SUM(CASE WHEN ${done} THEN 1 ELSE 0 END) AS done,SUM(CASE WHEN ${done} AND NOT (t.status IN ('Completed','Verified') AND COALESCE(${first}<${revised},0)) THEN 1 ELSE 0 END) AS onTime FROM tasks_current t LEFT JOIN users u ON u.uid=t.assigned_to WHERE LOWER(COALESCE(t.category,'')) NOT IN ('daily','weekly','monthly') AND ${final}>=? AND ${final}<=? GROUP BY t.assigned_to,COALESCE(NULLIF(u.name,''),t.assigned_to_name),COALESCE(NULLIF(u.department,''),t.department),u.wa_number`).bind(start,end).all();
    return json(result.results||[]);
  }
  return null;
}
export async function aggregatePeriods(env,start,end){
  const key=start+':'+end,cached=periodCache.get(key);
  if(cached&&cached.until>Date.now())return cached.promise;
  const promise=loadPeriodAggregates(env,start,end).catch(error=>{periodCache.delete(key);throw error;});
  if(periodCache.size>=32)periodCache.delete(periodCache.keys().next().value);
  periodCache.set(key,{promise,until:Date.now()+TTL});
  return promise;
}
async function loadPeriodAggregates(env,start,end){
  const due="COALESCE(NULLIF(p.due_date,''),substr(p.period_key,1,10))";
  const result=await env.DB.prepare(`SELECT p.assigned_to_name AS name,p.department,p.category,s.source_kind,COUNT(*) AS planned,SUM(CASE WHEN p.status IN ('Completed','Verified') THEN 1 ELSE 0 END) AS done,SUM(CASE WHEN p.status IN ('Completed','Verified') AND COALESCE(p.is_on_time,1)=1 THEN 1 ELSE 0 END) AS onTime FROM recurring_period_rows p LEFT JOIN (SELECT period_row_id,MIN(source_kind) AS source_kind FROM recurring_period_sources GROUP BY period_row_id) s ON s.period_row_id=p.id WHERE p.is_deleted=0 AND p.status!='Deleted' AND ${due}>=? AND ${due}<=? GROUP BY p.assigned_to_name,p.department,p.category,s.source_kind`).bind(start,end).all();
  return result.results||[];
}
