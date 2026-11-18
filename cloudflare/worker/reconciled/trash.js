let deletionsTableReady = false;

export async function ensureDeletionsTable(env) {
  if (deletionsTableReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS task_deletions (task_id TEXT PRIMARY KEY, previous_status TEXT NOT NULL, deleted_at TEXT NOT NULL)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_task_deletions_deleted_at ON task_deletions (deleted_at DESC, task_id)').run();
  deletionsTableReady = true;
}

function json(data, status = 200) {
  return new Response(JSON.stringify({ success: status < 400, data: status < 400 ? data : undefined, error: status >= 400 ? data : undefined }), {
    status, headers: { 'content-type': 'application/json' },
  });
}

export async function routeTrash(req, env, url, helpers) {
  const path = url.pathname;
  if (req.method === 'GET' && path === '/trash') {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const fetchLimit = limit + 1;
    const rawCursor = url.searchParams.get('cursor');
    let cursor = null;
    if (rawCursor) {
      try { cursor = JSON.parse(rawCursor); } catch { return json('Invalid deleted task cursor', 400); }
      if (typeof cursor?.deletedAt !== 'string' || typeof cursor?.kind !== 'string' || typeof cursor?.id !== 'string') return json('Invalid deleted task cursor', 400);
    }
    const kind = url.searchParams.get('kind') || 'all';
    if (!['all', 'one-time', 'recurring'].includes(kind)) return json('Invalid deleted task type', 400);
    const items = [];
    if (kind !== 'recurring') {
      try {
        const rows = await env.DB.prepare("SELECT t.task_id AS id,t.description,t.assigned_to_name AS assignedToName,t.category,d.deleted_at AS deletedAt,d.previous_status AS previousStatus FROM task_deletions d JOIN tasks_current t ON t.task_id=d.task_id WHERE t.status='Deleted' AND LOWER(COALESCE(t.category,'')) NOT IN ('daily','weekly','monthly') AND (?=0 OR (d.deleted_at,'one-time',d.task_id)<(?,?,?)) ORDER BY d.deleted_at DESC,d.task_id DESC LIMIT ?").bind(cursor ? 1 : 0, cursor?.deletedAt || '', cursor?.kind || '', cursor?.id || '', fetchLimit).all();
        for (const row of rows.results || []) items.push({ ...row, kind: 'one-time' });
      } catch (error) {
        if (!String(error?.message || error).includes('no such table')) throw error;
      }
    }
    if (kind !== 'one-time') {
      const templates = await env.DB.prepare("SELECT id,COALESCE(NULLIF(description,''),title) AS description,assigned_to_name AS assignedToName,category,json_extract(metadata_json,'$.deletedAt') AS deletedAt FROM recurring_templates WHERE json_extract(metadata_json,'$.deleted')=1 AND (?=0 OR (json_extract(metadata_json,'$.deletedAt'),'recurring-whole',id)<(?,?,?)) ORDER BY json_extract(metadata_json,'$.deletedAt') DESC,id DESC LIMIT ?").bind(cursor ? 1 : 0, cursor?.deletedAt || '', cursor?.kind || '', cursor?.id || '', fetchLimit).all();
      for (const row of templates.results || []) items.push({ ...row, kind: 'recurring-whole' });
      const periods = await env.DB.prepare("SELECT p.id,p.template_id AS templateId,COALESCE(NULLIF(p.description,''),p.title) AS description,p.assigned_to_name AS assignedToName,p.category,p.due_date AS dueDate,p.deleted_at AS deletedAt FROM recurring_period_rows p WHERE p.is_deleted=1 AND p.deleted_at IS NOT NULL AND (?=0 OR (p.deleted_at,'recurring-day',p.id)<(?,?,?)) AND NOT EXISTS (SELECT 1 FROM recurring_templates t WHERE t.id=p.template_id AND json_extract(t.metadata_json,'$.deleted')=1 AND json_extract(t.metadata_json,'$.deletedAt')=p.deleted_at) ORDER BY p.deleted_at DESC,p.id DESC LIMIT ?").bind(cursor ? 1 : 0, cursor?.deletedAt || '', cursor?.kind || '', cursor?.id || '', fetchLimit).all();
      for (const row of periods.results || []) items.push({ ...row, kind: 'recurring-day' });
    }
    items.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')) || b.kind.localeCompare(a.kind) || b.id.localeCompare(a.id));
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    return json({ items: page, hasMore: items.length > limit, nextCursor: items.length > limit && last ? JSON.stringify({ deletedAt: last.deletedAt, kind: last.kind, id: last.id }) : null });
  }

  if (req.method === 'DELETE' && /^\/tasks\/[^/]+$/.test(path)) {
    const id = decodeURIComponent(path.slice('/tasks/'.length));
    const task = await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(id).first();
    if (!task) return json('Task not found', 404);
    if (task.status === 'Deleted') return json('Task is already deleted', 409);
    if (['Completed', 'Verified'].includes(task.status)) return json('Completed or verified tasks cannot be deleted', 409);
    if (['daily', 'weekly', 'monthly'].includes(String(task.category || '').toLowerCase())) return json('Use recurring task deletion', 400);
    await ensureDeletionsTable(env);
    const now = new Date().toISOString();
    const result = await env.DB.batch([
      env.DB.prepare("INSERT INTO task_deletions(task_id,previous_status,deleted_at) VALUES (?,?,?) ON CONFLICT(task_id) DO UPDATE SET previous_status=excluded.previous_status,deleted_at=excluded.deleted_at").bind(id, task.status, now),
      env.DB.prepare("UPDATE tasks_current SET status='Deleted',updated_at=? WHERE task_id=? AND status=?").bind(now, id, task.status),
    ]);
    if (!Number(result[1]?.meta?.changes)) return json('Task changed; refresh and try again', 409);
    await helpers.adjustTaskCount(env, task, null);
    if (task.assigned_to) await helpers.refreshDelegationForTaskChange(env, task, null);
    return json({ taskId: id, deleted: true, permanent: false });
  }

  if (req.method === 'POST' && path === '/trash/restore') {
    const data = await req.json();
    const id = String(data.id || '');
    if (!id || id.length > 200) return json('Task ID is required', 400);
    if (data.kind === 'one-time') {
      const state = await env.DB.prepare('SELECT previous_status FROM task_deletions WHERE task_id=?').bind(id).first();
      if (!state) return json('Deleted task not found', 404);
      const now = new Date().toISOString();
      const result = await env.DB.prepare("UPDATE tasks_current SET status=?,updated_at=? WHERE task_id=? AND status='Deleted'").bind(state.previous_status, now, id).run();
      if (!Number(result.meta?.changes)) return json('Deleted task changed; refresh and try again', 409);
      const restored = await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(id).first();
      await env.DB.prepare('DELETE FROM task_deletions WHERE task_id=?').bind(id).run();
      await helpers.adjustTaskCount(env, null, restored);
      if (restored.assigned_to) await helpers.refreshDelegationForTaskChange(env, null, restored);
      return json({ id, kind: data.kind, restored: true });
    }
    if (data.kind === 'recurring-day') {
      const row = await env.DB.prepare('SELECT * FROM recurring_period_rows WHERE id=? AND is_deleted=1').bind(id).first();
      if (!row) return json('Deleted checklist day not found', 404);
      await env.DB.prepare("UPDATE recurring_period_rows SET is_deleted=0,deleted_at=NULL,status=CASE WHEN status='Deleted' THEN 'Pending' ELSE status END,updated_at=? WHERE id=? AND is_deleted=1").bind(new Date().toISOString(), id).run();
      await helpers.refreshChecklistMisSnapshot(env, row);
      return json({ id, kind: data.kind, restored: true });
    }
    if (data.kind === 'recurring-whole') {
      const template = await env.DB.prepare('SELECT * FROM recurring_templates WHERE id=?').bind(id).first();
      if (!template) return json('Deleted recurring task not found', 404);
      const metadata = JSON.parse(template.metadata_json || '{}');
      if (!metadata.deleted || !metadata.deletedAt) return json('Recurring task is not deleted', 409);
      const deletedAt = metadata.deletedAt;
      const affected = await env.DB.prepare('SELECT assigned_to,assigned_to_name,due_date,period_key FROM recurring_period_rows WHERE template_id=? AND is_deleted=1 AND deleted_at=? AND due_date<?').bind(id, deletedAt, new Date().toISOString().slice(0, 10)).all();
      delete metadata.deleted;
      delete metadata.deletedAt;
      const wasActive = metadata.deletedPreviousActive !== false;
      delete metadata.deletedPreviousActive;
      const now = new Date().toISOString();
      const sourceBefore = await env.DB.prepare('SELECT status FROM tasks_current WHERE task_id=?').bind(id).first();
      if (sourceBefore?.status === 'Deleted') await ensureDeletionsTable(env);
      const statements = [
        env.DB.prepare('UPDATE recurring_templates SET is_active=?,metadata_json=?,updated_at=? WHERE id=?').bind(wasActive ? 1 : 0, JSON.stringify(metadata), now, id),
        env.DB.prepare('UPDATE recurring_period_rows SET is_deleted=0,deleted_at=NULL,updated_at=? WHERE template_id=? AND is_deleted=1 AND deleted_at=?').bind(now, id, deletedAt),
      ];
      if (sourceBefore?.status === 'Deleted') statements.push(env.DB.prepare("UPDATE tasks_current SET status=(SELECT previous_status FROM task_deletions WHERE task_id=?),updated_at=? WHERE task_id=? AND status='Deleted' AND EXISTS(SELECT 1 FROM task_deletions WHERE task_id=?)").bind(id, now, id, id));
      const result = await env.DB.batch(statements);
      const sourceTask = await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id=?').bind(id).first();
      if (sourceTask && sourceTask.status !== 'Deleted') {
        await env.DB.prepare('DELETE FROM task_deletions WHERE task_id=?').bind(id).run();
        await helpers.adjustTaskCount(env, null, sourceTask);
      }
      helpers.invalidateTemplates();
      const seen = new Set();
      for (const row of affected.results || []) {
        const key = `${row.assigned_to || row.assigned_to_name}:${row.due_date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await helpers.refreshChecklistMisSnapshot(env, row);
      }
      return json({ id, kind: data.kind, restored: true, restoredPeriods: Number(result[1]?.meta?.changes || 0) });
    }
    return json('Invalid deleted task type', 400);
  }
  return null;
}
