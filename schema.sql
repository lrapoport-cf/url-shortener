-- Click analytics table
CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  short_code TEXT NOT NULL,
  clicked_at TEXT NOT NULL,
  referrer TEXT,
  country TEXT,
  user_agent TEXT
);

-- Index for fast lookups by short code
CREATE INDEX IF NOT EXISTS idx_clicks_code ON clicks(short_code);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_clicks_time ON clicks(clicked_at DESC);
