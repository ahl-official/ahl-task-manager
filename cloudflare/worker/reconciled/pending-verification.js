// Read a bounded, indexed page; the client follows cursors until the entire queue is loaded.
export async function pendingVerification(env, url, mapTask) {
  const handoff = url.searchParams.get('handoffUid');
  let cursor = null;
  if (url.searchParams.has('cursor')) {
    try { cursor = JSON.parse(url.searchParams.get('cursor')); } catch { throw new Error('Invalid verification cursor'); }
    if (typeof cursor?.createdAt !== 'string' || typeof cursor?.taskId !== 'string'
      || cursor.createdAt.length > 100 || cursor.taskId.length > 200) throw new Error('Invalid verification cursor');
  }
  const index = handoff ? 'idx_tasks_verification_handoff_status' : 'idx_tasks_verification_status';
  const filters = ["status='Completed'", "LOWER(COALESCE(category,'')) NOT IN ('daily','weekly','monthly')",
    "COALESCE(created_by,'')!='timely-sheet'", "task_id NOT LIKE 'office-%'", "task_id NOT LIKE 'salon-%'", "task_id NOT LIKE 'weekly-%'"];
  const binds = [];
  if (handoff) { filters.push('handoff_uid=?'); binds.push(handoff); }
  if (cursor) { filters.push('(created_at,task_id)<(?,?)'); binds.push(cursor.createdAt, cursor.taskId); }
  // Splitting NULL and empty verification dates lets each branch seek the composite index.
  const branch = condition => `SELECT task_id,created_at FROM tasks_current INDEXED BY ${index}
    WHERE ${filters.join(' AND ')} AND ${condition} ORDER BY created_at DESC,task_id DESC LIMIT 101`;
  const result = await env.DB.prepare(`WITH a AS (${branch('verified_at IS NULL')}), b AS (${branch("verified_at=''" )}),
    page AS (SELECT * FROM (SELECT * FROM a UNION ALL SELECT * FROM b) ORDER BY created_at DESC,task_id DESC LIMIT 101)
    SELECT t.* FROM page p JOIN tasks_current t ON t.task_id=p.task_id ORDER BY p.created_at DESC,p.task_id DESC`)
    .bind(...binds, ...binds).all();
  const rows = result.results || [];
  const page = rows.slice(0, 100);
  const last = page[page.length - 1];
  return new Response(JSON.stringify({ success: true, data: {
    items: page.map(mapTask), hasMore: rows.length > 100,
    nextCursor: rows.length > 100 ? JSON.stringify({ createdAt: last.created_at, taskId: last.task_id }) : null,
  } }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
