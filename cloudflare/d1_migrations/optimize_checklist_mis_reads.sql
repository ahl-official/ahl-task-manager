-- Apply once before deploying the Worker. These indexes do not change task data.
CREATE INDEX IF NOT EXISTS idx_tasks_pending_verification
  ON tasks_current (created_at DESC, task_id DESC)
  WHERE (category NOT IN ('Daily','Weekly','Monthly') OR category IS NULL)
    AND status='Completed' AND (verified_at IS NULL OR verified_at='');

CREATE INDEX IF NOT EXISTS idx_tasks_pending_verification_handoff
  ON tasks_current (handoff_uid, created_at DESC, task_id DESC)
  WHERE (category NOT IN ('Daily','Weekly','Monthly') OR category IS NULL)
    AND status='Completed' AND (verified_at IS NULL OR verified_at='');

-- Keep the effective date and eligibility expressions identical to the MIS query.
CREATE INDEX IF NOT EXISTS idx_tasks_mis_effective_date
  ON tasks_current (date(COALESCE(NULLIF(delayed_date,''),NULLIF(end_date,''),NULLIF(start_date,''),NULLIF(completed_at,'')),'+5 hours','+30 minutes'))
  WHERE status!='Deleted' AND LOWER(COALESCE(category,'')) NOT IN ('daily','weekly','monthly');

CREATE INDEX IF NOT EXISTS idx_period_active_category_date_id
  ON recurring_period_rows (category, due_date, id)
  WHERE is_deleted=0 AND status!='Deleted';

CREATE INDEX IF NOT EXISTS idx_period_active_month_category_date_id
  ON recurring_period_rows (month_key, category, due_date, id)
  WHERE is_deleted=0 AND status!='Deleted';

CREATE INDEX IF NOT EXISTS idx_period_active_uid_category_date_id
  ON recurring_period_rows (assigned_to, category, due_date, id)
  WHERE is_deleted=0 AND status!='Deleted';

CREATE INDEX IF NOT EXISTS idx_period_rows_name_norm_due
  ON recurring_period_rows (TRIM(LOWER(assigned_to_name)), category, due_date, id)
  WHERE is_deleted=0 AND status!='Deleted';

CREATE INDEX IF NOT EXISTS idx_period_active_department_category_date_id
  ON recurring_period_rows (TRIM(LOWER(department)), category, due_date, id)
  WHERE is_deleted=0 AND status!='Deleted';

CREATE INDEX IF NOT EXISTS idx_period_sources_row_kind
  ON recurring_period_sources (period_row_id, source_kind);
