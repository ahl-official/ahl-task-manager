import { routeLifecycle } from './lifecycle.js';
import { routeReadOptimizations, aggregatePeriods, getCachedRead, cacheRead, invalidateReadCache, adjustTaskCount } from './read-optimizations.js';
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../lib/utils/names.ts
function normalizePersonName(value) {
  let s = String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  s = s.replace(/\b(sir|mam|ma'am|g|j|hr|ahl)\b/gi, "").trim().replace(/\s+/g, " ");
  return s;
}
__name(normalizePersonName, "normalizePersonName");

// ../lib/mis/weeklyOff.ts
var SALON_DAILY_DOERS = /* @__PURE__ */ new Set([
  "aditi",
  "anita",
  "aparna",
  "arantxa",
  "azhar",
  "bindu",
  "daizy",
  "divya",
  "elma",
  "gauri",
  "jagruti",
  "jaieza",
  "jitu",
  "khushi",
  "mehjabeen",
  "mohit",
  "niddhi",
  "ninsi",
  "parth",
  "pooja",
  "rahul",
  "rahul singh",
  "ramesh",
  "sejal",
  "susmita",
  "tuba",
  "vishakha"
]);
function isSalonDailyDoer(name) {
  const key = normalizePersonName(name);
  return Boolean(key && SALON_DAILY_DOERS.has(key));
}
__name(isSalonDailyDoer, "isSalonDailyDoer");
function isoWeekday(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return 0;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}
__name(isoWeekday, "isoWeekday");
function isDailyWeeklyOff(dateStr, personName) {
  return isoWeekday(dateStr) === 1 && isSalonDailyDoer(personName);
}
__name(isDailyWeeklyOff, "isDailyWeeklyOff");

// ../lib/mis/periodMaterialize.ts
function weekStartMonday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  const iso = dow === 0 ? 7 : dow;
  dt.setUTCDate(dt.getUTCDate() - (iso - 1));
  return dt.toISOString().slice(0, 10);
}
__name(weekStartMonday, "weekStartMonday");
function monthBounds(monthKey) {
  const [ys, ms] = monthKey.split("-");
  const year = Number(ys);
  const month = Number(ms);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    lastDay,
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, "0")}`
  };
}
__name(monthBounds, "monthBounds");
function eachDateInRange(start, end) {
  const out = [];
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const cur = new Date(Date.UTC(ys, ms - 1, ds, 12, 0, 0));
  const last = new Date(Date.UTC(ye, me - 1, de, 12, 0, 0));
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
__name(eachDateInRange, "eachDateInRange");
function buildMonthPeriodRows(template, monthKey) {
  const cat = String(template.category || "Daily");
  const catLower = cat.toLowerCase();
  const { start: monthStart, end: monthEnd } = monthBounds(monthKey);
  const explicitStart = String(
    template.startDate ||
    template.dueDate ||
    template.metadata?.startDate ||
    template.metadata?.dueDate ||
    ""
  ).slice(0, 10);
  const created = String(template.createdAt || "").slice(0, 10);
  const effectiveStart = explicitStart || created;
  const fromDate = effectiveStart && effectiveStart > monthStart ? effectiveStart : monthStart;
  const base = {
    templateId: template.id,
    monthKey,
    category: cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase(),
    title: String(template.title || template.description || "Recurring Task").trim(),
    description: String(template.description || template.title || "").trim(),
    assignedTo: String(template.assignedTo || ""),
    assignedToName: String(template.assignedToName || "Unassigned"),
    department: String(template.department || "")
  };
  if (fromDate > monthEnd) return [];
  if (catLower === "daily") {
    return eachDateInRange(fromDate, monthEnd).filter((d) => !isDailyWeeklyOff(d, template.assignedToName)).map((d) => ({
      ...base,
      periodKey: d,
      dueDate: d,
      periodStart: d,
      periodEnd: d
    }));
  }
  if (catLower === "weekly") {
    const dueDow = template.dayOfWeek != null && template.dayOfWeek >= 1 && template.dayOfWeek <= 7 ? Number(template.dayOfWeek) : 5;
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    for (const d of eachDateInRange(monthStart, monthEnd)) {
      const [y, m, day] = d.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
      const dow = dt.getUTCDay();
      const iso = dow === 0 ? 7 : dow;
      if (iso !== dueDow) continue;
      if (d < fromDate) continue;
      const periodKey = weekStartMonday(d);
      if (seen.has(periodKey)) continue;
      seen.add(periodKey);
      const weekEnd = (() => {
        const mon = /* @__PURE__ */ new Date(`${periodKey}T12:00:00Z`);
        mon.setUTCDate(mon.getUTCDate() + 6);
        return mon.toISOString().slice(0, 10);
      })();
      rows.push({
        ...base,
        periodKey,
        dueDate: d,
        periodStart: periodKey,
        periodEnd: weekEnd
      });
    }
    return rows;
  }
  if (catLower === "monthly") {
    if (effectiveStart && effectiveStart.slice(0, 7) > monthKey) return [];
    const dueDay = template.dayOfMonth != null && template.dayOfMonth >= 1 ? Math.min(Number(template.dayOfMonth), monthBounds(monthKey).lastDay) : monthBounds(monthKey).lastDay;
    const dueDate = `${monthKey}-${String(dueDay).padStart(2, "0")}`;
    if (effectiveStart && effectiveStart > dueDate) return [];
    return [{
      ...base,
      periodKey: monthKey,
      dueDate,
      periodStart: monthStart,
      periodEnd: monthEnd
    }];
  }
  return [];
}
__name(buildMonthPeriodRows, "buildMonthPeriodRows");
function periodRowId(templateId, periodKey) {
  return `${templateId}:${periodKey}`;
}
__name(periodRowId, "periodRowId");

// worker/src/index.ts
var JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
var ACTIVE_STATUSES = ["Pending Accept", "In Progress", "Delay Requested", "Overdue"];
var DROPPED_LOG_TYPES = /* @__PURE__ */ new Set(["WEBHOOK_RAW"]);
function json(data, init = {}) {
  return new Response(JSON.stringify(data), { ...init, headers: { ...JSON_HEADERS, ...init.headers ?? {} } });
}
__name(json, "json");
function safeBinds(values) {
  return values.map((v) => v === void 0 ? null : v);
}
__name(safeBinds, "safeBinds");
function wrapDb(db) {
  if (!db || typeof db.prepare !== "function") return db;
  return {
    prepare(query) {
      const stmt = db.prepare(query);
      return {
        bind(...values) {
          return stmt.bind(...safeBinds(values));
        },
        first() {
          return stmt.first();
        },
        all() {
          return stmt.all();
        },
        run() {
          return stmt.run();
        }
      };
    },
    batch(statements) {
      return db.batch(statements);
    }
  };
}
__name(wrapDb, "wrapDb");
function normalizeWa(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("91") && digits.length >= 12) return digits;
  const last10 = digits.slice(-10);
  if (last10.length === 10) return `91${last10}`;
  return digits;
}
__name(normalizeWa, "normalizeWa");
function waLast10(raw) {
  return normalizeWa(raw).slice(-10);
}
__name(waLast10, "waLast10");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function randomId(prefix = "") {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(randomId, "randomId");
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function corsHeaders(env) {
  return {
    "access-control-allow-origin": env.APP_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  };
}
__name(corsHeaders, "corsHeaders");
function requireSecret(req, env) {
  const expected = env.API_SHARED_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !!expected && got === expected;
}
__name(requireSecret, "requireSecret");
async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
__name(body, "body");
function userFromRow(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    name: row.name,
    rawName: row.raw_name || "",
    email: row.email || "",
    waNumber: row.wa_number,
    waNumberLast10: row.wa_number_last10,
    role: row.role || "member",
    department: row.department || "",
    isActive: row.is_active !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(userFromRow, "userFromRow");
function taskFromRow(row) {
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
    handoffWa: row.handoff_wa || "",
    category: row.category,
    priority: row.priority,
    status: row.status,
    department: row.department || "",
    startDate: row.start_date,
    endDate: row.end_date,
    delayedDate: row.delayed_date,
    delayReason: row.delay_reason,
    revisionStatus: row.revision_status || "none",
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
    monthKey: row.month_key
  };
}
__name(taskFromRow, "taskFromRow");
function scoreFromRow(row) {
  return {
    uid: row.uid,
    name: row.name,
    department: row.department || "",
    waNumber: row.wa_number || "",
    tasksAssigned: row.tasks_assigned || 0,
    tasksCompleted: row.tasks_completed || 0,
    onTimeCount: row.on_time_count || 0,
    lateCount: row.late_count || 0,
    monthlyScore: row.monthly_score || 0,
    lastUpdated: row.last_updated
  };
}
__name(scoreFromRow, "scoreFromRow");
function departmentFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(departmentFromRow, "departmentFromRow");
function revisionFromRow(row) {
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
    createdAt: row.created_at
  };
}
__name(revisionFromRow, "revisionFromRow");
function crmLeadFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name || row.name || "",
    contactName: row.contact_name || row.name || "",
    phone: row.phone || "",
    email: row.email || null,
    source: row.source || "Manual",
    stage: row.stage || row.status || "New",
    ownerUid: row.owner_uid || "",
    ownerName: row.owner_name || "",
    notes: row.notes || null,
    nextFollowUp: row.next_follow_up || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(crmLeadFromRow, "crmLeadFromRow");
function automationFromRow(row) {
  if (!row) return null;
  const config = JSON.parse(row.config_json || "{}");
  return {
    id: row.id,
    name: row.name,
    trigger: config.trigger || row.type || "Task Overdue",
    action: config.action || "Notify Admin",
    target: config.target || "",
    messageTemplate: config.messageTemplate || "",
    isActive: row.is_active !== 0,
    createdBy: config.createdBy || "",
    createdByName: config.createdByName || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(automationFromRow, "automationFromRow");
async function sendWhatsApp(env, to, message) {
  const base = env.WAHA_URL?.replace(/\/$/, "");
  const session = env.WAHA_SESSION;
  if (!base) return { ok: false, error: "WAHA_URL is not configured" };
  const res = await fetch(`${base}/api/sendText`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...env.WAHA_API_KEY ? { "X-Api-Key": env.WAHA_API_KEY } : {}
    },
    body: JSON.stringify({
      session,
      chatId: `${normalizeWa(to)}@c.us`,
      text: message
    })
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  return { ok: true };
}
__name(sendWhatsApp, "sendWhatsApp");
async function log(env, type, message, opts = {}) {
  if (DROPPED_LOG_TYPES.has(type)) return;
  if (type === "SEND_WA" && /^Sent to\b/.test(message)) return;
  if (type === "REMINDER" && /\bsent\b/i.test(message)) return;
  await env.DB.prepare(
    "INSERT INTO logs (id, type, task_id, uid, message, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(randomId("log_"), type, opts.taskId || null, opts.uid || null, message, JSON.stringify(opts.meta || {}), nowIso()).run();
}
__name(log, "log");
async function routeAuth(req, env, path) {
  if (path === "/auth/login" && req.method === "POST") {
    const data = await body(req);
    const last10 = waLast10(data.waNumber);
    if (last10.length !== 10) return json({ success: false, error: "WhatsApp number required" }, { status: 400 });
    const row = await env.DB.prepare("SELECT * FROM users WHERE wa_number_last10 = ? AND is_active = 1 LIMIT 1").bind(last10).first();
    const user = userFromRow(row);
    if (!user) return json({ success: false, error: "User not found or inactive" }, { status: 401 });
    let random;
    do { random=crypto.getRandomValues(new Uint32Array(1))[0]; } while(random >= 4294800000);
    const otp=String(100000+random%900000);
    const sessionId = randomId("otp_");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1e3).toISOString();
    await env.DB.prepare("INSERT INTO otp_sessions (id, uid, otp_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(sessionId, user.uid, await sha256(`${sessionId}:${otp}`), expiresAt, nowIso()).run();
    const sent = await sendWhatsApp(env, user.waNumber, `Your AHL Task Manager OTP is ${otp}. It expires in 10 minutes.`);
    if (!sent.ok) return json({ success: false, error: "OTP could not be sent on WhatsApp. Please ask admin to check the WAHA session." }, { status: 502 });
    await log(env, "INBOUND_WA", `OTP login requested: ${user.name}`, { uid: user.uid });
    return json({ success: true, data: { sessionId, expiresAt } });
  }
  if (path === "/auth/verify-otp" && req.method === "POST") {
    const data = await body(req);
    const sessionId = String(data.sessionId || "");
    const otp = String(data.otp || "").replace(/\D/g, "");
    if (!sessionId || otp.length !== 6) return json({ success: false, error: "OTP session and code are required" }, { status: 400 });
    const session = await env.DB.prepare("SELECT * FROM otp_sessions WHERE id = ? LIMIT 1").bind(sessionId).first();
    if (!session || session.used_at) return json({ success: false, error: "OTP session expired or already used" }, { status: 401 });
    if (new Date(session.expires_at).getTime() < Date.now()) return json({ success: false, error: "OTP expired" }, { status: 401 });
    if (session.otp_hash !== await sha256(`${sessionId}:${otp}`)) return json({ success: false, error: "Invalid OTP" }, { status: 401 });
    const user = userFromRow(await env.DB.prepare("SELECT * FROM users WHERE uid = ? AND is_active = 1 LIMIT 1").bind(session.uid).first());
    if (!user) return json({ success: false, error: "User not found or inactive" }, { status: 401 });
    await env.DB.prepare("UPDATE otp_sessions SET used_at = ? WHERE id = ?").bind(nowIso(), sessionId).run();
    await log(env, "INBOUND_WA", `OTP login verified: ${user.name}`, { uid: user.uid });
    return json({ success: true, data: { user } });
  }
  return null;
}
__name(routeAuth, "routeAuth");
async function routeUsers(req, env, url) {
  if (url.pathname === "/users" && req.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM users ORDER BY name LIMIT 200").all();
    return json({ success: true, data: rows.results.map(userFromRow) });
  }
  if (url.pathname === "/users/by-wa" && req.method === "GET") {
    const user = userFromRow(await env.DB.prepare("SELECT * FROM users WHERE wa_number_last10 = ? AND is_active = 1 LIMIT 1").bind(waLast10(url.searchParams.get("wa"))).first());
    return json({ success: true, data: user });
  }
  if (url.pathname === "/users/by-uid" && req.method === "GET") {
    const user = userFromRow(await env.DB.prepare("SELECT * FROM users WHERE uid = ? LIMIT 1").bind(url.searchParams.get("uid")).first());
    return json({ success: true, data: user });
  }
  if (url.pathname === "/users" && req.method === "POST") {
    const data = await body(req);
    const uid = data.uid || randomId("user_");
    const wa = normalizeWa(data.waNumber);
    const now = nowIso();
    await env.DB.prepare(
      "INSERT INTO users (uid, name, raw_name, email, wa_number, wa_number_last10, role, department, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
    ).bind(uid, data.name || "", data.rawName || "", data.email || "", wa, waLast10(wa), data.role || "member", data.department || "", now, now).run();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO scores (uid, name, department, wa_number, tasks_assigned, tasks_completed, on_time_count, late_count, monthly_score, last_updated) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, ?)"
    ).bind(uid, data.name || "", data.department || "", wa, now).run();
    return json({ success: true, data: { uid } }, { status: 201 });
  }
  if (url.pathname === "/users" && req.method === "PATCH") {
    const data = await body(req);
    if (!data.uid) return json({ success: false, error: "User id is required" }, { status: 400 });
    const current = userFromRow(await env.DB.prepare("SELECT * FROM users WHERE uid = ? LIMIT 1").bind(data.uid).first());
    if (!current) return json({ success: false, error: "User not found" }, { status: 404 });
    const wa = data.waNumber ? normalizeWa(data.waNumber) : current.waNumber;
    await env.DB.prepare("UPDATE users SET name = ?, wa_number = ?, wa_number_last10 = ?, role = ?, department = ?, is_active = ?, updated_at = ? WHERE uid = ?").bind(data.name ?? current.name, wa, waLast10(wa), data.role ?? current.role, data.department ?? current.department, data.isActive === false ? 0 : 1, nowIso(), data.uid).run();
    await env.DB.prepare("UPDATE scores SET name = ?, department = ?, wa_number = ?, last_updated = ? WHERE uid = ?").bind(data.name ?? current.name, data.department ?? current.department, wa, nowIso(), data.uid).run();
    return json({ success: true, data: userFromRow(await env.DB.prepare("SELECT * FROM users WHERE uid = ?").bind(data.uid).first()) });
  }
  if (url.pathname === "/users" && req.method === "DELETE") {
    const uid = url.searchParams.get("uid");
    if (!uid) return json({ success: false, error: "User id is required" }, { status: 400 });
    await env.DB.batch([
      env.DB.prepare("DELETE FROM tasks_current WHERE assigned_to = ?").bind(uid),
      env.DB.prepare("DELETE FROM scores WHERE uid = ?").bind(uid),
      env.DB.prepare("DELETE FROM users WHERE uid = ?").bind(uid)
    ]);
    await env.DB.prepare("DELETE FROM task_counts_summary WHERE assigned_to = ?").bind(uid).run();
    return json({ success: true });
  }
  return null;
}
__name(routeUsers, "routeUsers");
async function routeDepartments(req, env, url) {
  if (url.pathname === "/departments" && req.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM departments WHERE is_active = 1 ORDER BY name LIMIT 100").all();
    return json({ success: true, data: rows.results.map(departmentFromRow) });
  }
  if (url.pathname === "/departments" && req.method === "POST") {
    const data = await body(req);
    const name = String(data.name || "").trim().replace(/\s+/g, " ");
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const now = nowIso();
    await env.DB.prepare("INSERT INTO departments (id, name, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").bind(id, name, now, now).run();
    return json({ success: true, data: { id, name, isActive: true, createdAt: now, updatedAt: now } }, { status: 201 });
  }
  if (url.pathname === "/departments" && req.method === "DELETE") {
    if (url.searchParams.get("all") === "true") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM departments"),
        env.DB.prepare("UPDATE users SET department = '', updated_at = ?").bind(nowIso())
      ]);
      return json({ success: true });
    }
    const id = url.searchParams.get("id");
    if (!id) return json({ success: false, error: "Department id is required" }, { status: 400 });
    const dep = await env.DB.prepare("SELECT * FROM departments WHERE id = ?").bind(id).first();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM departments WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE users SET department = '', updated_at = ? WHERE department = ?").bind(nowIso(), dep?.name || "")
    ]);
    return json({ success: true });
  }
  return null;
}
__name(routeDepartments, "routeDepartments");
async function nextTaskId(env) {
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO task_counters (id, current_value) VALUES ('tasks', 0)").run();
    // Fast path: if task_counters has an established sequence (> 0), atomically increment by 1 (1 row read, 1 row written, 0 table scans)
    const row2 = await env.DB.prepare(
      `UPDATE task_counters
       SET current_value = current_value + 1
       WHERE id = 'tasks' AND current_value > 0
       RETURNING current_value`
    ).first();
    if (row2?.current_value) {
      return `T-${String(row2.current_value).padStart(4, "0")}`;
    }
    // Cold start initialization: only runs if counter is 0. Inspect latest task using index (LIMIT 1)
    const row = await env.DB.prepare(
      "SELECT task_id FROM tasks_current WHERE task_id LIKE 'T-%' ORDER BY created_at DESC LIMIT 1"
    ).first();
    let nextNum = 1;
    if (row?.task_id) {
      const match = row.task_id.match(/T-(\d+)/i);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }
    await env.DB.prepare("UPDATE task_counters SET current_value = ? WHERE id = 'tasks'").bind(nextNum).run();
    return `T-${String(nextNum).padStart(4, "0")}`;
  } catch {
  }
  return `T-${Date.now().toString().slice(-4)}`;
}
__name(nextTaskId, "nextTaskId");
function periodFields(dateValue) {
  let date = dateValue ? new Date(dateValue) : /* @__PURE__ */ new Date();
  if (isNaN(date.getTime())) {
    date = /* @__PURE__ */ new Date();
  }
  const dayKey = date.toISOString().slice(0, 10);
  const monthKey = date.toISOString().slice(0, 7);
  return { dayKey, monthKey };
}
__name(periodFields, "periodFields");

// --- Backend MIS auto-recompute (delegation bucket) -------------------------------
// Keeps mis_weekly's CURRENT week row for one assignee fresh the moment a One Time
// task write changes their completion state, so the frontend only ever reads the DB
// (cheap) instead of recomputing scores on every page view. Scoped by assigned_to
// (indexed: idx_tasks_assignee_created), so this is an index seek, not a table scan.
// Checklist/FMS buckets are preserved from the last stored snapshot — this task write
// can only have changed the delegation bucket, and FMS comes from an external sheet
// that isn't re-read on every task write.
function addDaysKeyUtc(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
__name(addDaysKeyUtc, "addDaysKeyUtc");
function currentMisWeekPeriod() {
  const todayKey = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const [y, m, d] = todayKey.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  const daysSinceWednesday = (day - 3 + 7) % 7;
  const weekStart = addDaysKeyUtc(todayKey, -daysSinceWednesday);
  const weekEnd = addDaysKeyUtc(weekStart, 6);
  const year = Number(weekStart.slice(0, 4));
  const jan1 = `${year}-01-01`;
  const jan1Dow = new Date(Date.UTC(year, 0, 1, 12, 0, 0)).getUTCDay();
  const firstWeekStart = addDaysKeyUtc(jan1, -((jan1Dow - 3 + 7) % 7));
  const weekNumber = Math.floor((Date.UTC(...weekStart.split("-").map(Number).map((v, i) => i === 1 ? v - 1 : v)) - Date.UTC(...firstWeekStart.split("-").map(Number).map((v, i) => i === 1 ? v - 1 : v))) / (7 * 86400000)) + 1;
  const weekEndDate = new Date(Date.UTC(...weekEnd.split("-").map(Number).map((v, i) => i === 1 ? v - 1 : v), 12));
  const monthName = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", month: "long" }).format(weekEndDate);
  return { weekKey: `${year}-W${String(weekNumber).padStart(2, "0")}`, weekStart, weekEnd, weekNumber, monthName, year: Number(weekEnd.slice(0, 4)) };
}
__name(currentMisWeekPeriod, "currentMisWeekPeriod");
function gapPercentCalc(done, planned) {
  if (!Number.isFinite(done) || !Number.isFinite(planned) || planned <= 0) return null;
  const value = done / planned * 100 - 100;
  return Math.round(value * 100) / 100;
}
__name(gapPercentCalc, "gapPercentCalc");
async function refreshDelegationMisSnapshot(env, uid) {
  if (!uid) return;
  try {
    const week = currentMisWeekPeriod();
    const final = "date(COALESCE(NULLIF(t.delayed_date,''),NULLIF(t.end_date,''),NULLIF(t.start_date,''),NULLIF(t.completed_at,'')),'+5 hours','+30 minutes')";
    const first = "date(t.start_date,'+5 hours','+30 minutes')";
    const revised = "date(COALESCE(NULLIF(t.delayed_date,''),NULLIF(t.end_date,'')),'+5 hours','+30 minutes')";
    const done = "t.status NOT IN ('Pending','Shifted')";
    const row = await env.DB.prepare(
      `SELECT COALESCE(NULLIF(u.name,''),t.assigned_to_name) AS name,COALESCE(NULLIF(u.department,''),t.department) AS department,u.wa_number AS waNumber,
        COUNT(*) AS planned,SUM(CASE WHEN ${done} THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN ${done} AND NOT (t.status IN ('Completed','Verified') AND COALESCE(${first}<${revised},0)) THEN 1 ELSE 0 END) AS onTime
       FROM tasks_current t LEFT JOIN users u ON u.uid=t.assigned_to
       WHERE t.assigned_to=? AND LOWER(COALESCE(t.category,'')) NOT IN ('daily','weekly','monthly') AND ${final}>=? AND ${final}<=?
       GROUP BY t.assigned_to`
    ).bind(uid, week.weekStart, week.weekEnd).first();
    const name = row?.name || (await env.DB.prepare("SELECT name FROM users WHERE uid=?").bind(uid).first())?.name || uid;
    const delegation = { planned: Number(row?.planned || 0), done: Number(row?.done || 0), onTime: Number(row?.onTime || 0) };
    const id = `${week.weekKey}_${normalizePersonName(name).replace(/\s+/g, "-") || "unknown"}`;
    const existing = await env.DB.prepare("SELECT checklist_json, fms_json FROM mis_weekly WHERE id=?").bind(id).first();
    const emptyBucket = { planned: 0, done: 0, onTime: 0 };
    const checklist = existing?.checklist_json ? JSON.parse(existing.checklist_json) : emptyBucket;
    const fms = existing?.fms_json ? JSON.parse(existing.fms_json) : emptyBucket;
    const totalPlanned = checklist.planned + delegation.planned + fms.planned;
    const totalDone = checklist.done + delegation.done + fms.done;
    const totalOnTime = checklist.onTime + delegation.onTime + fms.onTime;
    const gapPercent = gapPercentCalc(totalDone, totalPlanned);
    const onTimeGapPercent = gapPercentCalc(totalOnTime, totalDone);
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO mis_weekly (
        id, uid, name, department, wa_number,
        checklist_json, delegation_json, fms_json,
        planned, done, on_time, gap_percent, gap_decimal, on_time_gap_percent,
        week_key, week_start, week_end, week_number, month_name, year, combined_week,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        uid = excluded.uid, name = excluded.name, department = excluded.department, wa_number = excluded.wa_number,
        delegation_json = excluded.delegation_json,
        planned = excluded.planned, done = excluded.done, on_time = excluded.on_time,
        gap_percent = excluded.gap_percent, gap_decimal = excluded.gap_decimal, on_time_gap_percent = excluded.on_time_gap_percent,
        updated_at = excluded.updated_at`
    ).bind(
      id, uid, name, row?.department || "", row?.waNumber || "",
      JSON.stringify(checklist), JSON.stringify(delegation), JSON.stringify(fms),
      totalPlanned, totalDone, totalOnTime,
      gapPercent, gapPercent == null ? null : gapPercent / 100, onTimeGapPercent,
      week.weekKey, week.weekStart, week.weekEnd, week.weekNumber, week.monthName, week.year,
      `${week.weekStart} - ${week.weekEnd}`,
      now, now
    ).run();
  } catch (err) {
    console.error("refreshDelegationMisSnapshot failed:", err?.message || err);
  }
}
__name(refreshDelegationMisSnapshot, "refreshDelegationMisSnapshot");
async function routeTasks(req, env, url) {
  if (url.pathname === "/tasks" && req.method === "GET") {
    const scope = url.searchParams.get("scope") || "all";
    const uid = url.searchParams.get("uid");
    const status = url.searchParams.get("status");
    const department = url.searchParams.get("department");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitParam) || 100, 1), 100);
    const clauses = [];
    const binds = [];
    if (scope === "mine" && uid) {
      clauses.push("assigned_to = ?");
      binds.push(uid);
    }
    if (scope === "handoff" && uid) {
      clauses.push("handoff_uid = ?");
      binds.push(uid);
    }
    if (status) {
      if (status === "open") {
        const placeholders = ACTIVE_STATUSES.map(() => "?").join(",");
        clauses.push(`status IN (${placeholders})`);
        binds.push(...ACTIVE_STATUSES);
      } else if (status === "Completed") {
        clauses.push("status IN ('Completed', 'Verified')");
      } else if (status !== "all") {
        clauses.push("status = ?");
        binds.push(status);
      }
    } else if (url.searchParams.get("includeCompleted") !== "true") {
      // By default when fetching tasks, ONLY fetch open tasks (saves quota and only loads active tasks)
      const placeholders = ACTIVE_STATUSES.map(() => "?").join(",");
      clauses.push(`status IN (${placeholders})`);
      binds.push(...ACTIVE_STATUSES);
    }
    if (department) {
      clauses.push("department = ?");
      binds.push(department);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limitClause = "LIMIT ?";
    const orderClause = status === "Completed" ? "ORDER BY COALESCE(completed_at, updated_at, created_at) DESC, created_at DESC, task_id DESC" : "ORDER BY created_at DESC, task_id DESC";
    const rows = await env.DB.prepare(`SELECT * FROM tasks_current ${where} ${orderClause} ${limitClause}`).bind(...binds, limit).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }
  if (url.pathname === "/tasks/active" && req.method === "GET") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 1000);
    const placeholders = ACTIVE_STATUSES.map(() => "?").join(",");
    const rows = await env.DB.prepare(`SELECT * FROM tasks_current WHERE status IN (${placeholders}) ORDER BY created_at DESC, task_id DESC LIMIT ?`).bind(...ACTIVE_STATUSES, limit).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }
  if (url.pathname === "/tasks/overdue" && req.method === "GET") {
    const now = nowIso();
    const rows = await env.DB.prepare("SELECT * FROM tasks_current WHERE status IN ('Pending Accept', 'In Progress') AND end_date IS NOT NULL AND end_date < ? ORDER BY end_date ASC LIMIT 100").bind(now).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }
  if (url.pathname === "/tasks/due-within" && req.method === "GET") {
    const hours = Math.min(Math.max(Number(url.searchParams.get("hours") || 24), 1), 720);
    const from = nowIso();
    const to = new Date(Date.now() + hours * 60 * 60 * 1e3).toISOString();
    const rows = await env.DB.prepare("SELECT * FROM tasks_current WHERE status IN ('Pending Accept', 'In Progress') AND end_date IS NOT NULL AND end_date >= ? AND end_date <= ? ORDER BY end_date ASC LIMIT 100").bind(from, to).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }
  if (url.pathname === "/tasks/by-ids" && req.method === "GET") {
    const ids = [...new Set(url.searchParams.getAll("id").filter(Boolean))].slice(0, 100);
    if (!ids.length) return json({ success: true, data: [] });
    const rows = await env.DB.prepare(`SELECT * FROM tasks_current WHERE task_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }
  if (url.pathname === "/tasks/calendar" && req.method === "GET") {
    const department = url.searchParams.get("department") || "";
    const month = url.searchParams.get("month") || "";
    if (!department || !/^\d{4}-\d{2}$/.test(month)) return json({ success: false, error: "Department and month are required" }, { status: 400 });
    const start = `${month}-01`;
    const next = new Date(`${start}T00:00:00.000Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const end = next.toISOString().slice(0, 10);
    const rows = await env.DB.prepare("SELECT * FROM tasks_current WHERE department=? AND ((delayed_date>=? AND delayed_date<?) OR ((delayed_date IS NULL OR delayed_date='') AND end_date>=? AND end_date<?)) ORDER BY COALESCE(delayed_date,end_date),task_id LIMIT 150").bind(department,start,end,start,end).all();
    return json({ success: true, data: rows.results.map(taskFromRow) });
  }
  if (url.pathname === "/tasks/next-id" && req.method === "GET") {
    const taskId = await nextTaskId(env);
    return json({ success: true, taskId });
  }
  if (url.pathname.startsWith("/tasks/") && req.method === "GET") {
    const id = decodeURIComponent(url.pathname.slice("/tasks/".length));
    const task = taskFromRow(await env.DB.prepare("SELECT * FROM tasks_current WHERE task_id = ? LIMIT 1").bind(id).first());
    return task ? json({ success: true, data: task }) : json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (url.pathname === "/tasks" && req.method === "POST") {
    try {
      const data = await body(req);
      let creator = data.creatorFallback || null;
      let assignee = data.assigneeFallback || null;
      let handoff = creator;
      try {
        if (!creator && data.creatorUid) creator = userFromRow(await env.DB.prepare("SELECT * FROM users WHERE uid = ?").bind(data.creatorUid).first());
      } catch {}
      try {
        if (!assignee && data.assignedTo) assignee = userFromRow(await env.DB.prepare("SELECT * FROM users WHERE uid = ?").bind(data.assignedTo).first());
      } catch {}
      try {
        if (data.handoffUid) handoff = userFromRow(await env.DB.prepare("SELECT * FROM users WHERE uid = ?").bind(data.handoffUid).first()) || creator;
      } catch {}

      const assigneeUid = assignee?.uid || data.assignedTo;
      if (!assigneeUid) return json({ success: false, error: "Selected assignee was not found" }, { status: 400 });
      const assigneeName = assignee?.name || data.assignedToName || "Assigned User";
      const assigneeWa = assignee?.waNumber || data.assignedToWa || "";
      const assigneeDept = assignee?.department || data.department || "";

      const creatorUid = creator?.uid || data.creatorUid || "admin";
      const creatorName = creator?.name || data.creatorFallback?.name || "Admin";

      const handoffUid = handoff?.uid || data.handoffUid || creatorUid;
      const handoffName = handoff?.name || creatorName;
      const handoffWa = handoff?.waNumber || "";

      const taskId = await nextTaskId(env);
      const now = nowIso();
      const startDateVal = data.startDate && String(data.startDate).trim() ? data.startDate : null;
      const endDateVal = data.endDate && String(data.endDate).trim() ? data.endDate : null;
      const createdAt = data.createdAt || now;
      const pf = periodFields(endDateVal || startDateVal || now);
      const status = data.skipAcceptance ? "In Progress" : data.status || "Pending Accept";

      await env.DB.prepare(
        `INSERT INTO tasks_current (task_id, description, assigned_to, assigned_to_name, assigned_to_wa, created_by, created_by_name, handoff_uid, handoff_name, handoff_wa, category, priority, status, department, start_date, end_date, delayed_date, delay_reason, revision_status, notes, accepted_at, completed_at, verified_at, created_at, updated_at, day_key, month_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'none', ?, ?, NULL, NULL, ?, ?, ?, ?)`
      ).bind(taskId, data.description || "", assigneeUid, assigneeName, assigneeWa, creatorUid, creatorName, handoffUid, handoffName, handoffWa, data.category || "One Time", data.priority || "Medium", status, assigneeDept, startDateVal, endDateVal, data.notes || null, data.skipAcceptance ? now : null, createdAt, now, pf.dayKey, pf.monthKey).run();

      await log(env, "TASK_CREATED", `Task ${taskId} created`, { taskId, uid: creatorUid }).catch(() => {});
      await adjustTaskCount(env, null, { assigned_to: assigneeUid, department: assigneeDept, status }).catch(() => {});
      if (!["daily", "weekly", "monthly"].includes(String(data.category || "One Time").toLowerCase())) {
        await refreshDelegationMisSnapshot(env, assigneeUid).catch(() => {});
      }

      // Return constructed task in memory without requiring an extra DB SELECT read (saves quota and works even if read limits are hit)
      const createdTask = {
        taskId,
        description: data.description || "",
        assignedTo: assigneeUid,
        assignedToName: assigneeName,
        assignedToWa: assigneeWa,
        createdBy: creatorUid,
        createdByName: creatorName,
        handoffUid,
        handoffName,
        handoffWa,
        category: data.category || "One Time",
        priority: data.priority || "Medium",
        status,
        department: assigneeDept,
        startDate: startDateVal,
        endDate: endDateVal,
        delayedDate: null,
        delayReason: null,
        revisionStatus: "none",
        notes: data.notes || null,
        acceptedAt: data.skipAcceptance ? now : null,
        completedAt: null,
        verifiedAt: null,
        createdAt,
        updatedAt: now,
        dayKey: pf.dayKey,
        monthKey: pf.monthKey,
      };
      return json({ success: true, data: createdTask }, { status: 201 });
    } catch (err) {
      console.error("POST /tasks worker error:", err);
      return json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
  }
  if (url.pathname === "/sheet-sync/candidates" && req.method === "GET") {
    const kind = url.searchParams.get("kind") || "delegation";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 1000, 1), 1000);
    const after = url.searchParams.get("after") || "";

    if (kind === "delegation") {
      const open = ["Pending", "Pending Accept", "In Progress", "Delay Requested", "Overdue"];
      const placeholders = open.map(() => "?").join(",");
      const clauses = [
        `LOWER(COALESCE(category,'One Time')) NOT IN ('daily', 'weekly', 'monthly')`,
        `status IN (${placeholders})`
      ];
      const binds = [...open];
      if (after) {
        clauses.push("task_id > ?");
        binds.push(after);
      }
      binds.push(limit);
      const rows = await env.DB.prepare(
        `SELECT task_id, description, assigned_to, assigned_to_name, status, end_date, delayed_date, updated_at
         FROM tasks_current
         WHERE ${clauses.join(" AND ")}
         ORDER BY task_id ASC
         LIMIT ?`
      ).bind(...binds).all();
      return json({ success: true, data: rows.results || [] });
    }

    if (kind === "recurring-period") {
      const open = ["Pending", "Pending Accept", "In Progress", "Delay Requested", "Overdue"];
      const placeholders = open.map(() => "?").join(",");
      const clauses = [
        "is_deleted = 0",
        `status IN (${placeholders})`
      ];
      const binds = [...open];
      if (after) {
        clauses.push("id > ?");
        binds.push(after);
      }
      binds.push(limit);
      const rows = await env.DB.prepare(
        `SELECT id, template_id, period_key, category, title, description, assigned_to, assigned_to_name, department, due_date, status, updated_at
         FROM recurring_period_rows
         WHERE ${clauses.join(" AND ")}
         ORDER BY id ASC
         LIMIT ?`
      ).bind(...binds).all();
      return json({ success: true, data: rows.results || [] });
    }

    if (kind === "recurring-legacy") {
      const open = ["Pending", "Pending Accept", "In Progress", "Delay Requested", "Overdue"];
      const placeholders = open.map(() => "?").join(",");
      const clauses = [
        `LOWER(category) IN ('daily', 'weekly', 'monthly')`,
        `status IN (${placeholders})`
      ];
      const binds = [...open];
      if (after) {
        clauses.push("task_id > ?");
        binds.push(after);
      }
      binds.push(limit);
      const rows = await env.DB.prepare(
        `SELECT task_id, description, assigned_to, assigned_to_name, department, category, status, end_date, start_date, updated_at
         FROM tasks_current
         WHERE ${clauses.join(" AND ")}
         ORDER BY task_id ASC
         LIMIT ?`
      ).bind(...binds).all();
      return json({ success: true, data: rows.results || [] });
    }

    return json({ success: true, data: [] });
  }
  if (url.pathname === "/sheet-sync/recurring-history" && req.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT DISTINCT category, assigned_to_name, title, description
       FROM recurring_period_rows
       WHERE is_deleted = 0
       LIMIT 5000`
    ).all();
    return json({ success: true, data: rows.results || [] });
  }
  if (url.pathname === "/sheet-sync/delegation-batch" && req.method === "PATCH") {
    const data = await body(req);
    const items = data.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 25 || items.some(item =>
      !item || typeof item.taskId !== "string" || !item.taskId ||
      typeof item.assignedTo !== "string" || !item.assignedTo ||
      typeof item.expectedUpdatedAt !== "string" ||
      (item.status !== undefined && !["Completed", "Verified", "Dead"].includes(item.status)) ||
      (item.endDate !== undefined && !/^\d{4}-\d{2}-\d{2}T12:00:00\+05:30$/.test(item.endDate)) ||
      (item.status === undefined && item.endDate === undefined)
    )) return json({ success: false, error: "Invalid delegation sync batch" }, { status: 400 });
    const open = new Set(["Pending", "Pending Accept", "In Progress", "Delay Requested", "Overdue"]);
    const affectedUsers = new Set();
    let updated = 0, skipped = 0;
    for (const item of items) {
      const existing = await env.DB.prepare("SELECT * FROM tasks_current WHERE task_id=?").bind(item.taskId).first();
      if (!existing || !open.has(existing.status) || existing.assigned_to !== item.assignedTo ||
          ["daily", "weekly", "monthly"].includes(String(existing.category || "").toLowerCase()) ||
          String(existing.updated_at || "") !== item.expectedUpdatedAt) { skipped++; continue; }
      const nextStatus = item.status || existing.status;
      const nextEndDate = item.endDate || existing.end_date;
      if (nextStatus === existing.status && nextEndDate === existing.end_date) { skipped++; continue; }
      const now = nowIso();
      const period = item.endDate ? periodFields(item.endDate) : { dayKey: existing.day_key, monthKey: existing.month_key };
      const completed = nextStatus === "Completed" || nextStatus === "Verified";
      const completedAt = completed ? (existing.completed_at || now) : existing.completed_at;
      const verifiedAt = nextStatus === "Verified" ? (existing.verified_at || now) : existing.verified_at;
      const acceptedAt = completed ? (existing.accepted_at || now) : existing.accepted_at;
      const result = await env.DB.prepare(
        "UPDATE tasks_current SET status=?,end_date=?,completed_at=?,verified_at=?,accepted_at=?,day_key=?,month_key=?,updated_at=? WHERE task_id=? AND status=? AND COALESCE(updated_at,'')=?"
      ).bind(nextStatus, nextEndDate, completedAt, verifiedAt, acceptedAt, period.dayKey, period.monthKey, now, item.taskId, existing.status, item.expectedUpdatedAt).run();
      if (!result.meta?.changes) { skipped++; continue; }
      updated++;
      if (nextStatus !== existing.status) await adjustTaskCount(env, existing, { ...existing, status: nextStatus });
      if (existing.assigned_to && completed && existing.status !== "Completed" && existing.status !== "Verified") {
        const todayStr = getIstDateParts().dateStr;
        const dueStr = (existing.delayed_date || existing.end_date || "").slice(0, 10);
        const onTime = !dueStr || todayStr <= dueStr;
        await env.DB.prepare(
          `UPDATE scores
           SET tasks_completed = tasks_completed + 1,
               on_time_count = on_time_count + ?,
               late_count = late_count + ?,
               monthly_score = CASE WHEN tasks_assigned > 0 THEN ROUND(((on_time_count + ?) * 100.0) / tasks_assigned) ELSE 0 END,
               last_updated = ?
           WHERE uid = ?`
        ).bind(onTime ? 1 : 0, onTime ? 0 : 1, onTime ? 1 : 0, now, existing.assigned_to).run().catch(() => {});
      }
      if (existing.assigned_to) affectedUsers.add(existing.assigned_to);
    }
    for (const uid of affectedUsers) await refreshDelegationMisSnapshot(env, uid);
    return json({ success: true, data: { updated, skipped } });
  }
  if (url.pathname.startsWith("/tasks/") && req.method === "PATCH") {
    try {
      const id = decodeURIComponent(url.pathname.slice("/tasks/".length));
      const data = await body(req);
      const existing = await env.DB.prepare("SELECT * FROM tasks_current WHERE task_id = ?").bind(id).first();
      const recurring = ["daily", "weekly", "monthly"].includes(String(existing?.category || "").toLowerCase());
      const closing = ["completed", "verified"].includes(String(data.status || "").toLowerCase());
      if (recurring && closing) {
        delete data.status;
        delete data.completedAt;
        delete data.verifiedAt;
      }
      const updates = ["updated_at = ?"];
      const binds = [nowIso()];
      for (const [field, column] of [
        ["status", "status"],
        ["priority", "priority"],
        ["startDate", "start_date"],
        ["endDate", "end_date"],
        ["delayedDate", "delayed_date"],
        ["delayReason", "delay_reason"],
        ["revisionStatus", "revision_status"],
        ["notes", "notes"],
        ["acceptedAt", "accepted_at"],
        ["completedAt", "completed_at"],
        ["verifiedAt", "verified_at"],
        ["handoffUid", "handoff_uid"],
        ["handoffName", "handoff_name"],
        ["category", "category"],
        ["handoffWa", "handoff_wa"],
        ["newTaskId", "task_id"]
      ]) {
        if (data[field] === null) {
          updates.push(`${column} = NULL`);
        } else if (data[field] !== void 0) {
          updates.push(`${column} = ?`);
          binds.push(data[field]);
        }
      }
      binds.push(id);
      await env.DB.prepare(`UPDATE tasks_current SET ${updates.join(", ")} WHERE task_id = ?`).bind(...binds).run();
      const updatedRow = await env.DB.prepare("SELECT * FROM tasks_current WHERE task_id = ?").bind(id).first();
      await adjustTaskCount(env, existing, updatedRow);
      if (data.scoreIncrement?.uid && data.scoreIncrement?.field) {
        const col = data.scoreIncrement.field === "tasksCompleted" ? "tasks_completed" : data.scoreIncrement.field === "onTimeCount" ? "on_time_count" : data.scoreIncrement.field === "lateCount" ? "late_count" : "tasks_assigned";
        await env.DB.prepare(`UPDATE scores SET ${col} = ${col} + 1, last_updated = ? WHERE uid = ?`).bind(nowIso(), data.scoreIncrement.uid).run();
      }
      if (!recurring && existing?.assigned_to) {
        await refreshDelegationMisSnapshot(env, existing.assigned_to);
      }
      return json({ success: true, data: taskFromRow(updatedRow) });
    } catch (err) {
      return json({ success: false, error: err.stack || err.message || String(err) }, { status: 500 });
    }
  }
  if (url.pathname.startsWith("/tasks/") && req.method === "DELETE") {
    try {
      const id = decodeURIComponent(url.pathname.slice("/tasks/".length));
      const existing = await env.DB.prepare("SELECT * FROM tasks_current WHERE task_id = ? LIMIT 1").bind(id).first();
      if (!existing) return json({ success: false, error: "Not found" }, { status: 404 });
      await env.DB.batch([
        env.DB.prepare("DELETE FROM revisions WHERE task_id = ?").bind(id),
        env.DB.prepare("DELETE FROM tasks_current WHERE task_id = ?").bind(id)
      ]);
      await adjustTaskCount(env, existing, null);
      try {
        await log(env, "TASK_DELETED", `Task ${id} deleted`, { taskId: id });
      } catch {
      }
      if (!["daily", "weekly", "monthly"].includes(String(existing.category || "").toLowerCase()) && existing.assigned_to) {
        await refreshDelegationMisSnapshot(env, existing.assigned_to);
      }
      return json({ success: true, data: { taskId: id, deleted: true } });
    } catch (err) {
      return json({ success: false, error: err.message || String(err) }, { status: 500 });
    }
  }
  return null;
}
__name(routeTasks, "routeTasks");
async function routeScores(req, env, url) {
  if (url.pathname === "/scores" && req.method === "GET") {
    const uid = url.searchParams.get("uid");
    if (uid) {
      const row = await env.DB.prepare("SELECT * FROM scores WHERE uid = ?").bind(uid).first();
      return json({ success: true, data: row ? scoreFromRow(row) : null });
    }
    const rows = await env.DB.prepare("SELECT * FROM scores ORDER BY monthly_score DESC").all();
    return json({ success: true, data: rows.results.map(scoreFromRow) });
  }
  if (url.pathname === "/logs" && req.method === "POST") {
    const data = await body(req);
    await log(env, data.type || "WEBHOOK_RAW", data.message || "", data);
    return json({ success: true });
  }
  if (url.pathname === "/scores/increment" && req.method === "POST") {
    const data = await body(req);
    const fields = [...data.fields ?? [], ...data.field ? [data.field] : []];
    if (!data.uid || fields.length === 0) return json({ success: false, error: "uid and field(s) are required" }, { status: 400 });
    const counts = {
      tasksAssigned: fields.filter((field) => field === "tasksAssigned").length,
      tasksCompleted: fields.filter((field) => field === "tasksCompleted").length,
      onTimeCount: fields.filter((field) => field === "onTimeCount").length,
      lateCount: fields.filter((field) => field === "lateCount").length
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
      data.uid
    ).run();
    return json({ success: true });
  }
  return null;
}
__name(routeScores, "routeScores");
async function routeRevisions(req, env, url) {
  if (url.pathname === "/revisions" && req.method === "GET") {
    const status = url.searchParams.get("status");
    const taskId = url.searchParams.get("taskId");
    const requestedBy = url.searchParams.get("requestedBy");
    const handoffUid = url.searchParams.get("handoffUid");
    const visibleForUid = url.searchParams.get("visibleForUid");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 100);
    if (handoffUid) {
      const clauses2 = ["t.handoff_uid = ?"];
      const binds2 = [handoffUid];
      if (status) {
        clauses2.push("r.status = ?");
        binds2.push(status);
      }
      const rows2 = await env.DB.prepare(
        `SELECT r.* FROM revisions r
         JOIN tasks_current t ON t.task_id = r.task_id
         WHERE ${clauses2.join(" AND ")}
         ORDER BY r.created_at DESC LIMIT ?`
      ).bind(...binds2, limit).all();
      return json({ success: true, data: rows2.results.map(revisionFromRow) });
    }
    if (visibleForUid) {
      const clauses2 = ["(r.requested_by = ? OR t.handoff_uid = ?)"];
      const binds2 = [visibleForUid, visibleForUid];
      if (status) {
        clauses2.push("r.status = ?");
        binds2.push(status);
      }
      const rows2 = await env.DB.prepare(
        `SELECT r.* FROM revisions r
         LEFT JOIN tasks_current t ON t.task_id = r.task_id
         WHERE ${clauses2.join(" AND ")}
         ORDER BY r.created_at DESC LIMIT ?`
      ).bind(...binds2, limit).all();
      return json({ success: true, data: rows2.results.map(revisionFromRow) });
    }
    const clauses = [];
    const binds = [];
    if (status) {
      clauses.push("status = ?");
      binds.push(status);
    }
    if (taskId) {
      clauses.push("task_id = ?");
      binds.push(taskId);
    }
    if (requestedBy) {
      clauses.push("requested_by = ?");
      binds.push(requestedBy);
    }
    const department=url.searchParams.get('department');
    if(department){clauses.push('task_id IN (SELECT task_id FROM tasks_current WHERE department=?)');binds.push(department);}
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await env.DB.prepare(`SELECT * FROM revisions ${where} ORDER BY created_at DESC LIMIT ?`).bind(...binds, limit).all();
    return json({ success: true, data: rows.results.map(revisionFromRow) });
  }
  if (url.pathname === "/revisions" && req.method === "POST") {
    const data = await body(req);
    const id = randomId("rev_");
    const now = nowIso();
    const taskId = data.taskId || "";
    const type = data.type || "delay";
    await env.DB.prepare(
      "INSERT INTO revisions (id, task_id, requested_by, requested_by_name, requested_date, reason, status, decided_by, decided_by_name, decided_at, created_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)"
    ).bind(id, taskId, data.requestedBy || "", data.requestedByName || "", data.requestedDate || now, data.reason || "", "pending", now, type).run();
    if (taskId) {
      if (type === "dead") {
        await env.DB.prepare(
          "UPDATE tasks_current SET revision_status = 'requested', delay_reason = ?, status = 'Dead Requested', updated_at = ? WHERE task_id = ?"
        ).bind(data.reason || null, now, taskId).run();
      } else {
        const requestedDateStr = (data.requestedDate || '').slice(0, 10);
        await env.DB.prepare(
          "UPDATE tasks_current SET revision_status = 'requested', delayed_date = ?, delay_reason = ?, status = CASE WHEN status = 'In Progress' THEN 'Delay Requested' ELSE status END, updated_at = ?"
        ).bind(requestedDateStr || null, data.reason || null, now, taskId).run();
      }
    }
    return json({ success: true, data: revisionFromRow(await env.DB.prepare("SELECT * FROM revisions WHERE id = ?").bind(id).first()) }, { status: 201 });
  }
  if (url.pathname === "/revisions" && req.method === "PATCH") {
    const data = await body(req);
    if (!data.revisionId) return json({ success: false, error: "revisionId is required" }, { status: 400 });
    const decision = data.decision || "approved";
    const now = nowIso();
    const revRow = await env.DB.prepare("SELECT * FROM revisions WHERE id = ?").bind(data.revisionId).first();
    if (!revRow) return json({ success: false, error: "Revision not found" }, { status: 404 });

    const isDead = revRow.type === "dead";
    if (isDead && data.actorRole !== "admin") {
      return json({ success: false, error: "Only admin can approve or reject dead task requests" }, { status: 403 });
    }

    await env.DB.prepare("UPDATE revisions SET status = ?, decided_by = ?, decided_by_name = ?, decided_at = ? WHERE id = ?").bind(decision, data.decidedBy || null, data.decidedByName || null, now, data.revisionId).run();

    if (revRow.task_id) {
      if (isDead) {
        if (decision === "approved") {
          await env.DB.prepare(
            "UPDATE tasks_current SET status = 'Dead', revision_status = 'accepted', delay_reason = NULL, updated_at = ? WHERE task_id = ?"
          ).bind(now, revRow.task_id).run();
        } else {
          await env.DB.prepare(
            "UPDATE tasks_current SET status = 'In Progress', revision_status = 'rejected', delay_reason = NULL, updated_at = ? WHERE task_id = ?"
          ).bind(now, revRow.task_id).run();
        }
      } else {
        if (decision === "approved" && revRow.requested_date) {
          const newEndDate = revRow.requested_date.slice(0, 10);
          const dayKey = newEndDate;
          const monthKey = newEndDate.slice(0, 7);
          await env.DB.prepare(
            "UPDATE tasks_current SET end_date = ?, day_key = ?, month_key = ?, revision_status = 'accepted', delayed_date = NULL, delay_reason = NULL, status = CASE WHEN status = 'Delay Requested' THEN 'In Progress' ELSE status END, updated_at = ? WHERE task_id = ?"
          ).bind(newEndDate, dayKey, monthKey, now, revRow.task_id).run();
        } else {
          await env.DB.prepare(
            "UPDATE tasks_current SET revision_status = 'rejected', delayed_date = NULL, delay_reason = NULL, status = CASE WHEN status = 'Delay Requested' THEN 'In Progress' ELSE status END, updated_at = ?"
          ).bind(now, revRow.task_id).run();
        }
      }
    }
    const updated = await env.DB.prepare("SELECT * FROM revisions WHERE id = ?").bind(data.revisionId).first();
    return json({ success: true, data: revisionFromRow(updated) });
  }
  return null;
}
__name(routeRevisions, "routeRevisions");
async function routeCrm(req, env, url) {
  if (url.pathname === "/crm" && req.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM crm_leads ORDER BY updated_at DESC").all();
    return json({ success: true, data: rows.results.map(crmLeadFromRow) });
  }
  if (url.pathname === "/crm" && req.method === "POST") {
    const data = await body(req);
    const id = randomId("crm_");
    const now = nowIso();
    await env.DB.prepare(
      "INSERT INTO crm_leads (id, name, company_name, contact_name, phone, email, source, status, stage, notes, owner_uid, owner_name, next_follow_up, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, data.companyName || data.contactName || "", data.companyName || "", data.contactName || "", normalizeWa(data.phone), data.email || null, data.source || "Manual", data.stage || "New", data.stage || "New", data.notes || null, data.ownerUid || "", data.ownerName || "", data.nextFollowUp || null, now, now).run();
    return json({ success: true, data: crmLeadFromRow(await env.DB.prepare("SELECT * FROM crm_leads WHERE id = ?").bind(id).first()) }, { status: 201 });
  }
  return null;
}
__name(routeCrm, "routeCrm");
async function routeAutomations(req, env, url) {
  if (url.pathname === "/automations" && req.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM automations ORDER BY created_at DESC").all();
    return json({ success: true, data: rows.results.map(automationFromRow) });
  }
  if (url.pathname === "/automations" && req.method === "POST") {
    const data = await body(req);
    const id = randomId("auto_");
    const now = nowIso();
    const config = {
      trigger: data.trigger || "Task Overdue",
      action: data.action || "Notify Admin",
      target: data.target || "",
      messageTemplate: data.messageTemplate || "",
      createdBy: data.createdBy || "",
      createdByName: data.createdByName || ""
    };
    await env.DB.prepare("INSERT INTO automations (id, name, type, is_active, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, data.name || "", data.trigger || "Task Overdue", data.isActive === false ? 0 : 1, JSON.stringify(config), now, now).run();
    return json({ success: true, data: automationFromRow(await env.DB.prepare("SELECT * FROM automations WHERE id = ?").bind(id).first()) }, { status: 201 });
  }
  if (url.pathname === "/automations" && req.method === "PATCH") {
    const data = await body(req);
    if (!data.id) return json({ success: false, error: "id is required" }, { status: 400 });
    await env.DB.prepare("UPDATE automations SET is_active = ?, updated_at = ? WHERE id = ?").bind(data.isActive === false ? 0 : 1, nowIso(), data.id).run();
    return json({ success: true });
  }
  return null;
}
__name(routeAutomations, "routeAutomations");
function parseBucketJson(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      planned: Number(value?.planned ?? 0),
      done: Number(value?.done ?? 0),
      onTime: Number(value?.onTime ?? 0)
    };
  } catch {
    return { planned: 0, done: 0, onTime: 0 };
  }
}
__name(parseBucketJson, "parseBucketJson");
function misWeeklyFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    uid: row.uid || null,
    name: row.name,
    department: row.department || "",
    waNumber: row.wa_number || "",
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
    combinedWeek: row.combined_week || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(misWeeklyFromRow, "misWeeklyFromRow");
function misArchiveFromRow(row) {
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
    createdAt: row.created_at
  };
}
__name(misArchiveFromRow, "misArchiveFromRow");
async function mergeReconciledWeekly(env, rows, url) {
  const records=await env.DB.prepare('SELECT score_json, updated_at FROM mis_reconciled_people WHERE verified=1').all();
  const merged=new Map(rows.map(row=>[row.weekKey+':'+normalizePersonName(row.name),row]));
  const selected=(records.results||[]).filter(record=>{const row=JSON.parse(record.score_json);return ['weekKey','name','year','monthName'].every(field=>{const value=url.searchParams.get(field);if(!value)return true;if(field==='name')return normalizePersonName(row.name)===normalizePersonName(value);if(field==='year')return row.weekEnd.slice(0,4)===value;if(field==='monthName')return new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'Asia/Kolkata'}).format(new Date(row.weekEnd+'T12:00:00Z'))===value;return String(row[field])===value;});});
  for(const record of selected) {
    const row=JSON.parse(record.score_json);
    merged.set(row.weekKey+':'+normalizePersonName(row.name),{...row,id:row.weekKey+'_'+normalizePersonName(row.name).replace(/\s+/g,'-'),weekNumber:Number(row.weekKey.split('W')[1]),monthName:new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'Asia/Kolkata'}).format(new Date(row.weekEnd+'T12:00:00Z')),year:Number(row.weekEnd.slice(0,4)),combinedWeek:row.weekStart+' - '+row.weekEnd,createdAt:'',updatedAt:''});
  }
  let result=Array.from(merged.values());
  if(url.pathname.endsWith('/latest')) {
    const latest=new Map();for(const row of result){const key=normalizePersonName(row.name);if(!latest.has(key)||row.weekStart>latest.get(key).weekStart)latest.set(key,row);}result=Array.from(latest.values());
  }
  for(const field of ['weekKey','year','monthName','name']) {const value=url.searchParams.get(field);if(value)result=result.filter(row=>field==='name'?normalizePersonName(row.name)===normalizePersonName(value):String(row[field])===value);}
  return result.sort((a,b)=>a.weekStart.localeCompare(b.weekStart)||a.name.localeCompare(b.name));
}
async function routeMis(req, env, url) {
  if (url.pathname === '/mis/reconciled' && req.method === 'GET') {
    const weekStart=url.searchParams.get('weekStart'),weekEnd=url.searchParams.get('weekEnd');
    if(!weekStart || !weekEnd) return json({success:false,error:'weekStart and weekEnd required'},{status:400});
    const result=await env.DB.prepare('SELECT score_json FROM mis_reconciled_people WHERE week_start = ? AND week_end = ? AND verified = 1').bind(weekStart,weekEnd).all();
    return json({success:true,data:(result.results||[]).map(record=>JSON.parse(record.score_json))});
  }

  if (url.pathname === "/mis/weekly" && req.method === "GET") {
    const weekKey = url.searchParams.get("weekKey");
    const year = url.searchParams.get("year");
    const monthName = url.searchParams.get("monthName");
    const name = url.searchParams.get("name");
    const clauses = [];
    const binds = [];
    if (weekKey) {
      clauses.push("week_key = ?");
      binds.push(weekKey);
    }
    if (year) {
      clauses.push("year = ?");
      binds.push(Number(year));
    }
    if (monthName) {
      clauses.push("month_name = ?");
      binds.push(monthName);
    }
    if (name) {
      clauses.push("LOWER(name) = ?");
      binds.push(String(name).trim().toLowerCase());
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await env.DB.prepare(
      `SELECT * FROM mis_weekly ${where} ORDER BY week_start ASC, name ASC`
    ).bind(...binds).all();
    return json({ success: true, data: await mergeReconciledWeekly(env, rows.results.map(misWeeklyFromRow), url) });
  }
  if (url.pathname === "/mis/weekly/latest" && req.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM mis_weekly ORDER BY week_start DESC, name ASC").all();
    const latest = /* @__PURE__ */ new Map();
    for (const row of rows.results) {
      const mapped = misWeeklyFromRow(row);
      if (!mapped) continue;
      const key = String(mapped.name || "").trim().toLowerCase();
      const existing = latest.get(key);
      if (!existing || mapped.weekStart > existing.weekStart) latest.set(key, mapped);
    }
    return json({ success: true, data: await mergeReconciledWeekly(env, Array.from(latest.values()), url) });
  }
  if (url.pathname === "/mis/weekly/batch" && req.method === "POST") {
    const data = await body(req);
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length === 0) return json({ success: true, data: { written: 0 } });
    const now = nowIso();
    const statements = [];
    for (const row of rows) {
      const id = String(row.id || "");
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
          row.department || "",
          row.waNumber || "",
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
          row.monthName || "",
          Number(row.year ?? 0),
          row.combinedWeek || "",
          row.createdAt || now,
          row.updatedAt || now
        )
      );
    }
    for (let i = 0; i < statements.length; i += 50) {
      await env.DB.batch(statements.slice(i, i + 50));
    }
    return json({ success: true, data: { written: statements.length } });
  }
  if (url.pathname === "/mis/archive" && req.method === "GET") {
    const weekKey = url.searchParams.get("weekKey");
    const clauses = [];
    const binds = [];
    if (weekKey) {
      clauses.push("week_key = ?");
      binds.push(weekKey);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await env.DB.prepare(
      `SELECT * FROM mis_archive ${where} ORDER BY timestamp DESC LIMIT 2000`
    ).bind(...binds).all();
    return json({ success: true, data: rows.results.map(misArchiveFromRow) });
  }
  if (url.pathname === "/mis/archive/batch" && req.method === "POST") {
    const data = await body(req);
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length === 0) return json({ success: true, data: { written: 0 } });
    const now = nowIso();
    const statements = [];
    for (const row of rows) {
      const id = String(row.id || randomId("misarch_"));
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
          row.weekStart || "",
          row.weekEnd || "",
          row.createdAt || now
        )
      );
    }
    for (let i = 0; i < statements.length; i += 50) {
      await env.DB.batch(statements.slice(i, i + 50));
    }
    return json({ success: true, data: { written: statements.length } });
  }
  return null;
}
__name(routeMis, "routeMis");
async function routeChecklist(req, env, url) {
  if (url.pathname === "/checklist/completions" && req.method === "GET") {
    const uid = url.searchParams.get("uid");
    if (!uid) return json({ success: false, error: "uid is required" }, { status: 400 });
    const taskId = url.searchParams.get("taskId");
    const periodKey = url.searchParams.get("periodKey");
    const periodKeys = url.searchParams.getAll("periodKey");
    const clauses = ["uid = ?"];
    const binds = [uid];
    if (taskId) {
      clauses.push("task_id = ?");
      binds.push(taskId);
    }
    if (periodKeys.length > 1) {
      clauses.push(`period_key IN (${periodKeys.map(() => "?").join(",")})`);
      binds.push(...periodKeys);
    } else if (periodKey) {
      clauses.push("period_key = ?");
      binds.push(periodKey);
    }
    const rows = await env.DB.prepare(`SELECT * FROM checklist_completions WHERE ${clauses.join(" AND ")}`).bind(...binds).all();
    return json({
      success: true,
      data: rows.results.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        uid: row.uid,
        category: row.category,
        periodKey: row.period_key,
        completedAt: row.completed_at
      }))
    });
  }
  if (url.pathname === "/checklist/completions" && req.method === "POST") {
    const data = await body(req);
    const now = nowIso();
    const id = data.id || randomId("chk_");
    await env.DB.prepare("INSERT INTO checklist_completions (id, task_id, uid, category, period_key, completed_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, data.taskId || "", data.uid || "", data.category || "", data.periodKey || "", now).run();
    return json({ success: true, data: { ...data, id, completedAt: now } }, { status: 201 });
  }
  return null;
}
__name(routeChecklist, "routeChecklist");
function recurringTemplateFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description || "",
    assignedTo: row.assigned_to || "",
    assignedToName: row.assigned_to_name || "",
    department: row.department || "",
    frequency: row.frequency || row.category,
    dayOfWeek: row.day_of_week != null ? Number(row.day_of_week) : null,
    dayOfMonth: row.day_of_month != null ? Number(row.day_of_month) : null,
    timeOfDay: row.time_of_day || "10:00",
    isActive: row.is_active !== 0,
    metadata: JSON.parse(row.metadata_json || "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(recurringTemplateFromRow, "recurringTemplateFromRow");
var periodRowsTableReady = false;
async function ensurePeriodRowsTable(env) {
  if (periodRowsTableReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS recurring_period_rows (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      period_key TEXT NOT NULL,
      month_key TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT,
      description TEXT,
      assigned_to TEXT,
      assigned_to_name TEXT,
      department TEXT,
      due_date TEXT,
      period_start TEXT,
      period_end TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      completed_at TEXT,
      is_on_time INTEGER DEFAULT 1,
      remark TEXT,
      remark_by TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      UNIQUE(template_id, period_key)
    )
  `).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_period_rows_month ON recurring_period_rows(month_key, category, is_deleted)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_period_rows_template ON recurring_period_rows(template_id, is_deleted)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_period_rows_user_date ON recurring_period_rows(assigned_to, category, due_date, is_deleted, status)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_period_rows_due ON recurring_period_rows(due_date, category, is_deleted, status)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_period_rows_due_filter ON recurring_period_rows(due_date, is_deleted, status)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_period_rows_month_filter ON recurring_period_rows(month_key, is_deleted, status)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_period_rows_name_due ON recurring_period_rows(assigned_to_name, due_date, is_deleted, status)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks_current(assigned_to, status)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_tasks_status_end ON tasks_current(status, end_date)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks_current(status, created_at)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_tasks_handoff_status ON tasks_current(handoff_uid, status)"
  ).run().catch(() => null);
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_tasks_dept_status ON tasks_current(department, status)"
  ).run().catch(() => null);
  periodRowsTableReady = true;
}
__name(ensurePeriodRowsTable, "ensurePeriodRowsTable");
function periodRowFromDb(row) {
  if (!row) return null;
  const deleted = Number(row.is_deleted) === 1 || String(row.status || "") === "Deleted";
  const status = deleted ? "Deleted" : String(row.status || "Pending");
  const completed = status === "Completed" || status === "Verified";
  return {
    id: row.id,
    templateId: row.template_id,
    taskId: row.template_id,
    periodKey: row.period_key,
    monthKey: row.month_key,
    category: row.category,
    title: row.title || "",
    description: row.description || row.title || "",
    userId: row.assigned_to || "",
    userName: row.assigned_to_name || "Unassigned",
    department: row.department || "",
    dueDate: row.due_date || row.period_key,
    periodStart: row.period_start || row.period_key,
    periodEnd: row.period_end || row.period_key,
    status,
    completed,
    completedAt: row.completed_at || null,
    isOnTime: row.is_on_time !== 0 && row.is_on_time !== false,
    dead: deleted || status === "Dead",
    deadAt: row.deleted_at || null,
    remark: row.remark || "",
    remarkBy: row.remark_by || "",
    isDeleted: deleted,
    label: `${row.category || "Recurring"} Task`
  };
}
__name(periodRowFromDb, "periodRowFromDb");
async function materializeMonthForTemplate(env, template, monthKey) {
  await ensurePeriodRowsTable(env);
  const locks = await env.DB.prepare('SELECT week_start, week_end FROM mis_reconciled_people WHERE name_key = ? AND verified = 1').bind(normalizePersonName(template.assignedToName)).all();
  const specs = buildMonthPeriodRows(template, monthKey).filter(spec => !(locks.results || []).some(lock => spec.dueDate >= lock.week_start && spec.dueDate <= lock.week_end));
  if (specs.length === 0) return { inserted: 0, monthKey };
  const now = nowIso();
  let inserted = 0;
  for (const spec of specs) {
    const id = periodRowId(spec.templateId, spec.periodKey);
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO recurring_period_rows (
          id, template_id, period_key, month_key, category, title, description,
          assigned_to, assigned_to_name, department, due_date, period_start, period_end,
          status, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0, ?, ?)`
      ).bind(
        id,
        spec.templateId,
        spec.periodKey,
        spec.monthKey,
        spec.category,
        spec.title,
        spec.description,
        spec.assignedTo,
        spec.assignedToName,
        spec.department,
        spec.dueDate,
        spec.periodStart,
        spec.periodEnd,
        now,
        now
      ).run();
      inserted += 1;
    } catch {
    }
  }
  return { inserted, monthKey, count: specs.length };
}
__name(materializeMonthForTemplate, "materializeMonthForTemplate");
async function templatesWithPeriodRows(env, templateIds) {
  await ensurePeriodRowsTable(env);
  const found = /* @__PURE__ */ new Set();
  if (templateIds.length === 0) return found;
  for (let i = 0; i < templateIds.length; i += 80) {
    const chunk = templateIds.slice(i, i + 80);
    const sql = `SELECT DISTINCT template_id FROM recurring_period_rows WHERE template_id IN (${chunk.map(() => "?").join(",")})`;
    const res = await env.DB.prepare(sql).bind(...chunk).all();
    for (const row of res.results || []) found.add(String(row.template_id));
  }
  return found;
}
__name(templatesWithPeriodRows, "templatesWithPeriodRows");
async function ensureCurrentMonthRows(env, templates, monthKey) {
  const ids = templates.map((t) => t.id).filter(Boolean);
  const withRows = await templatesWithPeriodRows(env, ids);
  for (const t of templates) {
    if (!withRows.has(t.id)) continue;
    const existing = await env.DB.prepare(
      "SELECT 1 AS ok FROM recurring_period_rows WHERE template_id = ? AND month_key = ? LIMIT 1"
    ).bind(t.id, monthKey).first();
    if (existing) continue;
    await materializeMonthForTemplate(env, t, monthKey);
  }
}
__name(ensureCurrentMonthRows, "ensureCurrentMonthRows");
function getIstDateParts(date = /* @__PURE__ */ new Date()) {
  const istOffsetMs = 5.5 * 60 * 60 * 1e3;
  const istDate = new Date(date.getTime() + istOffsetMs);
  const year = istDate.getUTCFullYear();
  const monthNum = istDate.getUTCMonth() + 1;
  const month = String(monthNum).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  const dayOfWeek = istDate.getUTCDay();
  const dayOfWeekIso = dayOfWeek === 0 ? 7 : dayOfWeek;
  const dateStr = `${year}-${month}-${day}`;
  const monthStr = `${year}-${month}`;
  return { year, monthNum, month, day, dayOfWeek, dayOfWeekIso, dateStr, monthStr };
}
__name(getIstDateParts, "getIstDateParts");
function getIstPartsForDateStr(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return getIstDateParts();
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
  const dayOfWeek = dt.getUTCDay();
  const dayOfWeekIso = dayOfWeek === 0 ? 7 : dayOfWeek;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endOfMonthStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return {
    year: y,
    monthNum: m,
    month: String(m).padStart(2, "0"),
    day: String(d).padStart(2, "0"),
    dayOfWeek,
    dayOfWeekIso,
    dateStr,
    monthStr: `${y}-${String(m).padStart(2, "0")}`,
    endOfMonthStr
  };
}
__name(getIstPartsForDateStr, "getIstPartsForDateStr");
function addDaysDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
__name(addDaysDateStr, "addDaysDateStr");
var OPEN_RECURRING_STATUSES = ["in progress", "pending", "pending accept", "delay requested", "overdue"];
function dateKeyOf(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}
__name(dateKeyOf, "dateKeyOf");
async function resolveRecurringDefinition(env, id) {
  const tmpl = recurringTemplateFromRow(
    await env.DB.prepare("SELECT * FROM recurring_templates WHERE id = ?").bind(id).first()
  );
  if (tmpl) return tmpl;
  const task = await env.DB.prepare("SELECT * FROM tasks_current WHERE task_id = ?").bind(id).first();
  if (!task) return null;
  return taskAsRecurringTemplate(task);
}
__name(resolveRecurringDefinition, "resolveRecurringDefinition");
async function listRecurringDefinitionIds(env, offset, limit) {
  const openStatuses = ["Pending Accept", "In Progress", "Delay Requested", "Overdue"];
  const statusPlaceholders = openStatuses.map(() => "?").join(",");
  const standing = await env.DB.prepare(
    `SELECT task_id AS id FROM tasks_current
     WHERE LOWER(category) IN ('daily', 'weekly', 'monthly')
       AND status IN (${statusPlaceholders})
     ORDER BY task_id ASC
     LIMIT ? OFFSET ?`
  ).bind(...openStatuses, limit, offset).all();
  const ids = (standing.results || []).map((r) => String(r.id)).filter(Boolean);
  if (offset === 0) {
    const templates = await env.DB.prepare(
      `SELECT id FROM recurring_templates WHERE is_active = 1 ORDER BY id ASC LIMIT ?`
    ).bind(limit).all();
    for (const row of templates.results || []) {
      const id = String(row.id || "");
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM tasks_current
     WHERE LOWER(category) IN ('daily', 'weekly', 'monthly')
       AND status IN (${statusPlaceholders})`
  ).bind(...openStatuses).first();
  const total = Number(countRow?.n || 0);
  return { ids, total, nextOffset: offset + (standing.results || []).length, done: offset + (standing.results || []).length >= total };
}
__name(listRecurringDefinitionIds, "listRecurringDefinitionIds");
function taskAsRecurringTemplate(row) {
  const anchor = dateKeyOf(row.end_date) || dateKeyOf(row.start_date);
  let dayOfWeek = null;
  let dayOfMonth = null;
  if (anchor) {
    const [y, m, d] = anchor.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 6, 0, 0));
    const dow = dt.getUTCDay();
    dayOfWeek = dow === 0 ? 7 : dow;
    dayOfMonth = d;
  }
  const category = String(row.category || "Daily");
  const description = String(row.description || "");
  const [firstLine, ...rest] = description.split("\n");
  return {
    id: String(row.task_id || ""),
    category,
    title: firstLine.slice(0, 180) || "Recurring Task",
    description,
    assignedTo: row.assigned_to || "",
    assignedToName: row.assigned_to_name || "",
    department: row.department || "",
    frequency: category,
    dayOfWeek,
    dayOfMonth,
    timeOfDay: "10:00",
    isActive: true,
    metadata: {},
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}
__name(taskAsRecurringTemplate, "taskAsRecurringTemplate");
function recurringTitleKey(row) {
  const title = String(row.description || "").split("\n")[0].toLowerCase().replace(/\s+/g, " ").trim();
  const name = String(row.assigned_to_name || "").trim().toLowerCase();
  const category = String(row.category || "").toLowerCase();
  return `${name}|${category}|${title}`;
}
__name(recurringTitleKey, "recurringTitleKey");
async function loadOpenRecurringTasks(env, category, userName) {
  let query = `SELECT * FROM tasks_current
    WHERE LOWER(category) IN ('daily', 'weekly', 'monthly')
    AND LOWER(status) IN ('in progress','pending','pending accept','delay requested','overdue')`;
  const binds = [];
  if (category && category.toLowerCase() !== "all") {
    query += " AND LOWER(category) = LOWER(?)";
    binds.push(category);
  }
  if (userName) {
    query += " AND LOWER(assigned_to_name) = LOWER(?)";
    binds.push(userName);
  }
  const res = await env.DB.prepare(query).bind(...binds).all();
  const groups = /* @__PURE__ */ new Map();
  for (const row of res.results) {
    const key = recurringTitleKey(row);
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const definitions = [];
  for (const list of groups.values()) {
    const open = list.filter((row) => OPEN_RECURRING_STATUSES.includes(String(row.status || "").toLowerCase()));
    const latestClosed = list.slice().sort((a, b) => {
      const aDate = dateKeyOf(a.end_date) || dateKeyOf(a.start_date) || "";
      const bDate = dateKeyOf(b.end_date) || dateKeyOf(b.start_date) || "";
      return bDate.localeCompare(aDate);
    })[0];
    const primaries = open.length > 0 ? open : [latestClosed];
    const closedIds = list.filter((row) => !open.includes(row)).map((row) => String(row.task_id || "")).filter(Boolean);
    const createdDates = list.map((row) => dateKeyOf(row.created_at) || dateKeyOf(row.start_date)).filter(Boolean).sort();
    primaries.forEach((row, index) => {
      const template = taskAsRecurringTemplate(row);
      if (!template.id) return;
      template.createdAt = createdDates[0] || template.createdAt;
      template.standingStatus = String(row.status || "");
      template.anchorDate = dateKeyOf(row.end_date) || dateKeyOf(row.start_date) || dateKeyOf(row.day_key);
      template.aliasIds = index === 0 ? Array.from(/* @__PURE__ */ new Set([template.id, ...closedIds])) : [template.id];
      definitions.push(template);
    });
  }
  return definitions;
}
__name(loadOpenRecurringTasks, "loadOpenRecurringTasks");
function misCategoryKey(category, department, personName = "") {
  const cat = category.toLowerCase();
  if (cat === "weekly" || cat === "monthly") return "weekly";
  if (cat === "daily" && isSalonDailyDoer(personName)) return "salon";
  if (department.toLowerCase().includes("salon")) return "salon";
  return "office";
}
__name(misCategoryKey, "misCategoryKey");
async function routeRecurring(req, env, url) {
  const path = url.pathname;
  if (path === "/recurring/templates" && req.method === "GET") {
    const category = url.searchParams.get("category");
    const assignedToName = url.searchParams.get("assignedToName");
    const isActive = url.searchParams.get("isActive");
    const clauses = [];
    const binds = [];
    if (category) {
      clauses.push("LOWER(category) = LOWER(?)");
      binds.push(category);
    }
    if (assignedToName) {
      clauses.push("LOWER(assigned_to_name) = LOWER(?)");
      binds.push(assignedToName);
    }
    if (isActive != null && isActive !== "all") {
      clauses.push("is_active = ?");
      binds.push(isActive === "true" || isActive === "1" ? 1 : 0);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const sql = `SELECT * FROM recurring_templates ${where} ORDER BY category ASC, assigned_to_name ASC, created_at DESC`;
    const rows = await env.DB.prepare(sql).bind(...binds).all();
    return json({
      success: true,
      data: rows.results.map(recurringTemplateFromRow)
    });
  }
  if (path === "/recurring/templates" && req.method === "POST") {
    const data = await body(req);
    if (!data.title || !data.assignedToName) {
      return json({ success: false, error: "title and assignedToName are required" }, { status: 400 });
    }
    const now = nowIso();
    const id = (data.id && !String(data.id).startsWith("rec_") && !String(data.id).startsWith("rec_sheet_")) ? String(data.id) : (await nextTaskId(env));
    const category = String(data.category || data.frequency || "Daily");
    const title = String(data.title).trim();
    const description = String(data.description || "").trim();
    const assignedTo = String(data.assignedTo || "");
    const assignedToName = String(data.assignedToName).trim();
    const department = String(data.department || "").trim();
    const frequency = String(data.frequency || category);
    const dayOfWeek = data.dayOfWeek != null ? Number(data.dayOfWeek) : null;
    const dayOfMonth = data.dayOfMonth != null ? Number(data.dayOfMonth) : null;
    const timeOfDay = String(data.timeOfDay || "10:00");
    const isActive = data.isActive === false || data.isActive === 0 ? 0 : 1;
    const metadataJson = JSON.stringify(data.metadata || {});
    await env.DB.prepare(
      `INSERT INTO recurring_templates (
        id, category, title, description, assigned_to, assigned_to_name,
        department, frequency, day_of_week, day_of_month, time_of_day,
        is_active, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      category,
      title,
      description,
      assignedTo,
      assignedToName,
      department,
      frequency,
      dayOfWeek,
      dayOfMonth,
      timeOfDay,
      isActive,
      metadataJson,
      now,
      now
    ).run();
    const created = await env.DB.prepare("SELECT * FROM recurring_templates WHERE id = ?").bind(id).first();
    const template = recurringTemplateFromRow(created);
    const monthKey = getIstDateParts().monthStr;
    const materialized = template ? await materializeMonthForTemplate(env, template, monthKey) : null;
    return json({
      success: true,
      data: template,
      meta: { materialized }
    }, { status: 201 });
  }
  const templateMatch = path.match(/^\/recurring\/templates\/([^/]+)$/);
  if (templateMatch && req.method === "PATCH") {
    const id = templateMatch[1];
    const data = await body(req);
    const now = nowIso();
    const updates = ["updated_at = ?"];
    const binds = [now];
    if (data.title !== void 0) {
      updates.push("title = ?");
      binds.push(String(data.title).trim());
    }
    if (data.description !== void 0) {
      updates.push("description = ?");
      binds.push(String(data.description || "").trim());
    }
    if (data.category !== void 0) {
      updates.push("category = ?");
      binds.push(String(data.category));
    }
    if (data.frequency !== void 0) {
      updates.push("frequency = ?");
      binds.push(String(data.frequency));
    }
    if (data.assignedTo !== void 0) {
      updates.push("assigned_to = ?");
      binds.push(String(data.assignedTo || ""));
    }
    if (data.assignedToName !== void 0) {
      updates.push("assigned_to_name = ?");
      binds.push(String(data.assignedToName).trim());
    }
    if (data.department !== void 0) {
      updates.push("department = ?");
      binds.push(String(data.department || "").trim());
    }
    if (data.dayOfWeek !== void 0) {
      updates.push("day_of_week = ?");
      binds.push(data.dayOfWeek != null ? Number(data.dayOfWeek) : null);
    }
    if (data.dayOfMonth !== void 0) {
      updates.push("day_of_month = ?");
      binds.push(data.dayOfMonth != null ? Number(data.dayOfMonth) : null);
    }
    if (data.timeOfDay !== void 0) {
      updates.push("time_of_day = ?");
      binds.push(String(data.timeOfDay || "10:00"));
    }
    if (data.isActive !== void 0) {
      updates.push("is_active = ?");
      binds.push(data.isActive ? 1 : 0);
    }
    if (data.metadata !== void 0) {
      updates.push("metadata_json = ?");
      binds.push(JSON.stringify(data.metadata));
    }
    binds.push(id);
    await env.DB.prepare(`UPDATE recurring_templates SET ${updates.join(", ")} WHERE id = ?`).bind(...binds).run();
    const updated = await env.DB.prepare("SELECT * FROM recurring_templates WHERE id = ?").bind(id).first();
    return json({ success: true, data: recurringTemplateFromRow(updated) });
  }
  if (templateMatch && req.method === "DELETE") {
    const id = templateMatch[1];
    await ensurePeriodRowsTable(env);
    const today = getIstDateParts().dateStr;
    await env.DB.prepare(
      `DELETE FROM recurring_period_rows
       WHERE template_id = ?
         AND (
           (LOWER(category) = 'monthly' AND period_key >= ?)
           OR (LOWER(category) = 'weekly' AND COALESCE(period_end, due_date, period_key) >= ?)
           OR (LOWER(category) = 'daily' AND period_key >= ?)
           OR (LOWER(category) NOT IN ('daily', 'weekly', 'monthly') AND period_key >= ?)
         )`
    ).bind(id, today.slice(0, 7), today, today, today).run().catch(() => null);
    await env.DB.prepare("DELETE FROM recurring_templates WHERE id = ?").bind(id).run();
    return json({
      success: true,
      data: { deletedId: id, permanent: true, keptPastPeriodRows: true, keptPastCompletions: true }
    });
  }
  if (path === "/recurring/materialize-month" && req.method === "POST") {
    const data = await body(req);
    const monthKey = String(data.monthKey || getIstDateParts().monthStr);
    await ensurePeriodRowsTable(env);
    if (data.templateId) {
      const template = await resolveRecurringDefinition(env, String(data.templateId));
      if (!template) return json({ success: false, error: "Template not found" }, { status: 404 });
      const result = await materializeMonthForTemplate(env, template, monthKey);
      return json({ success: true, data: result });
    }
    const templatesRes = await env.DB.prepare("SELECT * FROM recurring_templates WHERE is_active = 1").all();
    const templates = (templatesRes.results || []).map(recurringTemplateFromRow).filter(Boolean);
    for (const taskTemplate of await loadOpenRecurringTasks(env, null, null)) {
      if (!templates.some((t) => t.id === taskTemplate.id)) {
        templates.push(taskTemplate);
      }
    }
    const onlyExisting = data.onlyExisting !== false;
    const withRows = onlyExisting ? await templatesWithPeriodRows(env, templates.map((t) => t.id)) : new Set(templates.map((t) => t.id));
    let total = 0;
    for (const t of templates) {
      if (!withRows.has(t.id) && onlyExisting) continue;
      if (!onlyExisting || withRows.has(t.id)) {
        const r = await materializeMonthForTemplate(env, t, monthKey);
        total += r.count || 0;
      }
    }
    return json({ success: true, data: { monthKey, templates: withRows.size, periodSlots: total } });
  }
  if (path === "/recurring/fix-rec-ids" && req.method === "POST") {
    const recTemplates = await env.DB.prepare(
      "SELECT id FROM recurring_templates WHERE id LIKE 'rec_%' ORDER BY created_at ASC"
    ).all();
    const results = [];
    for (const row of recTemplates.results || []) {
      const oldId = String(row.id);
      const newId = await nextTaskId(env);
      await env.DB.prepare("UPDATE recurring_templates SET id = ? WHERE id = ?").bind(newId, oldId).run();
      await env.DB.prepare(
        "UPDATE recurring_period_rows SET template_id = ?, id = ? || substr(id, length(?) + 1) WHERE template_id = ?"
      ).bind(newId, newId, oldId, oldId).run().catch(() => null);
      await env.DB.prepare("UPDATE recurring_completions SET template_id = ? WHERE template_id = ?").bind(newId, oldId).run().catch(() => null);
      results.push({ oldId, newId });
    }
    return json({ success: true, count: results.length, migrated: results });
  }
  if (path === "/recurring/migrate-to-period-rows" && req.method === "POST") {
    const data = await body(req);
    await ensurePeriodRowsTable(env);
    const months = Array.isArray(data.months) && data.months.length ? data.months.map((m) => String(m).slice(0, 7)) : [getIstDateParts().monthStr];
    const phase = String(data.phase || "all");
    const dryRun = Boolean(data.dryRun);
    const offset = Math.max(0, Number(data.offset || 0));
    const limit = Math.min(Math.max(Number(data.limit || 40), 1), 80);
    const now = nowIso();
    const summary = {
      phase,
      dryRun,
      months,
      offset,
      limit
    };
    if (phase === "materialize" || phase === "all") {
      const page = data.templateId ? { ids: [String(data.templateId)], total: 1, nextOffset: offset + 1, done: true } : await listRecurringDefinitionIds(env, offset, limit);
      let slots = 0;
      let defs = 0;
      const errors = [];
      for (const id of page.ids) {
        const t = await resolveRecurringDefinition(env, id);
        if (!t) {
          errors.push({ id, monthKey: "", error: "definition not found" });
          defs += 1;
          continue;
        }
        for (const monthKey of months) {
          try {
            if (dryRun) {
              slots += buildMonthPeriodRows(t, monthKey).length;
            } else {
              const r = await materializeMonthForTemplate(env, t, monthKey);
              slots += r.count || 0;
            }
          } catch (err) {
            errors.push({
              id: t.id,
              title: String(t.title || "").slice(0, 80),
              monthKey,
              error: String(err?.message || err)
            });
          }
        }
        defs += 1;
      }
      summary.definitionCount = page.total;
      summary.materialize = {
        definitionsProcessed: defs,
        periodSlots: slots,
        nextOffset: page.nextOffset,
        done: page.done,
        totalDefinitions: page.total,
        errors,
        skipped: errors.map((e) => e.id),
        ids: page.ids
      };
      if (phase === "materialize") {
        return json({ success: true, data: summary });
      }
    }
    const aliasToPrimary = /* @__PURE__ */ new Map();
    if (phase === "apply" || phase === "all") {
      const applyLimit = Math.min(Math.max(Number(data.applyLimit || 300), 1), 500);
      const applyOffset = Math.max(0, Number(data.applyOffset || 0));
      const comps = await env.DB.prepare(
        `SELECT * FROM recurring_completions ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`
      ).bind(applyLimit, applyOffset).all();
      let markedDone = 0;
      let deletedDays = 0;
      let insertedMissing = 0;
      let skipped = 0;
      const deleteIds = [];
      for (const c of comps.results || []) {
        const rawId = String(c.template_id || "");
        const primaryId = aliasToPrimary.get(rawId) || rawId;
        const cat = String(c.category || "Daily");
        const catLower = cat.toLowerCase();
        let periodKey = String(c.period_key || "");
        if (!periodKey) {
          skipped += 1;
          continue;
        }
        if (catLower === "weekly" && /^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
          periodKey = weekStartMonday(periodKey);
        }
        if (catLower === "monthly" && /^\d{4}-\d{2}-\d{2}$/.test(periodKey)) {
          periodKey = periodKey.slice(0, 7);
        }
        const status = String(c.status || "Completed");
        const rowId = periodRowId(primaryId, periodKey);
        const existing = await env.DB.prepare(
          "SELECT id FROM recurring_period_rows WHERE template_id = ? AND period_key = ? LIMIT 1"
        ).bind(primaryId, periodKey).first();
        // Legacy completions are migration input only; never overwrite a period row.
        if (existing) {
          skipped += 1;
          continue;
        }
        if (status === "Dead") {
          deletedDays += 1;
          if (c.id) deleteIds.push(String(c.id));
          continue;
        }
        if (status !== "Completed" && status !== "Verified") {
          skipped += 1;
          continue;
        }
        const monthKey = periodKey.length === 7 ? periodKey : periodKey.slice(0, 7);
        if (!dryRun) {
          await env.DB.prepare(
              `INSERT OR IGNORE INTO recurring_period_rows (
                id, template_id, period_key, month_key, category, title, description,
                assigned_to, assigned_to_name, department, due_date, period_start, period_end,
                status, completed_at, is_on_time, remark, remark_by, is_deleted, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
            ).bind(
              rowId,
              primaryId,
              periodKey,
              monthKey,
              cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase(),
              String(c.title || "Recurring Task"),
              String(c.description || c.title || ""),
              String(c.uid || ""),
              String(c.user_name || "Unassigned"),
              String(c.department || ""),
              catLower === "monthly" ? `${monthKey}-01` : catLower === "weekly" ? String(c.period_key || periodKey) : periodKey,
              periodKey,
              periodKey,
              status,
              c.completed_at || now,
              c.is_on_time === 0 ? 0 : 1,
              c.remark || null,
              c.remark_by || null,
              now,
              now
          ).run().catch(() => null);
        }
        insertedMissing += 1;
        markedDone += 1;
        if (c.id) deleteIds.push(String(c.id));
      }
      if (!dryRun && deleteIds.length && (phase === "apply" || data.deleteAfterApply !== false)) {
      }
      summary.apply = {
        scanned: (comps.results || []).length,
        markedDone,
        deletedDays,
        insertedMissing,
        skipped,
        deleteCandidateCount: deleteIds.length,
        deleteIds: deleteIds.slice(0, 20),
        // sample
        nextApplyOffset: applyOffset + (comps.results || []).length,
        done: (comps.results || []).length < applyLimit,
        // stash ids for delete phase via returning them when applyDelete=true
        ...data.applyDelete ? { deletedNow: 0 } : {}
      };
      if (data.applyDelete && !dryRun && deleteIds.length) {
        let deletedNow = 0;
        for (let i = 0; i < deleteIds.length; i += 50) {
          const chunk = deleteIds.slice(i, i + 50);
          await env.DB.prepare(
            `DELETE FROM recurring_completions WHERE id IN (${chunk.map(() => "?").join(",")})`
          ).bind(...chunk).run();
          deletedNow += chunk.length;
        }
        summary.apply.deletedNow = deletedNow;
      }
      if (phase === "apply") {
        return json({ success: true, data: summary });
      }
    }
    if (phase === "delete" || phase === "all") {
      const delLimit = Math.min(Math.max(Number(data.deleteLimit || 400), 1), 500);
      const comps = await env.DB.prepare(
        `SELECT id, template_id, period_key, category, status FROM recurring_completions LIMIT ?`
      ).bind(delLimit).all();
      const toDelete = [];
      for (const c of comps.results || []) {
        const primaryId = aliasToPrimary.get(String(c.template_id || "")) || String(c.template_id || "");
        let periodKey = String(c.period_key || "");
        const catLower = String(c.category || "").toLowerCase();
        if (catLower === "weekly" && /^\d{4}-\d{2}-\d{2}$/.test(periodKey)) periodKey = weekStartMonday(periodKey);
        if (catLower === "monthly" && /^\d{4}-\d{2}-\d{2}$/.test(periodKey)) periodKey = periodKey.slice(0, 7);
        if (String(c.status) === "Dead") {
          toDelete.push(String(c.id));
          continue;
        }
        const row = await env.DB.prepare(
          `SELECT status FROM recurring_period_rows WHERE template_id = ? AND period_key = ? LIMIT 1`
        ).bind(primaryId, periodKey).first();
        if (row && (row.status === "Completed" || row.status === "Verified")) {
          toDelete.push(String(c.id));
        }
      }
      let deleted = 0;
      if (!dryRun) {
        for (let i = 0; i < toDelete.length; i += 50) {
          const chunk = toDelete.slice(i, i + 50);
          await env.DB.prepare(
            `DELETE FROM recurring_completions WHERE id IN (${chunk.map(() => "?").join(",")})`
          ).bind(...chunk).run();
          deleted += chunk.length;
        }
      }
      summary.delete = {
        scanned: (comps.results || []).length,
        deleted: dryRun ? toDelete.length : deleted,
        done: (comps.results || []).length < delLimit
      };
    }
    return json({ success: true, data: summary });
  }
  if (path === '/recurring/period' && req.method === 'GET') {
    const templateId=url.searchParams.get('templateId'),periodKey=url.searchParams.get('periodKey');
    if(!templateId||!periodKey)return json({success:false,error:'Task and period required'},{status:400});
    const row=await env.DB.prepare('SELECT * FROM recurring_period_rows WHERE template_id=? AND period_key=?').bind(templateId,periodKey).first();
    return row?json({success:true,data:periodRowFromDb(row)}):json({success:false,error:'Checklist period not found'},{status:404});
  }
  if (path === "/recurring/checklist" && req.method === "GET") {
    try {
    const tomorrowStr = addDaysDateStr(getIstDateParts().dateStr, 1);
    const startDate = url.searchParams.get('startDate'), endDate = url.searchParams.get('endDate');
    const category = url.searchParams.get('category') || 'Daily';
    const date = url.searchParams.get('date') || getIstDateParts().dateStr;
    const due="due_date";
    const clauses=["is_deleted=0","status!='Deleted'"],binds=[];
    const paged=url.searchParams.has('limit');
    const scopeUid=url.searchParams.get('scopeUid')||url.searchParams.get('uid');
    const scopeName=url.searchParams.get('scopeName')||url.searchParams.get('userName');
    const scopeDepartment=url.searchParams.get('scopeDepartment');
    if(scopeUid||scopeName||scopeDepartment){
      const scope=[];
      if(scopeUid){scope.push('assigned_to=?');binds.push(scopeUid);}
      if(scopeName){scope.push("(COALESCE(assigned_to,'')='' AND LOWER(assigned_to_name)=LOWER(?))");binds.push(scopeName);}
      if(scopeDepartment){scope.push('department=?');binds.push(scopeDepartment);}
      clauses.push('('+scope.join(' OR ')+')');
    }
    if (startDate && endDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return json({success:false,error:'Invalid date range'},{status:400});
      const cappedEnd = endDate > tomorrowStr ? tomorrowStr : endDate;
      const startMonth = startDate.slice(0, 7), endMonth = cappedEnd.slice(0, 7);
      const months = [startMonth];
      if (endMonth !== startMonth) months.push(endMonth);
      clauses.push('month_key IN ('+months.map(()=>'?').join(',')+')');binds.push(...months);
      clauses.push('due_date>=? AND due_date<=?');binds.push(startDate, cappedEnd);
      const catParam = url.searchParams.get('category');
      if (catParam && catParam.toLowerCase() !== 'all') { clauses.push('category=?'); binds.push(catParam); }
    } else {
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['Daily','Weekly','Monthly','All','all'].includes(category))return json({success:false,error:'Invalid checklist date or category'},{status:400});
      const months=[date.slice(0,7)];
      if(category==='Weekly'){
        const from=weekStartMonday(date),end=new Date(from+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);
        months.splice(0,months.length,from.slice(0,7));
        const endMonth=end.toISOString().slice(0,7);if(endMonth!==months[0])months.push(endMonth);
      }
      clauses.push('month_key IN ('+months.map(()=>'?').join(',')+')');binds.push(...months);
      if(category.toLowerCase()!=='all'){clauses.push('category=?');binds.push(category);}
      const exactDate = url.searchParams.get('exactDate') === 'true';
      if(category==='Weekly'){
        const from=weekStartMonday(date),to=new Date(from+'T12:00:00Z');to.setUTCDate(to.getUTCDate()+6);
        clauses.push('due_date>=? AND due_date<=?');binds.push(from,to.toISOString().slice(0,10));
      } else if(category==='Monthly'){
        clauses.push('month_key=?');binds.push(date.slice(0,7));
      } else if(category==='Daily' || exactDate){
        clauses.push('due_date=?');binds.push(date);
      }
    }
    if(paged){
      const cursor=url.searchParams.get('cursor');
      if(cursor){clauses.push('id>?');binds.push(cursor);}
      const search=String(url.searchParams.get('search')||'').trim().slice(0,100).toLowerCase();
      if(search.length>=2){
        const pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
        clauses.push("(LOWER(template_id) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(title,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(description,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(assigned_to_name,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(department,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(period_key,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(status,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(remark,'')) LIKE ? ESCAPE '\\')");
        binds.push(...Array(8).fill(pattern));
      }
      const requestedLimit=Number(url.searchParams.get('limit'));
      const defaultLimit=['Weekly','Monthly'].includes(category)?300:100;
      const limit=Math.min(300,Math.max(1,requestedLimit||defaultLimit));
      const result=await env.DB.prepare('SELECT * FROM recurring_period_rows WHERE '+clauses.join(' AND ')+' ORDER BY id LIMIT ?').bind(...binds,limit+1).all();
      const found=result.results||[],hasMore=found.length>limit,selected=found.slice(0,limit);
      const items=selected.map(row=>({...periodRowFromDb(row),notes:row.description||'',frequency:row.category,canComplete:!['Completed','Verified'].includes(row.status),canManage:true,source:'period_row'}));
      return json({success:true,data:{items,hasMore,nextCursor:hasMore?selected[selected.length-1].id:null}});
    }
    const result=await env.DB.prepare('SELECT * FROM recurring_period_rows WHERE '+clauses.join(' AND ')+' ORDER BY due_date,id LIMIT 300').bind(...binds).all();
    const data=(result.results||[]).slice(0,300).map(row=>({...periodRowFromDb(row),notes:row.description||'',frequency:row.category,canComplete:!['Completed','Verified'].includes(row.status),canManage:true,source:'period_row'}));
    return json({success:true,data,meta:{istDate:date,count:data.length,hasMore:(result.results||[]).length>=300,readOnly:true}});
    } catch (err) {
      return json({ success: false, error: String(err?.message || err), stack: String(err?.stack || '') }, { status: 500 });
    }
  }
  if (path === "/sheet-sync/period-status" && req.method === "PATCH") {
    const data = await body(req);
    const items = Array.isArray(data.items) ? data.items : [{ id: data.id, status: data.status }];
    if (!items.length || items.length > 100 || items.some(item => !item.id || !["Completed", "Verified", "Dead"].includes(item.status))) {
      return json({ success: false, error: "Invalid sheet period update" }, { status: 400 });
    }
    const now = nowIso();
    const results = await env.DB.batch(items.map(item => {
      const actualDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item.actualDate || '')) ? String(item.actualDate) : null;
      const completed = item.status === 'Completed' || item.status === 'Verified';
      return env.DB.prepare(
        "UPDATE recurring_period_rows SET status=?,completed_at=CASE WHEN ? THEN COALESCE(?,completed_at) ELSE NULL END,is_on_time=COALESCE(?,is_on_time),updated_at=? WHERE id=? AND status NOT IN ('Completed', 'Verified') AND is_deleted=0"
      ).bind(item.status, completed ? 1 : 0, completed && actualDate ? `${actualDate}T12:00:00+05:30` : null, completed && actualDate ? (actualDate <= String(item.dueDate || actualDate) ? 1 : 0) : null, now, String(item.id));
    }));
    return json({ success: true, data: { updated: results.reduce((n, result) => n + Number(result.meta?.changes || 0), 0) } });
  }
  if (path === "/recurring/completions" && req.method === "POST") {
    const data=await body(req),templateId=String(data.templateId||''),periodKey=String(data.periodKey||''),action=String(data.action||'complete');
    if(!templateId||!periodKey||!['complete','verify','uncomplete','skip_day','dead','remark','revive'].includes(action))return json({success:false,error:'Invalid checklist action'},{status:400});
    const row=await env.DB.prepare('SELECT * FROM recurring_period_rows WHERE template_id=? AND period_key=?').bind(templateId,periodKey).first();
    if(!row)return json({success:false,error:'Checklist period not found'},{status:404});
    if((row.is_deleted||row.status==='Deleted')&&!['revive','remark'].includes(action))return json({success:false,error:'Revive this period before changing it'},{status:409});
    const now=nowIso(),deleted=action==='skip_day'||action==='dead';
    const status=deleted?'Deleted':action==='uncomplete'||action==='revive'?'Pending':action==='remark'?row.status:(action==='verify'||data.isAdmin)?'Verified':'Completed';
    const completed=status==='Completed'||status==='Verified';
    const due=String(row.due_date||periodKey).slice(0,10);
    const completedAt=action==='remark'?row.completed_at:completed?(row.completed_at||now):null;
    const onTime=completed?(row.completed_at?row.is_on_time:(due>=getIstDateParts().dateStr?1:0)):row.is_on_time;
    const remark=data.remark===undefined?row.remark:String(data.remark).trim(),remarkBy=data.remarkBy?String(data.remarkBy):row.remark_by;
    // Period rows own checklist state; ordinary status changes leave the indexed
    // is_deleted column untouched and do not duplicate data in recurring_completions.
    const changeDeletion=deleted||action==='revive';
    const sql=changeDeletion
      ? 'UPDATE recurring_period_rows SET status=?,completed_at=?,is_on_time=?,is_deleted=?,deleted_at=?,remark=?,remark_by=?,updated_at=? WHERE template_id=? AND period_key=?'
      : 'UPDATE recurring_period_rows SET status=?,completed_at=?,is_on_time=?,remark=?,remark_by=?,updated_at=? WHERE template_id=? AND period_key=?';
    const values=changeDeletion
      ? [status,completedAt,onTime??1,deleted?1:0,deleted?now:null,remark,remarkBy,now,templateId,periodKey]
      : [status,completedAt,onTime??1,remark,remarkBy,now,templateId,periodKey];
    await env.DB.prepare(sql).bind(...values).run();
    return json({success:true,data:{templateId,periodKey,status,completed,completedAt,remark,remarkBy,dead:deleted,deadAt:deleted?now:null,deletedScope:deleted?'day':undefined,uncompleted:action==='uncomplete'}});
  }
  if (path === "/recurring/mis-counts" && req.method === 'GET') {
    const weekStart=url.searchParams.get('weekStart'),weekEnd=url.searchParams.get('weekEnd');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart||'')||!/^\d{4}-\d{2}-\d{2}$/.test(weekEnd||'')||weekStart>weekEnd)return json({success:false,error:'Invalid MIS week'},{status:400});
    const byName={};
    for(const row of await aggregatePeriods(env,weekStart,weekEnd)){
      const key=normalizePersonName(row.name);if(!key)continue;
      const person=byName[key]??={name:row.name,department:row.department||'',planned:0,done:0,onTime:0,byCategory:{office:{planned:0,done:0,onTime:0},salon:{planned:0,done:0,onTime:0},weekly:{planned:0,done:0,onTime:0}}};
      const bucket=person.byCategory[row.source_kind||misCategoryKey(String(row.category||''),String(row.department||''),row.name)];
      for(const metric of ['planned','done','onTime']){person[metric]+=Number(row[metric]||0);bucket[metric]+=Number(row[metric]||0);}
    }
    return json({success:true,data:{weekStart,weekEnd,byName}});
  }
  return null;
}
__name(routeRecurring, "routeRecurring");
var index_default = {
  async fetch(req, env) {
    const wrappedEnv = { ...env, DB: wrapDb(env.DB) };
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(wrappedEnv) });
    const authRoute = await routeAuth(req, wrappedEnv, url.pathname);
    if (authRoute) return new Response(authRoute.body, { status: authRoute.status, headers: { ...Object.fromEntries(authRoute.headers), ...corsHeaders(wrappedEnv) } });
    if (!requireSecret(req, wrappedEnv)) return json({ success: false, error: "Unauthorized" }, { status: 401, headers: corsHeaders(wrappedEnv) });
    if(url.searchParams.get('fresh')==='true')invalidateReadCache();
    const cached=getCachedRead(req,url);
    if(cached)return new Response(cached.body,{status:cached.status,headers:{...Object.fromEntries(cached.headers),...corsHeaders(wrappedEnv)}});
    const response = await routeLifecycle(req,wrappedEnv,url,{nextTaskId,taskFromRow,revisionFromRow,resolveRecurringDefinition,buildMonthPeriodRows,periodRowId,adjustTaskCount}) || await routeReadOptimizations(req,wrappedEnv,url,taskFromRow) || await routeUsers(req, wrappedEnv, url) || await routeDepartments(req, wrappedEnv, url) || await routeTasks(req, wrappedEnv, url) || await routeScores(req, wrappedEnv, url) || await routeRevisions(req, wrappedEnv, url) || await routeCrm(req, wrappedEnv, url) || await routeAutomations(req, wrappedEnv, url) || await routeMis(req, wrappedEnv, url) || await routeRecurring(req, wrappedEnv, url) || await routeChecklist(req, wrappedEnv, url) || json({ success: false, error: "Not found" }, { status: 404 });
    if(req.method!=='GET'&&response.ok)invalidateReadCache();
    await cacheRead(req,url,response);
    return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...corsHeaders(wrappedEnv) } });
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
