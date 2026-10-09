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

function safeBinds(values: unknown[]): unknown[] {
  return values.map(v => (v === undefined ? null : v));
}

function wrapDb(db: D1Database): D1Database {
  if (!db || typeof db.prepare !== 'function') return db;
  return {
    prepare(query: string) {
      const stmt = db.prepare(query);
      return {
        bind(...values: unknown[]) {
          return stmt.bind(...safeBinds(values));
        },
        first<T = unknown>() {
          return stmt.first<T>();
        },
        all<T = unknown>() {
          return stmt.all<T>();
        },
        run() {
          return stmt.run();
        },
      } as D1PreparedStatement;
    },
    batch(statements: D1PreparedStatement[]) {
      return db.batch(statements);
    },
  };
}

/** Digits only; ensures Indian country code 91 when missing (no double-prefix). */
function normalizeWa(raw: unknown) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length >= 12) return digits;
  const last10 = digits.slice(-10);
  if (last10.length === 10) return `91${last10}`;
  return digits;
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
  const session = env.WAHA_SESSION;
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

async function nextTaskId(env: Env): Promise<string> {
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO task_counters (id, current_value) VALUES ('tasks', 0)").run();
    const row = await env.DB.prepare("UPDATE task_counters SET current_value = current_value + 1 WHERE id = 'tasks' RETURNING current_value").first<any>();
    if (row?.current_value) {
      return `T-${String(row.current_value).padStart(4, '0')}`;
    }
  } catch { }

  const row = await env.DB.prepare(
    "SELECT task_id FROM tasks_current WHERE task_id LIKE 'T-%' ORDER BY CAST(SUBSTR(task_id, 3) AS INTEGER) DESC LIMIT 1"
  ).first<{ task_id: string }>();

  let nextNum = 1;
  if (row?.task_id) {
    const match = row.task_id.match(/T-(\d+)/i);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `T-${String(nextNum).padStart(4, '0')}`;
}

function periodFields(dateValue?: string | null) {
  let date = dateValue ? new Date(dateValue) : new Date();
  if (isNaN(date.getTime())) {
    date = new Date();
  }
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
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam === 'all'
      ? null
      : Math.min(Math.max(Number(limitParam || 1000), 1), 1000);
    const clauses: string[] = [];
    const binds: unknown[] = [];
    if (scope === 'mine' && uid) { clauses.push('assigned_to = ?'); binds.push(uid); }
    if (scope === 'handoff' && uid) { clauses.push('handoff_uid = ?'); binds.push(uid); }
    if (status) {
      clauses.push('status = ?');
      binds.push(status);
    }
    if (department) { clauses.push('department = ?'); binds.push(department); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause = limit ? 'LIMIT ?' : '';
    const orderClause = status === 'Completed'
      ? 'ORDER BY COALESCE(completed_at, updated_at, created_at) DESC, created_at DESC, task_id DESC'
      : 'ORDER BY created_at DESC, task_id DESC';
    const rows = await env.DB.prepare(`SELECT * FROM tasks_current ${where} ${orderClause} ${limitClause}`)
      .bind(...binds, ...(limit ? [limit] : []))
      .all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }

  if (url.pathname === '/tasks/active' && req.method === 'GET') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 1000), 1), 1000);
    const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT * FROM tasks_current WHERE status IN (${placeholders}) ORDER BY created_at DESC, task_id DESC LIMIT ?`).bind(...ACTIVE_STATUSES, limit).all();
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

  if (url.pathname.startsWith('/tasks/') && req.method === 'GET') {
    const id = decodeURIComponent(url.pathname.slice('/tasks/'.length));
    const task = taskFromRow(await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id = ? LIMIT 1').bind(id).first());
    return task ? json({ success: true, data: task }) : json({ success: false, error: 'Not found' }, { status: 404 });
  }

  if (url.pathname === '/tasks' && req.method === 'POST') {
    try {
      const data = await body<any>(req);
      const creator = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(data.creatorUid || '').first()) || data.creatorFallback;
      const assignee = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(data.assignedTo || '').first());
      const handoff = userFromRow(await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(data.handoffUid || data.creatorUid || '').first()) || creator;
      if (!assignee) return json({ success: false, error: 'Selected assignee was not found' }, { status: 400 });
      const taskId = await nextTaskId(env);
      const now = nowIso();
      const startDateVal = data.startDate && String(data.startDate).trim() ? data.startDate : null;
      const endDateVal = data.endDate && String(data.endDate).trim() ? data.endDate : null;
      const createdAt = data.createdAt || now;
      const pf = periodFields(endDateVal || startDateVal || now);
      const status = data.skipAcceptance ? 'In Progress' : (data.status || 'Pending Accept');
      await env.DB.prepare(
        `INSERT INTO tasks_current (task_id, description, assigned_to, assigned_to_name, assigned_to_wa, created_by, created_by_name, handoff_uid, handoff_name, handoff_wa, category, priority, status, department, start_date, end_date, delayed_date, delay_reason, revision_status, notes, accepted_at, completed_at, verified_at, created_at, updated_at, day_key, month_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'none', ?, ?, NULL, NULL, ?, ?, ?, ?)`
      ).bind(taskId, data.description || '', assignee.uid, assignee.name, assignee.waNumber, creator?.uid || data.creatorUid || 'admin', creator?.name || 'Admin', handoff?.uid || data.handoffUid || creator?.uid || 'admin', handoff?.name || creator?.name || 'Admin', handoff?.waNumber || creator?.waNumber || '', data.category || 'One Time', data.priority || 'Medium', status, assignee.department || data.department || '', startDateVal, endDateVal, data.notes || null, data.skipAcceptance ? now : null, createdAt, now, pf.dayKey, pf.monthKey).run();
      await log(env, 'TASK_CREATED', `Task ${taskId} created`, { taskId, uid: creator?.uid });
      return json({ success: true, data: taskFromRow(await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id = ?').bind(taskId).first()) }, { status: 201 });
    } catch (err: any) {
      console.error('POST /tasks worker error:', err);
      return json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
  }

  if (url.pathname.startsWith('/tasks/') && req.method === 'PATCH') {
    try {
      const id = decodeURIComponent(url.pathname.slice('/tasks/'.length));
      const data = await body<any>(req);
      const updates: string[] = ['updated_at = ?'];
      const binds: unknown[] = [nowIso()];
      for (const [field, column] of [
        ['status', 'status'],
        ['priority', 'priority'],
        ['startDate', 'start_date'],
        ['endDate', 'end_date'],
        ['delayedDate', 'delayed_date'],
        ['delayReason', 'delay_reason'],
        ['revisionStatus', 'revision_status'],
        ['notes', 'notes'],
        ['acceptedAt', 'accepted_at'],
        ['completedAt', 'completed_at'],
        ['verifiedAt', 'verified_at'],
        ['handoffUid', 'handoff_uid'],
        ['handoffName', 'handoff_name'],
        ['category', 'category'],
        ['handoffWa', 'handoff_wa'],
        ['newTaskId', 'task_id'],
      ] as const) {
        if (data[field] === null) {
          updates.push(`${column} = NULL`);
        } else if (data[field] !== undefined) {
          updates.push(`${column} = ?`);
          binds.push(data[field]);
        }
      }
      binds.push(id);
      await env.DB.prepare(`UPDATE tasks_current SET ${updates.join(', ')} WHERE task_id = ?`).bind(...binds).run();
      if (data.scoreIncrement?.uid && data.scoreIncrement?.field) {
        const col = data.scoreIncrement.field === 'tasksCompleted' ? 'tasks_completed' : data.scoreIncrement.field === 'onTimeCount' ? 'on_time_count' : data.scoreIncrement.field === 'lateCount' ? 'late_count' : 'tasks_assigned';
        await env.DB.prepare(`UPDATE scores SET ${col} = ${col} + 1, last_updated = ? WHERE uid = ?`).bind(nowIso(), data.scoreIncrement.uid).run();
      }
      return json({ success: true, data: taskFromRow(await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id = ?').bind(id).first()) });
    } catch (err: any) {
      return json({ success: false, error: err.stack || err.message || String(err) }, { status: 500 });
    }
  }

  if (url.pathname.startsWith('/tasks/') && req.method === 'DELETE') {
    try {
      const id = decodeURIComponent(url.pathname.slice('/tasks/'.length));
      const existing = await env.DB.prepare('SELECT task_id FROM tasks_current WHERE task_id = ? LIMIT 1').bind(id).first();
      if (!existing) return json({ success: false, error: 'Not found' }, { status: 404 });
      await env.DB.batch([
        env.DB.prepare('DELETE FROM revisions WHERE task_id = ?').bind(id),
        env.DB.prepare('DELETE FROM tasks_current WHERE task_id = ?').bind(id),
      ]);
      try {
        await log(env, 'TASK_DELETED', `Task ${id} deleted`, { taskId: id });
      } catch { }
      return json({ success: true, data: { taskId: id, deleted: true } });
    } catch (err: any) {
      return json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
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
    ).bind(id, data.taskId || '', data.requestedBy || '', data.requestedByName || '', data.requestedDate || now, data.reason || '', 'pending', now).run();
    return json({ success: true, data: revisionFromRow(await env.DB.prepare('SELECT * FROM revisions WHERE id = ?').bind(id).first()) }, { status: 201 });
  }

  if (url.pathname === '/revisions' && req.method === 'PATCH') {
    const data = await body<any>(req);
    if (!data.revisionId) return json({ success: false, error: 'revisionId is required' }, { status: 400 });
    await env.DB.prepare('UPDATE revisions SET status = ?, decided_by = ?, decided_by_name = ?, decided_at = ? WHERE id = ?')
      .bind(data.decision || 'approved', data.decidedBy || null, data.decidedByName || null, nowIso(), data.revisionId)
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
      trigger: data.trigger || 'Task Overdue',
      action: data.action || 'Notify Admin',
      target: data.target || '',
      messageTemplate: data.messageTemplate || '',
      createdBy: data.createdBy || '',
      createdByName: data.createdByName || '',
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

function parseBucketJson(raw: unknown) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      planned: Number(value?.planned ?? 0),
      done: Number(value?.done ?? 0),
      onTime: Number(value?.onTime ?? 0),
    };
  } catch {
    return { planned: 0, done: 0, onTime: 0 };
  }
}

function misWeeklyFromRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.uid || null,
    name: row.name,
    department: row.department || '',
    waNumber: row.wa_number || '',
    checklist: parseBucketJson(row.checklist_json),
    delegation: parseBucketJson(row.delegation_json),
    fms: parseBucketJson(row.fms_json),
    planned: Number(row.planned ?? 0),
    done: Number(row.done ?? 0),
    onTime: Number(row.on_time ?? 0),
    gapPercent: row.gap_percent == null ? null : Number(row.gap_percent),
    gapDecimal: row.gap_decimal == null ? null : Number(row.gap_decimal),
    onTimeGapPercent: row.on_time_gap_percent == null ? null : Number(row.on_time_gap_percent),
    weekKey: row.week_key,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    weekNumber: Number(row.week_number ?? 0),
    monthName: row.month_name,
    year: Number(row.year ?? 0),
    combinedWeek: row.combined_week || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function misArchiveFromRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    timestamp: row.timestamp,
    name: row.name,
    uid: row.uid || null,
    h4: row.h4 == null ? null : Number(row.h4),
    h5: row.h5 == null ? null : Number(row.h5),
    weekKey: row.week_key,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    createdAt: row.created_at,
  };
}

async function routeMis(req: Request, env: Env, url: URL) {
  if (url.pathname === '/mis/weekly' && req.method === 'GET') {
    const weekKey = url.searchParams.get('weekKey');
    const year = url.searchParams.get('year');
    const monthName = url.searchParams.get('monthName');
    const name = url.searchParams.get('name');
    const clauses: string[] = [];
    const binds: unknown[] = [];
    if (weekKey) { clauses.push('week_key = ?'); binds.push(weekKey); }
    if (year) { clauses.push('year = ?'); binds.push(Number(year)); }
    if (monthName) { clauses.push('month_name = ?'); binds.push(monthName); }
    if (name) { clauses.push('LOWER(name) = ?'); binds.push(String(name).trim().toLowerCase()); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await env.DB.prepare(
      `SELECT * FROM mis_weekly ${where} ORDER BY week_start ASC, name ASC`
    ).bind(...binds).all();
    return json({ success: true, data: rows.results.map(misWeeklyFromRow) });
  }

  if (url.pathname === '/mis/weekly/latest' && req.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM mis_weekly ORDER BY week_start DESC, name ASC').all();
    const latest = new Map<string, any>();
    for (const row of rows.results) {
      const mapped = misWeeklyFromRow(row);
      if (!mapped) continue;
      const key = String(mapped.name || '').trim().toLowerCase();
      const existing = latest.get(key);
      if (!existing || mapped.weekStart > existing.weekStart) latest.set(key, mapped);
    }
    return json({ success: true, data: Array.from(latest.values()).sort((a, b) => a.name.localeCompare(b.name)) });
  }

  if (url.pathname === '/mis/weekly/batch' && req.method === 'POST') {
    const data = await body<{ rows?: any[] }>(req);
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length === 0) return json({ success: true, data: { written: 0 } });

    const now = nowIso();
    const statements: D1PreparedStatement[] = [];
    for (const row of rows) {
      const id = String(row.id || '');
      if (!id || !row.name || !row.weekKey) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO mis_weekly (
            id, uid, name, department, wa_number,
            checklist_json, delegation_json, fms_json,
            planned, done, on_time, gap_percent, gap_decimal, on_time_gap_percent,
            week_key, week_start, week_end, week_number, month_name, year, combined_week,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            uid = excluded.uid,
            name = excluded.name,
            department = excluded.department,
            wa_number = excluded.wa_number,
            checklist_json = excluded.checklist_json,
            delegation_json = excluded.delegation_json,
            fms_json = excluded.fms_json,
            planned = excluded.planned,
            done = excluded.done,
            on_time = excluded.on_time,
            gap_percent = excluded.gap_percent,
            gap_decimal = excluded.gap_decimal,
            on_time_gap_percent = excluded.on_time_gap_percent,
            week_key = excluded.week_key,
            week_start = excluded.week_start,
            week_end = excluded.week_end,
            week_number = excluded.week_number,
            month_name = excluded.month_name,
            year = excluded.year,
            combined_week = excluded.combined_week,
            updated_at = excluded.updated_at`
        ).bind(
          id,
          row.uid || null,
          row.name,
          row.department || '',
          row.waNumber || '',
          JSON.stringify(row.checklist || { planned: 0, done: 0, onTime: 0 }),
          JSON.stringify(row.delegation || { planned: 0, done: 0, onTime: 0 }),
          JSON.stringify(row.fms || { planned: 0, done: 0, onTime: 0 }),
          Number(row.planned ?? 0),
          Number(row.done ?? 0),
          Number(row.onTime ?? 0),
          row.gapPercent == null ? null : Number(row.gapPercent),
          row.gapDecimal == null ? null : Number(row.gapDecimal),
          row.onTimeGapPercent == null ? null : Number(row.onTimeGapPercent),
          row.weekKey,
          row.weekStart,
          row.weekEnd,
          Number(row.weekNumber ?? 0),
          row.monthName || '',
          Number(row.year ?? 0),
          row.combinedWeek || '',
          row.createdAt || now,
          row.updatedAt || now,
        ),
      );
    }

    for (let i = 0; i < statements.length; i += 50) {
      await env.DB.batch(statements.slice(i, i + 50));
    }
    return json({ success: true, data: { written: statements.length } });
  }

  if (url.pathname === '/mis/archive' && req.method === 'GET') {
    const weekKey = url.searchParams.get('weekKey');
    const clauses: string[] = [];
    const binds: unknown[] = [];
    if (weekKey) { clauses.push('week_key = ?'); binds.push(weekKey); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await env.DB.prepare(
      `SELECT * FROM mis_archive ${where} ORDER BY timestamp DESC LIMIT 2000`
    ).bind(...binds).all();
    return json({ success: true, data: rows.results.map(misArchiveFromRow) });
  }

  if (url.pathname === '/mis/archive/batch' && req.method === 'POST') {
    const data = await body<{ rows?: any[] }>(req);
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length === 0) return json({ success: true, data: { written: 0 } });

    const now = nowIso();
    const statements: D1PreparedStatement[] = [];
    for (const row of rows) {
      const id = String(row.id || randomId('misarch_'));
      if (!row.name || !row.weekKey) continue;
      statements.push(
        env.DB.prepare(
          `INSERT INTO mis_archive (
            id, timestamp, name, uid, h4, h5, week_key, week_start, week_end, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id,
          row.timestamp || now,
          row.name,
          row.uid || null,
          row.h4 == null ? null : Number(row.h4),
          row.h5 == null ? null : Number(row.h5),
          row.weekKey,
          row.weekStart || '',
          row.weekEnd || '',
          row.createdAt || now,
        ),
      );
    }

    for (let i = 0; i < statements.length; i += 50) {
      await env.DB.batch(statements.slice(i, i + 50));
    }
    return json({ success: true, data: { written: statements.length } });
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
    return json({
      success: true, data: rows.results.map(row => ({
        id: row.id,
        taskId: row.task_id,
        uid: row.uid,
        category: row.category,
        periodKey: row.period_key,
        completedAt: row.completed_at,
      }))
    });
  }
  if (url.pathname === '/checklist/completions' && req.method === 'POST') {
    const data = await body<any>(req);
    const now = nowIso();
    const id = data.id || randomId('chk_');
    await env.DB.prepare('INSERT INTO checklist_completions (id, task_id, uid, category, period_key, completed_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, data.taskId || '', data.uid || '', data.category || '', data.periodKey || '', now)
      .run();
    return json({ success: true, data: { ...data, id, completedAt: now } }, { status: 201 });
  }
  return null;
}

function recurringTemplateFromRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description || '',
    assignedTo: row.assigned_to || '',
    assignedToName: row.assigned_to_name || '',
    department: row.department || '',
    frequency: row.frequency || row.category,
    dayOfWeek: row.day_of_week != null ? Number(row.day_of_week) : null,
    dayOfMonth: row.day_of_month != null ? Number(row.day_of_month) : null,
    timeOfDay: row.time_of_day || '10:00',
    isActive: row.is_active !== 0,
    metadata: JSON.parse(row.metadata_json || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getIstDateParts(date = new Date()) {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  const year = istDate.getUTCFullYear();
  const monthNum = istDate.getUTCMonth() + 1;
  const month = String(monthNum).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const dayOfWeek = istDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const dayOfWeekIso = dayOfWeek === 0 ? 7 : dayOfWeek; // 1=Mon...7=Sun
  const dateStr = `${year}-${month}-${day}`;
  const monthStr = `${year}-${month}`;
  return { year, monthNum, month, day, dayOfWeek, dayOfWeekIso, dateStr, monthStr };
}

function getIstPartsForDateStr(dateStr: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return getIstDateParts();
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
  const dayOfWeek = dt.getUTCDay();
  const dayOfWeekIso = dayOfWeek === 0 ? 7 : dayOfWeek;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endOfMonthStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return {
    year: y,
    monthNum: m,
    month: String(m).padStart(2, '0'),
    day: String(d).padStart(2, '0'),
    dayOfWeek,
    dayOfWeekIso,
    dateStr,
    monthStr: `${y}-${String(m).padStart(2, '0')}`,
    endOfMonthStr,
  };
}

async function routeRecurring(req: Request, env: Env, url: URL) {
  const path = url.pathname;

  // 1. GET /recurring/templates
  if (path === '/recurring/templates' && req.method === 'GET') {
    const category = url.searchParams.get('category');
    const assignedToName = url.searchParams.get('assignedToName');
    const isActive = url.searchParams.get('isActive');

    const clauses: string[] = [];
    const binds: unknown[] = [];

    if (category) {
      clauses.push('LOWER(category) = LOWER(?)');
      binds.push(category);
    }
    if (assignedToName) {
      clauses.push('LOWER(assigned_to_name) = LOWER(?)');
      binds.push(assignedToName);
    }
    if (isActive != null && isActive !== 'all') {
      clauses.push('is_active = ?');
      binds.push(isActive === 'true' || isActive === '1' ? 1 : 0);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT * FROM recurring_templates ${where} ORDER BY category ASC, assigned_to_name ASC, created_at DESC`;
    const rows = await env.DB.prepare(sql).bind(...binds).all<any>();

    return json({
      success: true,
      data: rows.results.map(recurringTemplateFromRow),
    });
  }

  // 2. POST /recurring/templates
  if (path === '/recurring/templates' && req.method === 'POST') {
    const data = await body<any>(req);
    if (!data.title || !data.assignedToName) {
      return json({ success: false, error: 'title and assignedToName are required' }, { status: 400 });
    }

    const now = nowIso();
    const id = String(data.id || randomId('rec_'));
    const category = String(data.category || data.frequency || 'Daily');
    const title = String(data.title).trim();
    const description = String(data.description || '').trim();
    const assignedTo = String(data.assignedTo || '');
    const assignedToName = String(data.assignedToName).trim();
    const department = String(data.department || '').trim();
    const frequency = String(data.frequency || category);
    const dayOfWeek = data.dayOfWeek != null ? Number(data.dayOfWeek) : null;
    const dayOfMonth = data.dayOfMonth != null ? Number(data.dayOfMonth) : null;
    const timeOfDay = String(data.timeOfDay || '10:00');
    const isActive = data.isActive === false || data.isActive === 0 ? 0 : 1;
    const metadataJson = JSON.stringify(data.metadata || {});

    await env.DB.prepare(
      `INSERT INTO recurring_templates (
        id, category, title, description, assigned_to, assigned_to_name,
        department, frequency, day_of_week, day_of_month, time_of_day,
        is_active, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, category, title, description, assignedTo, assignedToName,
      department, frequency, dayOfWeek, dayOfMonth, timeOfDay,
      isActive, metadataJson, now, now
    ).run();

    const created = await env.DB.prepare('SELECT * FROM recurring_templates WHERE id = ?').bind(id).first<any>();
    return json({ success: true, data: recurringTemplateFromRow(created) }, { status: 201 });
  }

  // 3. PATCH /recurring/templates/:id
  const templateMatch = path.match(/^\/recurring\/templates\/([^/]+)$/);
  if (templateMatch && req.method === 'PATCH') {
    const id = templateMatch[1];
    const data = await body<any>(req);
    const now = nowIso();

    const updates: string[] = ['updated_at = ?'];
    const binds: unknown[] = [now];

    if (data.title !== undefined) { updates.push('title = ?'); binds.push(String(data.title).trim()); }
    if (data.description !== undefined) { updates.push('description = ?'); binds.push(String(data.description || '').trim()); }
    if (data.category !== undefined) { updates.push('category = ?'); binds.push(String(data.category)); }
    if (data.frequency !== undefined) { updates.push('frequency = ?'); binds.push(String(data.frequency)); }
    if (data.assignedTo !== undefined) { updates.push('assigned_to = ?'); binds.push(String(data.assignedTo || '')); }
    if (data.assignedToName !== undefined) { updates.push('assigned_to_name = ?'); binds.push(String(data.assignedToName).trim()); }
    if (data.department !== undefined) { updates.push('department = ?'); binds.push(String(data.department || '').trim()); }
    if (data.dayOfWeek !== undefined) { updates.push('day_of_week = ?'); binds.push(data.dayOfWeek != null ? Number(data.dayOfWeek) : null); }
    if (data.dayOfMonth !== undefined) { updates.push('day_of_month = ?'); binds.push(data.dayOfMonth != null ? Number(data.dayOfMonth) : null); }
    if (data.timeOfDay !== undefined) { updates.push('time_of_day = ?'); binds.push(String(data.timeOfDay || '10:00')); }
    if (data.isActive !== undefined) { updates.push('is_active = ?'); binds.push(data.isActive ? 1 : 0); }
    if (data.metadata !== undefined) { updates.push('metadata_json = ?'); binds.push(JSON.stringify(data.metadata)); }

    binds.push(id);
    await env.DB.prepare(`UPDATE recurring_templates SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();

    const updated = await env.DB.prepare('SELECT * FROM recurring_templates WHERE id = ?').bind(id).first<any>();
    return json({ success: true, data: recurringTemplateFromRow(updated) });
  }

  // 4. DELETE /recurring/templates/:id -> HARD PERMANENT DELETE
  if (templateMatch && req.method === 'DELETE') {
    const id = templateMatch[1];
    await env.DB.prepare('DELETE FROM recurring_templates WHERE id = ?').bind(id).run();
    return json({ success: true, data: { deletedId: id, permanent: true } });
  }

  // 5. GET /recurring/checklist -> Daily / Weekly / Monthly checklist view
  if (path === '/recurring/checklist' && req.method === 'GET') {
    const categoryParam = url.searchParams.get('category') || 'Daily';
    const dateParam = url.searchParams.get('date');
    const todayIst = getIstDateParts();
    if (dateParam && dateParam > todayIst.dateStr) {
      return json({ success: true, data: [], meta: { istDate: todayIst.dateStr } });
    }
    const ist = dateParam ? getIstPartsForDateStr(dateParam) : todayIst;
    const userName = url.searchParams.get('userName');

    // Fetch active templates
    let query = 'SELECT * FROM recurring_templates WHERE is_active = 1';
    const binds: unknown[] = [];

    if (categoryParam && categoryParam.toLowerCase() !== 'all') {
      query += ' AND LOWER(category) = LOWER(?)';
      binds.push(categoryParam);
    }
    if (userName) {
      query += ' AND LOWER(assigned_to_name) = LOWER(?)';
      binds.push(userName);
    }

    const templatesRes = await env.DB.prepare(query).bind(...binds).all<any>();
    const templates = templatesRes.results
      .map(recurringTemplateFromRow)
      .filter((t): t is NonNullable<ReturnType<typeof recurringTemplateFromRow>> => t !== null);

    // Filter templates due for the target date/period
    const dueTemplates = templates.filter(t => {
      // Do not show on dates prior to creation
      const createdDateStr = (t.createdAt || '').slice(0, 10);
      if (createdDateStr) {
        if (categoryParam.toLowerCase() === 'monthly') {
          if (createdDateStr.slice(0, 7) > ist.monthStr) return false;
        } else {
          if (createdDateStr > ist.dateStr) return false;
        }
      }

      const cat = (t.category || '').toLowerCase();
      if (cat === 'daily') return true;
      if (cat === 'weekly') {
        // If specific date given or checking daily view, match day of week (1=Mon..7=Sun)
        if (categoryParam.toLowerCase() === 'weekly') return true;
        return t.dayOfWeek == null || t.dayOfWeek === ist.dayOfWeekIso;
      }
      if (cat === 'monthly') {
        if (categoryParam.toLowerCase() === 'monthly') return true;
        return true;
      }
      return true;
    });

    if (dueTemplates.length === 0) {
      return json({ success: true, data: [], meta: { istDate: ist.dateStr } });
    }

    // Determine period keys to fetch completions
    const dailyKey = ist.dateStr;
    const weeklyKey = ist.dateStr;
    const monthlyKey = ist.monthStr;
    const periodKeys = Array.from(new Set([dailyKey, weeklyKey, monthlyKey]));

    const compSql = `SELECT * FROM recurring_completions WHERE period_key IN (${periodKeys.map(() => '?').join(',')})`;
    const compRes = await env.DB.prepare(compSql).bind(...periodKeys).all<any>();
    const completionMap = new Map<string, any>();
    for (const c of compRes.results) {
      completionMap.set(`${c.template_id}:${c.period_key}`, c);
    }

    const items = dueTemplates.map(t => {
      const cat = (t.category || '').toLowerCase();
      let periodKey = dailyKey;
      let dueDate = ist.dateStr;
      let periodStart: string | null = ist.dateStr;
      let periodEnd: string | null = ist.dateStr;

      if (cat === 'weekly') {
        periodKey = weeklyKey;
        dueDate = ist.dateStr;
      } else if (cat === 'monthly') {
        periodKey = monthlyKey;
        dueDate = (ist as any).endOfMonthStr || `${ist.year}-${ist.month}-30`;
        periodStart = `${ist.year}-${ist.month}-01`;
        periodEnd = dueDate;
      }

      const comp = completionMap.get(`${t.id}:${periodKey}`);
      const completed = Boolean(comp && (comp.status === 'Completed' || comp.status === 'Verified'));
      const isDead = Boolean(comp && comp.status === 'Dead');
      const itemStatus = comp ? comp.status : 'Pending';

      return {
        id: `${t.id}:${periodKey}`,
        taskId: t.id,
        templateId: t.id,
        userId: t.assignedTo,
        userName: t.assignedToName,
        department: t.department,
        description: t.title + (t.description ? ` - ${t.description}` : ''),
        title: t.title,
        notes: t.description,
        category: t.category.charAt(0).toUpperCase() + t.category.slice(1),
        frequency: t.frequency,
        dayOfWeek: t.dayOfWeek,
        dayOfMonth: t.dayOfMonth,
        timeOfDay: t.timeOfDay,
        periodKey,
        periodStart,
        periodEnd,
        dueDate,
        completed,
        completedAt: comp?.completed_at || null,
        isOnTime: comp ? Boolean(comp.is_on_time) : true,
        status: completed ? itemStatus : isDead ? 'Dead' : 'Pending',
        dead: isDead,
        deadAt: isDead ? comp?.completed_at : null,
        remark: comp?.remark || '',
        remarkBy: comp?.remark_by || '',
        label: `${t.category} Task`,
        canComplete: true,
        canManage: true,
      };
    });

    // Also include completed tasks whose template was deleted so past date filters still show them
    const existingIds = new Set(items.map(it => it.taskId));
    for (const c of compRes.results) {
      if (!existingIds.has(c.template_id)) {
        if (categoryParam && categoryParam.toLowerCase() !== 'all' && c.category?.toLowerCase() !== categoryParam.toLowerCase()) continue;
        if (userName && c.user_name?.toLowerCase() !== userName.toLowerCase()) continue;

        items.push({
          id: `${c.template_id}:${c.period_key}`,
          taskId: c.template_id,
          templateId: c.template_id,
          userId: c.uid || '',
          userName: c.user_name || 'Unassigned',
          department: c.department || '',
          description: c.description || c.title || 'Recurring Task (Completed)',
          title: c.title || 'Recurring Task',
          notes: c.description || '',
          category: (c.category ? c.category.charAt(0).toUpperCase() + c.category.slice(1) : 'Daily') as any,
          frequency: c.category || 'Daily',
          dayOfWeek: null,
          dayOfMonth: null,
          timeOfDay: '10:00',
          periodKey: c.period_key,
          periodStart: c.period_key,
          periodEnd: c.period_key,
          dueDate: c.period_key,
          completed: c.status === 'Completed' || c.status === 'Verified',
          completedAt: c.completed_at,
          isOnTime: Boolean(c.is_on_time),
          status: c.status || 'Completed',
          dead: c.status === 'Dead',
          deadAt: c.status === 'Dead' ? c.completed_at : null,
          remark: c.remark || '',
          remarkBy: c.remark_by || '',
          label: `${c.category || 'Recurring'} Task`,
          canComplete: false,
          canManage: true,
        });
      }
    }

    return json({
      success: true,
      data: items,
      meta: {
        istDate: ist.dateStr,
        count: items.length,
      },
    });
  }

  // 6. POST /recurring/completions -> Mark completed, uncomplete, or mark dead/remark
  if (path === '/recurring/completions' && req.method === 'POST') {
    const data = await body<any>(req);
    const templateId = String(data.templateId || data.taskId || '');
    const periodKey = String(data.periodKey || '');
    const action = String(data.action || 'complete');

    if (!templateId || !periodKey) {
      return json({ success: false, error: 'templateId and periodKey are required' }, { status: 400 });
    }

    if (action === 'uncomplete') {
      await env.DB.prepare('DELETE FROM recurring_completions WHERE template_id = ? AND period_key = ?')
        .bind(templateId, periodKey)
        .run();
      return json({ success: true, data: { uncompleted: true, templateId, periodKey } });
    }

    const template = await env.DB.prepare('SELECT * FROM recurring_templates WHERE id = ?').bind(templateId).first<any>();
    const taskRecord = !template && templateId.startsWith('T-')
      ? await env.DB.prepare('SELECT * FROM tasks_current WHERE task_id = ?').bind(templateId).first<any>()
      : null;

    const now = nowIso();
    const id = data.id || randomId('comp_');
    const title = String(data.title || template?.title || taskRecord?.description?.split('\n')[0] || 'Recurring Task');
    const description = String(data.description || template?.description || taskRecord?.description || title);
    const department = String(data.department || template?.department || taskRecord?.department || '');
    const uid = String(data.uid || template?.assigned_to || taskRecord?.assigned_to || '');
    const userName = String(data.userName || template?.assigned_to_name || taskRecord?.assigned_to_name || '');
    const category = String(data.category || template?.category || taskRecord?.category || 'Daily');
    const isVerify = Boolean(data.isAdmin || data.action === 'verify' || data.status === 'Verified');
    const status = action === 'dead' ? 'Dead' : isVerify ? 'Verified' : 'Completed';
    const remark = data.remark ? String(data.remark).trim() : null;
    const remarkBy = data.remarkBy ? String(data.remarkBy).trim() : null;

    // Check if on time (IST comparison)
    const ist = getIstDateParts();
    let completedAtDate = now;
    if (periodKey.match(/^\d{4}-\d{2}-\d{2}$/) && periodKey < ist.dateStr) {
      completedAtDate = `${periodKey}T18:00:00+05:30`;
    }

    let isOnTime = 1;
    if (category.toLowerCase() === 'daily' || category.toLowerCase() === 'weekly') {
      if (periodKey < ist.dateStr) isOnTime = 1; // Admin marking past completion is credited for that date
    } else if (category.toLowerCase() === 'monthly') {
      if (periodKey < ist.monthStr) isOnTime = 1;
    }

    // Delete existing completion for this template + periodKey if any
    await env.DB.prepare('DELETE FROM recurring_completions WHERE template_id = ? AND period_key = ?')
      .bind(templateId, periodKey)
      .run();

    await env.DB.prepare(
      `INSERT INTO recurring_completions (
        id, template_id, title, description, department, uid, user_name, category, period_key,
        completed_at, is_on_time, status, remark, remark_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, templateId, title, description, department, uid, userName, category, periodKey,
      completedAtDate, isOnTime, status, remark, remarkBy, now
    ).run();

    return json({
      success: true,
      data: {
        id,
        templateId,
        uid,
        userName,
        category,
        periodKey,
        completedAt: now,
        isOnTime: Boolean(isOnTime),
        status,
        remark,
        remarkBy,
      },
    }, { status: 201 });
  }

  // 7. GET /recurring/mis-counts -> Aggregates planned, done, onTime counts for MIS
  if (path === '/recurring/mis-counts' && req.method === 'GET') {
    const weekStart = url.searchParams.get('weekStart');
    const weekEnd = url.searchParams.get('weekEnd');

    if (!weekStart || !weekEnd) {
      return json({ success: false, error: 'weekStart and weekEnd are required' }, { status: 400 });
    }

    // Generate list of dates in the week
    const dates: string[] = [];
    let cur = new Date(`${weekStart}T12:00:00Z`);
    const end = new Date(`${weekEnd}T12:00:00Z`);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur = new Date(cur.getTime() + 86_400_000);
    }

    // Fetch all active templates
    const templatesRes = await env.DB.prepare('SELECT * FROM recurring_templates WHERE is_active = 1').all<any>();
    const templates = templatesRes.results
      .map(recurringTemplateFromRow)
      .filter((t): t is NonNullable<ReturnType<typeof recurringTemplateFromRow>> => t !== null);

    // Fetch completions in this week
    const allPeriodKeys = [...dates, weekStart.slice(0, 7)];
    const compSql = `SELECT * FROM recurring_completions WHERE period_key IN (${allPeriodKeys.map(() => '?').join(',')})`;
    const compRes = await env.DB.prepare(compSql).bind(...allPeriodKeys).all<any>();
    const completions = compRes.results;

    // Map: userName -> { planned, done, onTime, department, byCategory: { office: {}, salon: {}, weekly: {} } }
    const byName: Record<string, {
      name: string;
      department: string;
      planned: number;
      done: number;
      onTime: number;
      byCategory: Record<string, { planned: number; done: number; onTime: number }>;
    }> = {};

    const ensureUser = (name: string, dept = '') => {
      const k = name.trim().toLowerCase();
      if (!byName[k]) {
        byName[k] = {
          name,
          department: dept,
          planned: 0,
          done: 0,
          onTime: 0,
          byCategory: {
            office: { planned: 0, done: 0, onTime: 0 },
            salon: { planned: 0, done: 0, onTime: 0 },
            weekly: { planned: 0, done: 0, onTime: 0 },
          },
        };
      }
      if (!byName[k].department && dept) byName[k].department = dept;
      return byName[k];
    };


    // 1. Calculate planned instances across each day of the week
    for (const dStr of dates) {
      const ist = getIstPartsForDateStr(dStr);
      for (const t of templates) {
        if (!t || !t.assignedToName) continue;
        // Do not plan instances before the template was created
        const createdDateStr = (t.createdAt || '').slice(0, 10);
        if (createdDateStr && createdDateStr > dStr) continue;

        const cat = (t.category || '').toLowerCase();
        let catKey = 'office';
        if (t.department && t.department.toLowerCase().includes('salon')) catKey = 'salon';
        if (cat === 'weekly' || cat === 'monthly') catKey = 'weekly';

        let isDueToday = false;
        if (cat === 'daily') {
          isDueToday = true;
        } else if (cat === 'weekly') {
          isDueToday = t.dayOfWeek == null || t.dayOfWeek === ist.dayOfWeekIso;
        }

        if (isDueToday) {
          const userRec = ensureUser(t.assignedToName, t.department);
          userRec.planned += 1;
          userRec.byCategory[catKey].planned += 1;
        }
      }
    }

    // Monthly tasks planned once per month if month start falls in week
    const monthKey = weekStart.slice(0, 7);
    for (const t of templates) {
      if (!t || !t.assignedToName) continue;
      const createdDateStr = (t.createdAt || '').slice(0, 10);
      if (createdDateStr && createdDateStr.slice(0, 7) > monthKey) continue;

      const cat = (t.category || '').toLowerCase();
      if (cat === 'monthly') {
        const userRec = ensureUser(t.assignedToName, t.department);
        userRec.planned += 1;
        userRec.byCategory.weekly.planned += 1;
      }
    }

    // 2. Count completions
    for (const c of completions) {
      if (c.status !== 'Completed' && c.status !== 'Verified') continue;
      const userRec = ensureUser(c.user_name, c.department || '');
      userRec.done += 1;
      if (c.is_on_time) userRec.onTime += 1;

      let catKey = 'office';
      const cat = (c.category || '').toLowerCase();
      if (c.department && c.department.toLowerCase().includes('salon')) catKey = 'salon';
      if (cat === 'weekly' || cat === 'monthly') catKey = 'weekly';
      userRec.byCategory[catKey].done += 1;
      if (c.is_on_time) userRec.byCategory[catKey].onTime += 1;
    }

    // Ensure planned >= done for each user/category even if a template was deleted mid-week
    for (const userRec of Object.values(byName)) {
      if (userRec.planned < userRec.done) userRec.planned = userRec.done;
      for (const catObj of Object.values(userRec.byCategory)) {
        if (catObj.planned < catObj.done) catObj.planned = catObj.done;
      }
    }

    return json({
      success: true,
      data: {
        weekStart,
        weekEnd,
        byName,
      },
    });
  }

  return null;
}

export default {
  async fetch(req: Request, env: Env) {
    const wrappedEnv: Env = { ...env, DB: wrapDb(env.DB) };
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(wrappedEnv) });

    const authRoute = await routeAuth(req, wrappedEnv, url.pathname);
    if (authRoute) return new Response(authRoute.body, { status: authRoute.status, headers: { ...Object.fromEntries(authRoute.headers), ...corsHeaders(wrappedEnv) } });

    if (!requireSecret(req, wrappedEnv)) return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: corsHeaders(wrappedEnv) });

    const response =
      await routeUsers(req, wrappedEnv, url) ||
      await routeDepartments(req, wrappedEnv, url) ||
      await routeTasks(req, wrappedEnv, url) ||
      await routeScores(req, wrappedEnv, url) ||
      await routeRevisions(req, wrappedEnv, url) ||
      await routeCrm(req, wrappedEnv, url) ||
      await routeAutomations(req, wrappedEnv, url) ||
      await routeMis(req, wrappedEnv, url) ||
      await routeRecurring(req, wrappedEnv, url) ||
      await routeChecklist(req, wrappedEnv, url) ||
      json({ success: false, error: 'Not found' }, { status: 404 });
    return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...corsHeaders(wrappedEnv) } });
  },
};
