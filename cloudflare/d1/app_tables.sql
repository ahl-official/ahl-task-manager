CREATE TABLE IF NOT EXISTS otp_sessions (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_sessions_uid ON otp_sessions (uid, created_at DESC);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  task_id TEXT,
  uid TEXT,
  message TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_created ON logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_type_created ON logs (type, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  stage TEXT,
  notes TEXT,
  owner_uid TEXT,
  owner_name TEXT,
  next_follow_up TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_updated ON crm_leads (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_owner_updated ON crm_leads (owner_uid, updated_at DESC);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_by_name TEXT NOT NULL,
  requested_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  decided_by TEXT,
  decided_by_name TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revisions_status_created ON revisions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_requested_by_created ON revisions (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_task_created ON revisions (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_status_task_created ON revisions (status, task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_tasks (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checklist_category_status ON checklist_tasks (category, status);

CREATE TABLE IF NOT EXISTS checklist_completions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  category TEXT NOT NULL,
  period_key TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checklist_completions_uid ON checklist_completions (uid, period_key);
CREATE INDEX IF NOT EXISTS idx_checklist_completions_task_period ON checklist_completions (uid, task_id, period_key);

CREATE TABLE IF NOT EXISTS task_counters (
  id TEXT PRIMARY KEY,
  current_value INTEGER NOT NULL
);

INSERT OR IGNORE INTO task_counters (id, current_value)
SELECT 'tasks', COALESCE(MAX(CAST(SUBSTR(task_id, 3) AS INTEGER)), 0)
FROM tasks_current
WHERE task_id LIKE 'T-%';
