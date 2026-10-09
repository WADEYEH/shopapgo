-- Migration 0002 (phase 3, PR 3-1): what operations need to watch the system.

-- One row per scheduled job ("_tick" is the cron run as a whole): when it last started and finished, the last success
-- and the last error. GET /api/health reads "_tick" to say whether the cron is still running (worker/cron.js).
CREATE TABLE IF NOT EXISTS cron_runs (
  job TEXT PRIMARY KEY,
  last_started_at TEXT NOT NULL,
  last_finished_at TEXT,
  last_ok_at TEXT,
  last_error TEXT,
  runs INTEGER NOT NULL DEFAULT 0
);

-- Staging only: the fake Amazon outbound service's orders (worker/fake-amazon.js, MCF_FAKE=true with SITE_ENV=staging).
-- Stays empty everywhere else. Holds the create request as sent (test shoppers only) and the simulated state.
CREATE TABLE IF NOT EXISTS staging_fake_mcf_orders (
  seller_order_id TEXT PRIMARY KEY,
  request_json TEXT NOT NULL,
  scenario TEXT NOT NULL,             -- ship | stockout
  status TEXT NOT NULL,               -- RECEIVED | PROCESSING | COMPLETE | UNFULFILLABLE | CANCELLED
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
