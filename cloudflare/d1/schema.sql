PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  raw_name TEXT,
  email TEXT,
  wa_number TEXT NOT NULL,
  wa_number_last10 TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_wa_last10 ON users (wa_number_last10);
CREATE INDEX IF NOT EXISTS idx_users_department ON users (department);

CREATE TABLE IF NOT EXISTS tasks_current (
  task_id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  assigned_to_name TEXT NOT NULL,
  assigned_to_wa TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  handoff_uid TEXT NOT NULL,
  handoff_name TEXT NOT NULL,
  handoff_wa TEXT,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  department TEXT,
  start_date TEXT,
  end_date TEXT,
  delayed_date TEXT,
  delay_reason TEXT,
  revision_status TEXT NOT NULL,
  notes TEXT,
  accepted_at TEXT,
  completed_at TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  day_key TEXT,
  week_key TEXT,
  week_start TEXT,
  week_end TEXT,
  month_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_created ON tasks_current (assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_handoff_created ON tasks_current (handoff_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks_current (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks_current (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_department_status ON tasks_current (department, status);
CREATE INDEX IF NOT EXISTS idx_tasks_department_created ON tasks_current (department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_department_status_created ON tasks_current (department, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_week_status ON tasks_current (week_key, status);
CREATE INDEX IF NOT EXISTS idx_tasks_month_status ON tasks_current (month_key, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_status ON tasks_current (status, end_date);

CREATE TABLE IF NOT EXISTS scores (
  uid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  wa_number TEXT,
  tasks_assigned INTEGER NOT NULL,
  tasks_completed INTEGER NOT NULL,
  on_time_count INTEGER NOT NULL,
  late_count INTEGER NOT NULL,
  monthly_score INTEGER NOT NULL,
  last_updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mis_scores (
  id TEXT PRIMARY KEY,
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  uid TEXT,
  name TEXT,
  department TEXT,
  wa_number TEXT,
  tasks_assigned INTEGER NOT NULL,
  tasks_completed INTEGER NOT NULL,
  tasks_verified INTEGER NOT NULL,
  pending_accept INTEGER NOT NULL,
  in_progress INTEGER NOT NULL,
  delay_requested INTEGER NOT NULL,
  overdue INTEGER NOT NULL,
  on_time_count INTEGER NOT NULL,
  late_count INTEGER NOT NULL,
  high_priority INTEGER NOT NULL,
  medium_priority INTEGER NOT NULL,
  low_priority INTEGER NOT NULL,
  mis_score INTEGER NOT NULL,
  monthly_score INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  last_updated TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mis_period_rank ON mis_scores (period_type, period_key, mis_score DESC);
CREATE INDEX IF NOT EXISTS idx_mis_user_period ON mis_scores (uid, period_type, period_key DESC);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  tasks_assigned INTEGER NOT NULL,
  tasks_completed INTEGER NOT NULL,
  tasks_verified INTEGER NOT NULL,
  pending_accept INTEGER NOT NULL,
  in_progress INTEGER NOT NULL,
  delay_requested INTEGER NOT NULL,
  overdue INTEGER NOT NULL,
  on_time_count INTEGER NOT NULL,
  late_count INTEGER NOT NULL,
  high_priority INTEGER NOT NULL,
  medium_priority INTEGER NOT NULL,
  low_priority INTEGER NOT NULL,
  mis_score INTEGER NOT NULL,
  monthly_score INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  last_updated TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_period ON reports (period_type, period_key DESC);

CREATE TABLE IF NOT EXISTS task_periods (
  id TEXT PRIMARY KEY,
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  tasks_assigned INTEGER NOT NULL,
  tasks_completed INTEGER NOT NULL,
  tasks_verified INTEGER NOT NULL,
  pending_accept INTEGER NOT NULL,
  in_progress INTEGER NOT NULL,
  delay_requested INTEGER NOT NULL,
  overdue INTEGER NOT NULL,
  on_time_count INTEGER NOT NULL,
  late_count INTEGER NOT NULL,
  high_priority INTEGER NOT NULL,
  medium_priority INTEGER NOT NULL,
  low_priority INTEGER NOT NULL,
  mis_score INTEGER NOT NULL,
  monthly_score INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  last_updated TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_periods_period ON task_periods (period_type, period_key DESC);

CREATE TABLE IF NOT EXISTS reminder_queue (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  assigned_to_name TEXT NOT NULL,
  wa_number TEXT NOT NULL,
  department TEXT,
  reminder_type TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_pending_due ON reminder_queue (status, due_at);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  source_workbook TEXT,
  user_count INTEGER NOT NULL,
  task_count INTEGER NOT NULL,
  score_count INTEGER NOT NULL,
  period_mis_score_count INTEGER NOT NULL,
  report_count INTEGER NOT NULL,
  task_period_count INTEGER NOT NULL,
  reminder_queue_count INTEGER NOT NULL,
  department_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL
);
