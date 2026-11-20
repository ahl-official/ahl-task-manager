-- Date seeks for the loaded All Tasks page, rather than scanning each template's history.
CREATE INDEX IF NOT EXISTS idx_period_template_due_visible
  ON recurring_period_rows (template_id, due_date, id, status)
  WHERE is_deleted=0 AND status!='Deleted';
