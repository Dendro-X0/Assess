-- Assess API D1 schema (Workers production)

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  monthly_quota INTEGER NOT NULL,
  label TEXT NOT NULL,
  polar_customer_id TEXT,
  polar_subscription_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id TEXT NOT NULL,
  assess_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (key_id) REFERENCES api_keys(id)
);

CREATE TABLE IF NOT EXISTS rate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (key_id) REFERENCES api_keys(id)
);

CREATE INDEX IF NOT EXISTS idx_usage_key_month ON usage_events (key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rate_key_time ON rate_events (key_id, created_at);

CREATE TABLE IF NOT EXISTS signup_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  key_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signup_ip_time ON signup_events (ip_hash, created_at);
