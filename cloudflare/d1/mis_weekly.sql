-- PDF MIS weekly G4 snapshots (replaces Firestore misWeekly)
CREATE TABLE IF NOT EXISTS mis_weekly (
  id TEXT PRIMARY KEY,
  uid TEXT,
  name TEXT NOT NULL,
  department TEXT,
  wa_number TEXT,
  checklist_json TEXT NOT NULL DEFAULT '{"planned":0,"done":0,"onTime":0}',
  delegation_json TEXT NOT NULL DEFAULT '{"planned":0,"done":0,"onTime":0}',
  fms_json TEXT NOT NULL DEFAULT '{"planned":0,"done":0,"onTime":0}',
  planned INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  on_time INTEGER NOT NULL DEFAULT 0,
  gap_percent REAL,
  gap_decimal REAL,
  on_time_gap_percent REAL,
  week_key TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  week_number INTEGER NOT NULL DEFAULT 0,
  month_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  combined_week TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mis_weekly_week ON mis_weekly (week_key);
CREATE INDEX IF NOT EXISTS idx_mis_weekly_year_month ON mis_weekly (year, month_name);
CREATE INDEX IF NOT EXISTS idx_mis_weekly_name_week ON mis_weekly (name, week_start);

-- Optional H4/H5-style archive (replaces Firestore misArchive / sheet Archive tab intent)
CREATE TABLE IF NOT EXISTS mis_archive (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  name TEXT NOT NULL,
  uid TEXT,
  h4 REAL,
  h5 REAL,
  week_key TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mis_archive_week ON mis_archive (week_key);
CREATE INDEX IF NOT EXISTS idx_mis_archive_name ON mis_archive (name, timestamp DESC);
