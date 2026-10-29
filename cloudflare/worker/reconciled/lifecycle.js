// Mutations use D1 batches so related records commit together. No runtime DDL.
const response=(data,status=200)=>new Response(JSON.stringify({success:status<400,...(status<400?{data}:{error:data})}),{status,headers:{'content-type':'application/json'}});
const terminal=s=>['Completed','Verified','Dead'].includes(s)||String(s).startsWith('Shifted');
const recurring=c=>['daily','weekly','monthly'].includes(String(c).toLowerCase());
const istDay=value=>new Date(new Date(value).getTime()+19800000).toISOString().slice(0,10);
const shiftMeta=row=>{try{return JSON.parse(String(row.notes||'').match(/\[AHL_SHIFT (\{[^\n]*\})\]/)?.[1]||'{}')}catch{return {}}};
const legacyParent=row=>shiftMeta(row).parentTaskId||String(row.notes||'').match(/\[Shifted\s+by\s+.*?\s+from\s+(T-\d+)/i)?.[1];
const legacyChild=row=>shiftMeta(row).childTaskId||(!legacyParent(row)?String(row.notes||'').match(/to\s+(T-\d+)\]/i)?.[1]:undefined);
const note=(old,meta,text)=>[String(old||'').replace(/\n?\[AHL_SHIFT \{[^\n]*\}\]/g,''),text,'[AHL_SHIFT '+JSON.stringify(meta)+']'].filter(Boolean).join('\n');
const id=prefix=>prefix+crypto.randomUUID();
function assert(condition,message,status=400){if(!condition)throw Object.assign(new Error(message),{status})}
function validDate(value){return typeof value==='string'&&value.trim()&&!Number.isNaN(Date.parse(value))}
async function parentUpdate(env,task,status,extra={},condition='1',binds=[]){
  const parent=legacyParent(task);if(!parent)return [];
  const keys=Object.keys(extra),cols={end_date:'end_date',delayed_date:'delayed_date',delay_reason:'delay_reason',revision_status:'revision_status',completed_at:'completed_at',verified_at:'verified_at',accepted_at:'accepted_at'};
  return [env.DB.prepare(`UPDATE tasks_current SET status=?,updated_at=?${keys.map(k=>','+cols[k]+'=?').join('')} WHERE task_id=? AND ${condition}`).bind('Shifted ('+status+')',new Date().toISOString(),...keys.map(k=>extra[k]),parent,...binds)];
}
async function syncTaskCountChange(env,h,oldTask,newTask){
  if(!h.adjustTaskCount)return;
  await h.adjustTaskCount(env,oldTask,newTask);
  const parentId=oldTask&&legacyParent(oldTask);
  if(parentId&&newTask&&oldTask.status!==newTask.status){
    const parent=await env.DB.prepare('SELECT assigned_to,department,status FROM tasks_current WHERE task_id=?').bind(parentId).first();
    if(parent&&parent.status==='Shifted ('+newTask.status+')'){
      await h.adjustTaskCount(env,{...parent,status:'Shifted ('+oldTask.status+')'},parent);
    }
  }
}
export async function routeLifecycle(req,env,url,h){
 try {
  const path=url.pathname;
  if(path==='/tasks/shift'&&req.method==='POST'){
    const d=await req.json(),task=await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(d.taskId||'').first();
    assert(task,'Task not found',404);assert(!terminal(task.status)&&!legacyParent(task)&&!legacyChild(task),'This task cannot be shifted',409);
    assert(!recurring(task.category),'Only One Time tasks can be shifted');
    assert(d.actorRole==='admin'||d.actorUid===task.assigned_to,'Only assignee or admin can shift',403);
    assert(d.actorRole!=='intern','Interns cannot shift',403);
    const target=await env.DB.prepare('SELECT * FROM users WHERE uid=?').bind(d.targetUid||'').first();
    assert(target&&target.is_active!==0,'Target user missing or inactive');assert(target.uid!==task.assigned_to,'Select a different assignee');
    if(['member','user'].includes(d.actorRole))assert(Boolean(d.actorDepartment)&&String(d.actorDepartment).toLowerCase()===String(target.department).toLowerCase(),'Target must be in your department',403);
    const childId=await h.nextTaskId(env),now=new Date().toISOString(),status=task.start_date&&task.end_date?'In Progress':'Pending Accept';
    const meta={parentTaskId:task.task_id,shiftedByUid:d.actorUid,shiftedByName:d.actorName,shiftedNote:String(d.shiftNote||'').slice(0,1000),shiftedAt:now};
    const childNote=note(task.notes,meta,`[Shifted by ${d.actorName} from ${task.task_id} to ${childId}]: ${meta.shiftedNote}`);
    const parentNote=note(task.notes,{childTaskId:childId,shiftedToUid:target.uid,shiftedToName:target.name,shiftedNote:meta.shiftedNote,shiftedAt:now},`[Shifted by ${d.actorName} to ${childId}]: ${meta.shiftedNote}`);
    const fields=['task_id','description','assigned_to','assigned_to_name','assigned_to_wa','created_by','created_by_name','handoff_uid','handoff_name','handoff_wa','category','priority','status','department','start_date','end_date','delayed_date','delay_reason','revision_status','notes','accepted_at','completed_at','verified_at','created_at','updated_at','day_key','month_key'];
    const vals=[childId,task.description,target.uid,target.name,target.wa_number||'',d.actorUid,d.actorName,task.handoff_uid,task.handoff_name,task.handoff_wa,task.category,task.priority,status,target.department||task.department,task.start_date,task.end_date,task.delayed_date,task.delay_reason,'none',childNote,status==='In Progress'?now:null,null,null,now,now,task.day_key,task.month_key];
    // Optimistic condition is checked in the insert; the parent update requires that insert.
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO tasks_current (${fields.join(',')}) SELECT ${fields.map(()=>'?').join(',')} FROM tasks_current WHERE task_id=? AND status=? AND COALESCE(updated_at,'')=?`).bind(...vals,task.task_id,task.status,task.updated_at||''),
      env.DB.prepare('UPDATE tasks_current SET status=?,notes=?,updated_at=? WHERE task_id=? AND EXISTS(SELECT 1 FROM tasks_current WHERE task_id=?)').bind('Shifted ('+status+')',parentNote,now,task.task_id,childId)
    ]);
    const child=await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(childId).first();assert(child,'Task changed; refresh before shifting',409);
    const parent=await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(task.task_id).first();
    await h.adjustTaskCount?.(env,null,child);
    await h.adjustTaskCount?.(env,task,parent);
    return response({childTask:h.taskFromRow(child),parentTask:h.taskFromRow(parent)});
  }
  if(path==='/revisions'&&['POST','PATCH'].includes(req.method)){
    const d=await req.json(),now=new Date().toISOString();
    if(req.method==='POST'){
      assert(validDate(d.requestedDate),'Valid requested date required');assert(String(d.reason||'').trim().length>0&&String(d.reason).length<=1000,'Reason must contain 1–1000 characters');
      const task=await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(d.taskId||'').first();assert(task,'Task not found',404);
      assert(task.assigned_to===d.requestedBy,'Only assignee can request revision',403);assert(!terminal(task.status)&&!recurring(task.category),'Task cannot be revised',409);
      assert(!task.start_date||istDay(d.requestedDate)>=istDay(task.start_date),'Revised due date cannot precede start date');
      const revisionId=id('rev_'),condition='EXISTS(SELECT 1 FROM revisions WHERE id=?)';
      const pending=await env.DB.prepare("SELECT id FROM revisions WHERE task_id=? AND status='pending' LIMIT 1").bind(task.task_id).first();assert(!pending,'A revision is already pending',409);
      const statements=[
        env.DB.prepare("INSERT INTO revisions(id,task_id,requested_by,requested_by_name,requested_date,reason,status,created_at) SELECT ?,?,?,?,?,?,'pending',? FROM tasks_current WHERE task_id=? AND status=? AND COALESCE(updated_at,'')=? AND NOT EXISTS(SELECT 1 FROM revisions WHERE task_id=? AND status='pending')").bind(revisionId,task.task_id,d.requestedBy,d.requestedByName||'',d.requestedDate,String(d.reason).trim(),now,task.task_id,task.status,task.updated_at||'',task.task_id),
        env.DB.prepare("UPDATE tasks_current SET status='Delay Requested',revision_status='requested',updated_at=? WHERE task_id=? AND "+condition).bind(now,task.task_id,revisionId),
        ...await parentUpdate(env,task,'Delay Requested',{revision_status:'requested'},condition,[revisionId])
      ];await env.DB.batch(statements);
      const rev=await env.DB.prepare('SELECT * FROM revisions WHERE id=?').bind(revisionId).first();assert(rev,'Task changed; refresh before requesting revision',409);
      await syncTaskCountChange(env,h,task,await env.DB.prepare('SELECT assigned_to,department,status FROM tasks_current WHERE task_id=?').bind(task.task_id).first());
      return response(h.revisionFromRow(rev),201);
    }
    assert(['approved','rejected'].includes(d.decision),'Invalid decision');assert(d.revisionId&&d.taskId,'Task and revision ID required');
    const rev=await env.DB.prepare('SELECT * FROM revisions WHERE id=?').bind(d.revisionId).first();assert(rev,'Revision not found',404);assert(rev.task_id===d.taskId,'Revision does not belong to task',409);assert(rev.status==='pending','Revision already decided',409);assert(validDate(rev.requested_date),'Revision has invalid date');
    const task=await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(d.taskId).first();assert(task,'Task not found',404);assert(d.actorRole==='admin'||d.decidedBy===task.handoff_uid,'Only checker or admin can decide',403);assert(task.status==='Delay Requested'&&task.revision_status==='requested','Task is no longer awaiting a revision',409);
    const approved=d.decision==='approved',token=id('decision_');
    // Unique decision token prevents a competing decision from applying task changes twice.
    const decisionAt=now+'|'+token,condition='EXISTS(SELECT 1 FROM revisions WHERE id=? AND decided_at=?)',binds=[rev.id,decisionAt];
    const extra={revision_status:approved?'accepted':'rejected',...(approved?{end_date:rev.requested_date,delayed_date:rev.requested_date,delay_reason:rev.reason}:{})};
    const cols=Object.keys(extra);
    await env.DB.batch([
      env.DB.prepare("UPDATE revisions SET status=?,decided_by=?,decided_by_name=?,decided_at=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM tasks_current WHERE task_id=? AND status='Delay Requested' AND revision_status='requested')").bind(d.decision,d.decidedBy,d.decidedByName||'',decisionAt,rev.id,task.task_id),
      env.DB.prepare(`UPDATE tasks_current SET status='In Progress',updated_at=?,${cols.map(k=>k+'=?').join(',')} WHERE task_id=? AND ${condition}`).bind(now,...cols.map(k=>extra[k]),task.task_id,...binds),
      ...await parentUpdate(env,task,'In Progress',extra,condition,binds),
      env.DB.prepare('UPDATE revisions SET decided_at=? WHERE id=? AND decided_at=?').bind(now,rev.id,decisionAt)
    ]);
    const updated=await env.DB.prepare('SELECT * FROM revisions WHERE id=?').bind(rev.id).first();assert(updated.status===d.decision&&updated.decided_by===d.decidedBy&&updated.decided_at===now,'Revision changed; refresh',409);
    await syncTaskCountChange(env,h,task,await env.DB.prepare('SELECT assigned_to,department,status FROM tasks_current WHERE task_id=?').bind(task.task_id).first());
    return response(h.revisionFromRow(updated));
  }
  const lifecycle=path.match(/^\/tasks\/([^/]+)\/lifecycle$/);
  if(lifecycle&&req.method==='POST'){
    const d=await req.json(),task=await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(decodeURIComponent(lifecycle[1])).first();assert(task,'Task not found',404);assert(!recurring(task.category),'Use the checklist for recurring tasks');
    const action=d.action,admin=d.actorRole==='admin',own=task.assigned_to===d.actorUid,checker=task.handoff_uid===d.actorUid||shiftMeta(task).shiftedByUid===d.actorUid;
    assert(['complete','uncomplete','verify'].includes(action),'Unknown lifecycle action');assert(admin||(action==='verify'?checker:own),'Forbidden',403);
    assert(!legacyChild(task),'Update the shifted child task instead',409);
    const done=['Completed','Verified'].includes(task.status);
    if(action==='complete'&&done||action==='verify'&&task.status==='Verified')return response(h.taskFromRow(task));
    assert(action!=='verify'||task.status==='Completed','Complete task before verifying',409);assert(action!=='uncomplete'||done,'Only completed tasks can be undone',409);
    assert(action!=='complete'||['Pending Accept','In Progress','Overdue'].includes(task.status),'Task cannot be completed in this state',409);
    assert(action!=='complete'||admin||(task.start_date&&task.end_date),'Set dates before completion');
    const now=new Date().toISOString(),status=action==='uncomplete'?'In Progress':action==='verify'||admin?'Verified':'Completed';
    const completedAt=action==='uncomplete'?null:task.completed_at||now,verifiedAt=status==='Verified'?task.verified_at||now:null;
    const condition="EXISTS(SELECT 1 FROM tasks_current WHERE task_id=? AND COALESCE(updated_at,'')=? AND status=?)";
    const guard=[task.task_id,task.updated_at||'',task.status],statements=[];
    // Score deltas execute before the guarded task transition, in the same batch.
    if(action!=='verify'){
      const delta=action==='uncomplete'?-1:1,due=task.delayed_date||task.end_date,onTime=due&&istDay(action==='uncomplete'?task.completed_at||now:now)<=istDay(due),late=Boolean(due)&&!onTime;
      statements.push(env.DB.prepare(`INSERT OR IGNORE INTO scores(uid,name,department,wa_number,tasks_assigned,tasks_completed,on_time_count,late_count,monthly_score,last_updated) SELECT ?,?,?,?,0,0,0,0,0,? WHERE ${condition}`).bind(task.assigned_to,task.assigned_to_name,task.department,task.assigned_to_wa||'',now,...guard));
      statements.push(env.DB.prepare(`UPDATE scores SET tasks_completed=MAX(0,tasks_completed+?),on_time_count=MAX(0,on_time_count+?),late_count=MAX(0,late_count+?),last_updated=? WHERE uid=? AND ${condition}`).bind(delta,onTime?delta:0,late?delta:0,now,task.assigned_to,...guard));
      statements.push(env.DB.prepare(`UPDATE scores SET monthly_score=MIN(100,MAX(0,ROUND(on_time_count*100.0/MAX(tasks_assigned,1)))) WHERE uid=? AND ${condition}`).bind(task.assigned_to,...guard));
    }
    statements.push(...await parentUpdate(env,task,status,{completed_at:completedAt,verified_at:verifiedAt},condition,guard));
    statements.push(env.DB.prepare("UPDATE tasks_current SET status=?,completed_at=?,verified_at=?,accepted_at=COALESCE(accepted_at,?),updated_at=? WHERE task_id=? AND status=? AND COALESCE(updated_at,'')=?").bind(status,completedAt,verifiedAt,now,now,task.task_id,task.status,task.updated_at||''));
    await env.DB.batch(statements);const updated=await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(task.task_id).first();assert(updated.status===status&&updated.updated_at===now,'Task changed; refresh',409);
    await syncTaskCountChange(env,h,task,updated);
    return response(h.taskFromRow(updated));
  }
  const template=path.match(/^\/recurring\/templates\/([^/]+)$/);
  if(template&&['GET','DELETE'].includes(req.method)){
    const templateId=decodeURIComponent(template[1]),definition=await h.resolveRecurringDefinition(env,templateId);assert(definition,'Recurring task not found',404);
    if(req.method==='GET')return response(definition);
    const today=istDay(new Date());
    const sourceTask=await env.DB.prepare('SELECT assigned_to,department,status FROM tasks_current WHERE task_id=?').bind(templateId).first();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM recurring_completions WHERE template_id=? AND period_key IN (SELECT period_key FROM recurring_period_rows WHERE template_id=? AND COALESCE(NULLIF(period_end,''),NULLIF(due_date,''),substr(period_key,1,10))>=?)").bind(templateId,templateId,today),
      env.DB.prepare("DELETE FROM recurring_period_rows WHERE template_id=? AND COALESCE(NULLIF(period_end,''),NULLIF(due_date,''),substr(period_key,1,10))>=?").bind(templateId,today),
      env.DB.prepare('DELETE FROM recurring_templates WHERE id=?').bind(templateId),
      env.DB.prepare('DELETE FROM revisions WHERE task_id=?').bind(templateId),
      env.DB.prepare("DELETE FROM tasks_current WHERE task_id=? AND LOWER(category) IN ('daily','weekly','monthly')").bind(templateId)
    ]);
    if(sourceTask)await h.adjustTaskCount?.(env,sourceTask,null);
    return response({deletedId:templateId,permanent:true,keptPastPeriodRows:true});
  }
  if(path==='/recurring/templates'&&req.method==='POST'){
    const d=await req.json();assert(d.title&&d.assignedToName&&d.assignedTo,'Title and assignee required');assert(['Daily','Weekly','Monthly'].includes(d.category),'Invalid category');
    if(d.category==='Weekly')assert(Number.isInteger(Number(d.dayOfWeek))&&Number(d.dayOfWeek)>=1&&Number(d.dayOfWeek)<=7,'Invalid weekday');
    if(d.category==='Monthly')assert(Number.isInteger(Number(d.dayOfMonth))&&Number(d.dayOfMonth)>=1&&Number(d.dayOfMonth)<=31,'Invalid month day');
    const now=new Date().toISOString(),templateId=id('rec_'),t={...d,id:templateId,isActive:d.isActive!==false,metadata:{...(d.metadata||{}),startDate:d.startDate||d.metadata?.startDate||istDay(now)},createdAt:now,updatedAt:now};
    const specs=h.buildMonthPeriodRows(t,istDay(now).slice(0,7)).filter(row=>row.dueDate>=String(t.metadata.startDate).slice(0,10));
    const statements=[env.DB.prepare('INSERT INTO recurring_templates(id,category,title,description,assigned_to,assigned_to_name,department,frequency,day_of_week,day_of_month,time_of_day,is_active,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(templateId,t.category,t.title,t.description||'',t.assignedTo,t.assignedToName,t.department||'',t.category,t.dayOfWeek??null,t.dayOfMonth??null,t.timeOfDay||'10:00',t.isActive?1:0,JSON.stringify(t.metadata),now,now)];
    if(t.isActive)for(const row of specs)statements.push(env.DB.prepare("INSERT INTO recurring_period_rows(id,template_id,period_key,month_key,category,title,description,assigned_to,assigned_to_name,department,due_date,period_start,period_end,status,is_deleted,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending',0,?,?)").bind(h.periodRowId(templateId,row.periodKey),templateId,row.periodKey,row.monthKey,row.category,row.title,row.description,row.assignedTo,row.assignedToName,row.department,row.dueDate,row.periodStart,row.periodEnd,now,now));
    await env.DB.batch(statements);return response(t,201);
  }
  if(/^\/tasks\/[^/]+$/.test(path)&&req.method==='DELETE'){
    const task=await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(decodeURIComponent(path.slice(7))).first();
    if(task)assert(!legacyParent(task)&&!legacyChild(task),'Shifted tasks must be kept for tracking; mark Dead instead',409);
  }
  return null;
 }catch(error){return response(error.message||'Lifecycle operation failed',error.status||500)}
}
