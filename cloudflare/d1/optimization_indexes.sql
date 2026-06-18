CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks_current (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_department_created ON tasks_current (department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_department_status_created ON tasks_current (department, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_task_created ON revisions (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_status_task_created ON revisions (status, task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_completions_task_period ON checklist_completions (uid, task_id, period_key);
CREATE INDEX IF NOT EXISTS idx_logs_type_created ON logs (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_owner_updated ON crm_leads (owner_uid, updated_at DESC);
