type D1Result<T = unknown> = { results: T[] };
type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
};
type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
};
type R2Bucket = unknown;

type Env = {
  DB: D1Database;
  ARCHIVE: R2Bucket;
  API_SHARED_SECRET: string;
  WAHA_URL?: string;
  WAHA_SESSION?: string;
  WAHA_API_KEY?: string;
  APP_ORIGIN?: string;
};

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const ACTIVE_STATUSES = ['Pending Accept', 'In Progress', 'Delay Requested', 'Overdue'];
const DROPPED_LOG_TYPES = new Set(['WEBHOOK_RAW']);

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), { ...init, headers: { ...JSON_HEADERS, ...(init.headers ?? {}) } });
}

function normalizeWa(raw: unknown) {
  return String(raw ?? '').replace(/\D/g, '');
}

function waLast10(raw: unknown) {
  return normalizeWa(raw).slice(-10);
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix = '') {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(env: Env) {
  return {
    'access-control-allow-origin': env.APP_ORIGIN || '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  };
}

function requireSecret(req: Request, env: Env) {
  const expected = env.API_SHARED_SECRET;
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return !!expected && got === expected;
}

async function body<T>(req: Request): Promise<T> {
  try {
    return await req.json() as T;
  } catch {
    return {} as T;
  }
}

function userFromRow(row: any) {
  if (!row) return null;
  return {
    uid: row.uid,
    name: row.name,
    rawName: row.raw_name || '',
    email: row.email || '',
    waNumber: row.wa_number,
    waNumberLast10: row.wa_number_last10,
    role: row.role || 'member',
    department: row.department || '',
    isActive: row.is_active !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function taskFromRow(row: any) {
  if (!row) return null;
  return {
    taskId: row.task_id,
    description: row.description,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    assignedToWa: row.assigned_to_wa,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    handoffUid: row.handoff_uid,
    handoffName: row.handoff_name,
    handoffWa: row.handoff_wa || '',
    category: row.category,
    priority: row.priority,
    status: row.status,
    department: row.department || '',
    startDate: row.start_date,
    endDate: row.end_date,
    delayedDate: row.delayed_date,
    delayReason: row.delay_reason,
    revisionStatus: row.revision_status || 'none',
    notes: row.notes,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dayKey: row.day_key,
    weekKey: row.week_key,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    monthKey: row.month_key,
  };
}

function scoreFromRow(row: any) {
  return {
    uid: row.uid,
    name: row.name,
    department: row.department || '',
    waNumber: row.wa_number || '',
    tasksAssigned: row.tasks_assigned || 0,
    tasksCompleted: row.tasks_completed || 0,
    onTimeCount: row.on_time_count || 0,
    lateCount: row.late_count || 0,
    monthlyScore: row.monthly_score || 0,
    lastUpdated: row.last_updated,
  };
}

function departmentFromRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function revisionFromRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    requestedDate: row.requested_date,
    reason: row.reason,
    status: row.status,
    decidedBy: row.decided_by,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

function crmLeadFromRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name || row.name || '',
    contactName: row.contact_name || row.name || '',
    phone: row.phone || '',
    email: row.email || null,
    source: row.source || 'Manual',
    stage: row.stage || row.status || 'New',
    ownerUid: row.owner_uid || '',
    ownerName: row.owner_name || '',
    notes: row.notes || null,
    nextFollowUp: row.next_follow_up || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function automationFromRow(row: any) {
  if (!row) return null;
  const config = JSON.parse(row.config_json || '{}');
  return {
    id: row.id,
    name: row.name,
    trigger: config.trigger || row.type || 'Task Overdue',
    action: config.action || 'Notify Admin',
    target: config.target || '',
    messageTemplate: config.messageTemplate || '',
    isActive: row.is_active !== 0,
    createdBy: config.createdBy || '',
    createdByName: config.createdByName || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function sendWhatsApp(env: Env, to: string, message: string) {
  const base = env.WAHA_URL?.replace(/\/$/, '');
  const session = env.WAHA_SESSION || 'ahlaiteam';
  if (!base) return { ok: false, error: 'WAHA_URL is not configured' };

  const res = await fetch(`${base}/api/sendText`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.WAHA_API_KEY ? { 'X-Api-Key': env.WAHA_API_KEY } : {}),
    },
    body: JSON.stringify({
      session,
      chatId: `${normalizeWa(to)}@c.us`,
      text: message,
    }),
  });

  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}

async function log(env: Env, type: string, message: string, opts: Record<string, unknown> = {}) {
  if (DROPPED_LOG_TYPES.has(type)) return;
  if (type === 'SEND_WA' && /^Sent to\b/.test(message)) return;
  if (type === 'REMINDER' && /\bsent\b/i.test(message)) return;

  await env.DB.prepare(
    'INSERT INTO logs (id, type, task_id, uid, message, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(randomId('log_'), type, opts.taskId || null, opts.uid || null, message, JSON.stringify(opts.meta || {}), nowIso()).run();
}

async function routeAuth(req: Request, env: Env, path: string) {
  if (path === '/auth/login' && req.method === 'POST') {
    const data = await body<{ waNumber?: string }>(req);
    const last10 = waLast10(data.waNumber);
    if (last10.length !== 10) return json({ success: false, error: 'WhatsApp number required' }, { status: 400 });

    const row = await env.DB.prepare('SELECT * FROM users WHERE wa_number_last10 = ? AND is_active = 1 LIMIT 1').bind(last10).first();
    const user = userFromRow(row);
    if (!user) return json({ success: false, error: 'User not found or inactive' }, { status: 401 });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const sessionId = randomId('otp_');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO otp_sessions (id, uid, otp_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(sessionId, user.uid, await sha256(`${sessionId}:${otp}`), expiresAt, nowIso())
      .run();

    const sent = await sendWhatsApp(env, user.waNumber, `Your AHL Task Manager OTP is ${otp}. It expires in 10 minutes.`);
    if (!sent.ok) return json({ success: false, error: 'OTP could not be sent on WhatsApp. Please ask admin to check the WAHA session.' }, { status: 502 });

    await log(env, 'INBOUND_WA', `OTP login requested: ${user.name}`, { uid: user.uid });
    return json({ success: true, data: { sessionId, expiresAt } });
  }

  if (path === '/auth/verify-otp' && req.method === 'POST') {
    const data = await body<{ sessionId?: string; otp?: string }>(req);
    const sessionId = String(data.sessionId || '');
    const otp = String(data.otp || '').replace(/\D/g, '');
    if (!sessionId || otp.length !== 6) return json({ success: false, error: 'OTP session and code are required' }, { status: 400 });

    const session = await env.DB.prepare('SELECT * FROM otp_sessions WHERE id = ? LIMIT 1').bind(sessionId).first<any>();
    if (!session || session.used_at) return json({ success: false, error: 'OTP session expired or already used' }, { status: 401 });
    if (new Date(session.expires_at).getTime() < Date.now()) return json({ success: false, error: 'OTP expired' }, { status: 401 });
    if (session.otp_hash !== await sha256(`${sessionId}:${otp}`)) return json({ success: false, error: 'Invalid OTP' }, { status: 401 });

    const user = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ? AND is_active = 1 LIMIT 1').bind(session.uid).first());
    if (!user) return json({ success: false, error: 'User not found or inactive' }, { status: 401 });
    await env.DB.prepare('UPDATE otp_sessions SET used_at = ? WHERE id = ?').bind(nowIso(), sessionId).run();
    await log(env, 'INBOUND_WA', `OTP login verified: ${user.name}`, { uid: user.uid });
    return json({ success: true, data: { user } });
  }

  return null;
}

async function routeUsers(req: Request, env: Env, url: URL) {
  if (url.pathname === '/users' && req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM users ORDER BY name').all();
    return json({ success: true, data: rows.results.map(userFromRow) });
  }

  if (url.pathname === '/users/by-wa' && req.method === 'GET') {
    const user = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE wa_number_last10 = ? AND is_active = 1 LIMIT 1').bind(waLast10(url.searchParams.get('wa'))).first());
    return json({ success: true, data: user });
  }

  if (url.pathname === '/users/by-uid' && req.method === 'GET') {
    const user = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1').bind(url.searchParams.get('uid')).first());
    return json({ success: true, data: user });
  }

  if (url.pathname === '/users' && req.method === 'POST') {
    const data = await body<any>(req);
    const uid = data.uid || randomId('user_');
    const wa = normalizeWa(data.waNumber);
    const now = nowIso();
    await env.DB.prepare(
      'INSERT INTO users (uid, name, raw_name, email, wa_number, wa_number_last10, role, department, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
    ).bind(uid, data.name || '', data.rawName || '', data.email || '', wa, waLast10(wa), data.role || 'member', data.department || '', now, now).run();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO scores (uid, name, department, wa_number, tasks_assigned, tasks_completed, on_time_count, late_count, monthly_score, last_updated) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, ?)'
    ).bind(uid, data.name || '', data.department || '', wa, now).run();
    return json({ success: true, data: { uid } }, { status: 201 });
  }

  if (url.pathname === '/users' && req.method === 'PATCH') {
    const data = await body<any>(req);
    if (!data.uid) return json({ success: false, error: 'User id is required' }, { status: 400 });
    const current = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ? LIMIT 1').bind(data.uid).first());
    if (!current) return json({ success: false, error: 'User not found' }, { status: 404 });
    const wa = data.waNumber ? normalizeWa(data.waNumber) : current.waNumber;
    await env.DB.prepare('UPDATE users SET name = ?, wa_number = ?, wa_number_last10 = ?, role = ?, department = ?, is_active = ?, updated_at = ? WHERE uid = ?')
      .bind(data.name ?? current.name, wa, waLast10(wa), data.role ?? current.role, data.department ?? current.department, data.isActive === false ? 0 : 1, nowIso(), data.uid)
      .run();
    await env.DB.prepare('UPDATE scores SET name = ?, department = ?, wa_number = ?, last_updated = ? WHERE uid = ?')
      .bind(data.name ?? current.name, data.department ?? current.department, wa, nowIso(), data.uid)
      .run();
    return json({ success: true, data: userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(data.uid).first()) });
  }

  if (url.pathname === '/users' && req.method === 'DELETE') {
    const uid = url.searchParams.get('uid');
    if (!uid) return json({ success: false, error: 'User id is required' }, { status: 400 });
    await env.DB.batch([
      env.DB.prepare('DELETE FROM tasks_current WHERE assigned_to = ?').bind(uid),
      env.DB.prepare('DELETE FROM scores WHERE uid = ?').bind(uid),
      env.DB.prepare('DELETE FROM users WHERE uid = ?').bind(uid),
    ]);
    return json({ success: true });
  }

  return null;
}

async function routeDepartments(req: Request, env: Env, url: URL) {
  if (url.pathname === '/departments' && req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM departments WHERE is_active = 1 ORDER BY name').all();
    return json({ success: true, data: rows.results.map(departmentFromRow) });
  }
  if (url.pathname === '/departments' && req.method === 'POST') {
    const data = await body<{ name?: string }>(req);
    const name = String(data.name || '').trim().replace(/\s+/g, ' ');
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const now = nowIso();
    await env.DB.prepare('INSERT INTO departments (id, name, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)').bind(id, name, now, now).run();
    return json({ success: true, data: { id, name, isActive: true, createdAt: now, updatedAt: now } }, { status: 201 });
  }
  if (url.pathname === '/departments' && req.method === 'DELETE') {
    if (url.searchParams.get('all') === 'true') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM departments'),
        env.DB.prepare("UPDATE users SET department = '', updated_at = ?").bind(nowIso()),
      ]);
      return json({ success: true });
    }
    const id = url.searchParams.get('id');
    if (!id) return json({ success: false, error: 'Department id is required' }, { status: 400 });
    const dep = await env.DB.prepare('SELECT * FROM departments WHERE id = ?').bind(id).first<any>();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM departments WHERE id = ?').bind(id),
      env.DB.prepare("UPDATE users SET department = '', updated_at = ? WHERE department = ?").bind(nowIso(), dep?.name || ''),
    ]);
    return json({ success: true });
  }
  return null;
}

async function nextTaskId(env: Env) {
  await env.DB.prepare("INSERT OR IGNORE INTO task_counters (id, current_value) VALUES ('tasks', 0)").run();
  const row = await env.DB.prepare("UPDATE task_counters SET current_value = current_value + 1 WHERE id = 'tasks' RETURNING current_value").first<any>();
  return `T-${String(row?.current_value || Date.now()).padStart(4, '0')}`;
}

function periodFields(dateValue?: string | null) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const dayKey = date.toISOString().slice(0, 10);
  const monthKey = date.toISOString().slice(0, 7);
  return { dayKey, monthKey };
}

async function routeTasks(req: Request, env: Env, url: URL) {
  if (url.pathname === '/tasks' && req.method === 'GET') {
    const scope = url.searchParams.get('scope') || 'all';
    const uid = url.searchParams.get('uid');
    const status = url.searchParams.get('status');
    const department = url.searchParams.get('department');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 500), 1), 1000);
    const clauses: string[] = [];
    const binds: unknown[] = [];
    if (scope === 'mine' && uid) { clauses.push('assigned_to = ?'); binds.push(uid); }
    if (scope === 'handoff' && uid) { clauses.push('handoff_uid = ?'); binds.push(uid); }
    if (status) { clauses.push('status = ?'); binds.push(status); }
    if (department) { clauses.push('department = ?'); binds.push(department); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await env.DB.prepare(`SELECT * FROM tasks_current ${where} ORDER BY created_at DESC LIMIT ?`).bind(...binds, limit).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }

  if (url.pathname.startsWith('/tasks/') && req.method === 'GET') {
    const id = decodeURIComponent(url.pathname.slice('/tasks/'.length));
    const task = taskFromRow(await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id = ? LIMIT 1').bind(id).first());
    return task ? json({ success: true, data: task }) : json({ success: false, error: 'Not found' }, { status: 404 });
  }

  if (url.pathname === '/tasks/active' && req.method === 'GET') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 500), 1), 1000);
    const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT * FROM tasks_current WHERE status IN (${placeholders}) ORDER BY created_at DESC LIMIT ?`).bind(...ACTIVE_STATUSES, limit).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }

  if (url.pathname === '/tasks/overdue' && req.method === 'GET') {
    const now = nowIso();
    const rows = await env.DB.prepare("SELECT * FROM tasks_current WHERE status IN ('Pending Accept', 'In Progress') AND end_date IS NOT NULL AND end_date < ? ORDER BY end_date ASC LIMIT 1000").bind(now).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }

  if (url.pathname === '/tasks/due-within' && req.method === 'GET') {
    const hours = Math.min(Math.max(Number(url.searchParams.get('hours') || 24), 1), 720);
    const from = nowIso();
    const to = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const rows = await env.DB.prepare("SELECT * FROM tasks_current WHERE status IN ('Pending Accept', 'In Progress') AND end_date IS NOT NULL AND end_date >= ? AND end_date <= ? ORDER BY end_date ASC LIMIT 1000").bind(from, to).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }

  if (url.pathname === '/tasks' && req.method === 'POST') {
    const data = await body<any>(req);
    const creator = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(data.creatorUid).first()) || data.creatorFallback;
    const assignee = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(data.assignedTo).first());
    const handoff = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(data.handoffUid || data.creatorUid).first()) || creator;
    if (!assignee) return json({ success: false, error: 'Selected assignee was not found' }, { status: 400 });
    const taskId = await nextTaskId(env);
    const now = nowIso();
    const pf = periodFields(data.endDate || data.startDate || now);
    const status = data.skipAcceptance ? 'In Progress' : 'Pending Accept';
    await env.DB.prepare(
      `INSERT INTO tasks_current (task_id, description, assigned_to, assigned_to_name, assigned_to_wa, created_by, created_by_name, handoff_uid, handoff_name, handoff_wa, category, priority, status, department, start_date, end_date, delayed_date, delay_reason, revision_status, notes, accepted_at, completed_at, verified_at, created_at, updated_at, day_key, month_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'none', ?, ?, NULL, NULL, ?, ?, ?, ?)`
    ).bind(taskId, data.description || '', assignee.uid, assignee.name, assignee.waNumber, creator?.uid || data.creatorUid || 'admin', creator?.name || 'Admin', handoff?.uid || data.handoffUid || 'admin', handoff?.name || 'Admin', handoff?.waNumber || '', data.category || 'One Time', data.priority || 'Medium', status, assignee.department || data.department || '', data.startDate || null, data.endDate || null, data.notes || null, data.skipAcceptance ? now : null, now, now, pf.dayKey, pf.monthKey).run();
    await log(env, 'TASK_CREATED', `Task ${taskId} created`, { taskId, uid: creator?.uid });
    return json({ success: true, data: taskFromRow(await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id = ?').bind(taskId).first()) }, { status: 201 });
  }

  if (url.pathname.startsWith('/tasks/') && req.method === 'PATCH') {
    const id = decodeURIComponent(url.pathname.slice('/tasks/'.length));
    const data = await body<any>(req);
    const updates: string[] = ['updated_at = ?'];
    const binds: unknown[] = [nowIso()];
    for (const [field, column] of [
      ['status', 'status'],
      ['startDate', 'start_date'],
      ['endDate', 'end_date'],
      ['delayedDate', 'delayed_date'],
      ['delayReason', 'delay_reason'],
      ['revisionStatus', 'revision_status'],
      ['acceptedAt', 'accepted_at'],
      ['completedAt', 'completed_at'],
      ['verifiedAt', 'verified_at'],
    ] as const) {
      if (data[field] !== undefined) { updates.push(`${column} = ?`); binds.push(data[field]); }
    }
    binds.push(id);
    await env.DB.prepare(`UPDATE tasks_current SET ${updates.join(', ')} WHERE task_id = ?`).bind(...binds).run();
    if (data.scoreIncrement?.uid && data.scoreIncrement?.field) {
      const col = data.scoreIncrement.field === 'tasksCompleted' ? 'tasks_completed' : data.scoreIncrement.field === 'onTimeCount' ? 'on_time_count' : data.scoreIncrement.field === 'lateCount' ? 'late_count' : 'tasks_assigned';
      await env.DB.prepare(`UPDATE scores SET ${col} = ${col} + 1, last_updated = ? WHERE uid = ?`).bind(nowIso(), data.scoreIncrement.uid).run();
    }
    return json({ success: true, data: taskFromRow(await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id = ?').bind(id).first()) });
  }

  return null;
}

async function routeScores(req: Request, env: Env, url: URL) {
  if (url.pathname === '/scores' && req.method === 'GET') {
    const uid = url.searchParams.get('uid');
    if (uid) {
      const row = await env.DB.prepare('SELECT * FROM scores WHERE uid = ?').bind(uid).first();
      return json({ success: true, data: row ? scoreFromRow(row) : null });
    }
    const rows = await env.DB.prepare('SELECT * FROM scores ORDER BY monthly_score DESC').all();
    return json({ success: true, data: rows.results.map(scoreFromRow) });
  }
  if (url.pathname === '/logs' && req.method === 'POST') {
    const data = await body<any>(req);
    await log(env, data.type || 'WEBHOOK_RAW', data.message || '', data);
    return json({ success: true });
  }
  if (url.pathname === '/scores/increment' && req.method === 'POST') {
    const data = await body<{ uid?: string; field?: string; fields?: string[] }>(req);
    const fields = [...(data.fields ?? []), ...(data.field ? [data.field] : [])];
    if (!data.uid || fields.length === 0) return json({ success: false, error: 'uid and field(s) are required' }, { status: 400 });

    const counts = {
      tasksAssigned: fields.filter(field => field === 'tasksAssigned').length,
      tasksCompleted: fields.filter(field => field === 'tasksCompleted').length,
      onTimeCount: fields.filter(field => field === 'onTimeCount').length,
      lateCount: fields.filter(field => field === 'lateCount').length,
    };
    const now = nowIso();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO scores (uid, name, department, wa_number, tasks_assigned, tasks_completed, on_time_count, late_count, monthly_score, last_updated)
       SELECT uid, name, department, wa_number, 0, 0, 0, 0, 0, ? FROM users WHERE uid = ?`
    ).bind(now, data.uid).run();

    await env.DB.prepare(
      `UPDATE scores
       SET tasks_assigned = tasks_assigned + ?,
           tasks_completed = tasks_completed + ?,
           on_time_count = on_time_count + ?,
           late_count = late_count + ?,
           monthly_score = CASE
             WHEN tasks_assigned + ? > 0 THEN ROUND(((on_time_count + ?) * 100.0) / (tasks_assigned + ?))
             ELSE 0
           END,
           last_updated = ?
       WHERE uid = ?`
    ).bind(
      counts.tasksAssigned,
      counts.tasksCompleted,
      counts.onTimeCount,
      counts.lateCount,
      counts.tasksAssigned,
      counts.onTimeCount,
      counts.tasksAssigned,
      now,
      data.uid,
    ).run();

    return json({ success: true });
  }
  return null;
}

async function routeRevisions(req: Request, env: Env, url: URL) {
  if (url.pathname === '/revisions' && req.method === 'GET') {
    const status = url.searchParams.get('status');
    const taskId = url.searchParams.get('taskId');
    const requestedBy = url.searchParams.get('requestedBy');
    const handoffUid = url.searchParams.get('handoffUid');
    const visibleForUid = url.searchParams.get('visibleForUid');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 300), 1), 1000);

    if (handoffUid) {
      const clauses = ['t.handoff_uid = ?'];
      const binds: unknown[] = [handoffUid];
      if (status) { clauses.push('r.status = ?'); binds.push(status); }
      const rows = await env.DB.prepare(
        `SELECT r.* FROM revisions r
         JOIN tasks_current t ON t.task_id = r.task_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY r.created_at DESC LIMIT ?`
      ).bind(...binds, limit).all();
      return json({ success: true, data: rows.results.map(revisionFromRow) });
    }

    if (visibleForUid) {
      const clauses = ['(r.requested_by = ? OR t.handoff_uid = ?)'];
      const binds: unknown[] = [visibleForUid, visibleForUid];
      if (status) { clauses.push('r.status = ?'); binds.push(status); }
      const rows = await env.DB.prepare(
        `SELECT r.* FROM revisions r
         LEFT JOIN tasks_current t ON t.task_id = r.task_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY r.created_at DESC LIMIT ?`
      ).bind(...binds, limit).all();
      return json({ success: true, data: rows.results.map(revisionFromRow) });
    }

    const clauses: string[] = [];
    const binds: unknown[] = [];
    if (status) { clauses.push('status = ?'); binds.push(status); }
    if (taskId) { clauses.push('task_id = ?'); binds.push(taskId); }
    if (requestedBy) { clauses.push('requested_by = ?'); binds.push(requestedBy); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await env.DB.prepare(`SELECT * FROM revisions ${where} ORDER BY created_at DESC LIMIT ?`).bind(...binds, limit).all();
    return json({ success: true, data: rows.results.map(revisionFromRow) });
  }

  if (url.pathname === '/revisions' && req.method === 'POST') {
    const data = await body<any>(req);
    const id = randomId('rev_');
    const now = nowIso();
    await env.DB.prepare(
      'INSERT INTO revisions (id, task_id, requested_by, requested_by_name, requested_date, reason, status, decided_by, decided_by_name, decided_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)'
    ).bind(id, data.taskId, data.requestedBy, data.requestedByName, data.requestedDate, data.reason, 'pending', now).run();
    return json({ success: true, data: revisionFromRow(await env.DB.prepare('SELECT * FROM revisions WHERE id = ?').bind(id).first()) }, { status: 201 });
  }

  if (url.pathname === '/revisions' && req.method === 'PATCH') {
    const data = await body<any>(req);
    if (!data.revisionId) return json({ success: false, error: 'revisionId is required' }, { status: 400 });
    await env.DB.prepare('UPDATE revisions SET status = ?, decided_by = ?, decided_by_name = ?, decided_at = ? WHERE id = ?')
      .bind(data.decision, data.decidedBy || null, data.decidedByName || null, nowIso(), data.revisionId)
      .run();
    return json({ success: true, data: revisionFromRow(await env.DB.prepare('SELECT * FROM revisions WHERE id = ?').bind(data.revisionId).first()) });
  }

  return null;
}

async function routeCrm(req: Request, env: Env, url: URL) {
  if (url.pathname === '/crm' && req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM crm_leads ORDER BY updated_at DESC').all();
    return json({ success: true, data: rows.results.map(crmLeadFromRow) });
  }
  if (url.pathname === '/crm' && req.method === 'POST') {
    const data = await body<any>(req);
    const id = randomId('crm_');
    const now = nowIso();
    await env.DB.prepare(
      'INSERT INTO crm_leads (id, name, company_name, contact_name, phone, email, source, status, stage, notes, owner_uid, owner_name, next_follow_up, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, data.companyName || data.contactName || '', data.companyName || '', data.contactName || '', normalizeWa(data.phone), data.email || null, data.source || 'Manual', data.stage || 'New', data.stage || 'New', data.notes || null, data.ownerUid || '', data.ownerName || '', data.nextFollowUp || null, now, now).run();
    return json({ success: true, data: crmLeadFromRow(await env.DB.prepare('SELECT * FROM crm_leads WHERE id = ?').bind(id).first()) }, { status: 201 });
  }
  return null;
}

async function routeAutomations(req: Request, env: Env, url: URL) {
  if (url.pathname === '/automations' && req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM automations ORDER BY created_at DESC').all();
    return json({ success: true, data: rows.results.map(automationFromRow) });
  }
  if (url.pathname === '/automations' && req.method === 'POST') {
    const data = await body<any>(req);
    const id = randomId('auto_');
    const now = nowIso();
    const config = {
      trigger: data.trigger,
      action: data.action,
      target: data.target,
      messageTemplate: data.messageTemplate,
      createdBy: data.createdBy,
      createdByName: data.createdByName,
    };
    await env.DB.prepare('INSERT INTO automations (id, name, type, is_active, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, data.name || '', data.trigger || 'Task Overdue', data.isActive === false ? 0 : 1, JSON.stringify(config), now, now)
      .run();
    return json({ success: true, data: automationFromRow(await env.DB.prepare('SELECT * FROM automations WHERE id = ?').bind(id).first()) }, { status: 201 });
  }
  if (url.pathname === '/automations' && req.method === 'PATCH') {
    const data = await body<any>(req);
    if (!data.id) return json({ success: false, error: 'id is required' }, { status: 400 });
    await env.DB.prepare('UPDATE automations SET is_active = ?, updated_at = ? WHERE id = ?').bind(data.isActive === false ? 0 : 1, nowIso(), data.id).run();
    return json({ success: true });
  }
  return null;
}

async function routeChecklist(req: Request, env: Env, url: URL) {
  if (url.pathname === '/checklist/completions' && req.method === 'GET') {
    const uid = url.searchParams.get('uid');
    if (!uid) return json({ success: false, error: 'uid is required' }, { status: 400 });
    const taskId = url.searchParams.get('taskId');
    const periodKey = url.searchParams.get('periodKey');
    const periodKeys = url.searchParams.getAll('periodKey');
    const clauses = ['uid = ?'];
    const binds: unknown[] = [uid];
    if (taskId) { clauses.push('task_id = ?'); binds.push(taskId); }
    if (periodKeys.length > 1) {
      clauses.push(`period_key IN (${periodKeys.map(() => '?').join(',')})`);
      binds.push(...periodKeys);
    } else if (periodKey) {
      clauses.push('period_key = ?');
      binds.push(periodKey);
    }
    const rows = await env.DB.prepare(`SELECT * FROM checklist_completions WHERE ${clauses.join(' AND ')}`).bind(...binds).all<any>();
    return json({ success: true, data: rows.results.map(row => ({
      id: row.id,
      taskId: row.task_id,
      uid: row.uid,
      category: row.category,
      periodKey: row.period_key,
      completedAt: row.completed_at,
    })) });
  }
  if (url.pathname === '/checklist/completions' && req.method === 'POST') {
    const data = await body<any>(req);
    const now = nowIso();
    await env.DB.prepare('INSERT INTO checklist_completions (id, task_id, uid, category, period_key, completed_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(data.id, data.taskId, data.uid, data.category, data.periodKey, now)
      .run();
    return json({ success: true, data: { ...data, completedAt: now } }, { status: 201 });
  }
  return null;
}

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(env) });

    const authRoute = await routeAuth(req, env, url.pathname);
    if (authRoute) return new Response(authRoute.body, { status: authRoute.status, headers: { ...Object.fromEntries(authRoute.headers), ...corsHeaders(env) } });

    if (!requireSecret(req, env)) return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: corsHeaders(env) });

    const response =
      await routeUsers(req, env, url) ||
      await routeDepartments(req, env, url) ||
      await routeTasks(req, env, url) ||
      await routeScores(req, env, url) ||
      await routeRevisions(req, env, url) ||
      await routeCrm(req, env, url) ||
      await routeAutomations(req, env, url) ||
      await routeChecklist(req, env, url) ||
      json({ success: false, error: 'Not found' }, { status: 404 });
    return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...corsHeaders(env) } });
  },
};
