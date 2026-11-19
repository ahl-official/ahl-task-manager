-- D1's planner can reject the category-based partial index; full indexes remain usable.
CREATE INDEX IF NOT EXISTS idx_tasks_verification_status
  ON tasks_current (status, verified_at, created_at DESC, task_id DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_verification_handoff_status
  ON tasks_current (handoff_uid, status, verified_at, created_at DESC, task_id DESC);
