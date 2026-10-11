-- PR 3-6: fulfilment checks (M6). Additive only (D45).

-- The read-back after each submission (D26, M6-16): '' not checked yet | ok | mismatch | unreadable (asked again on sync).
ALTER TABLE order_mcf ADD COLUMN check_status TEXT NOT NULL DEFAULT '';
ALTER TABLE order_mcf ADD COLUMN check_detail TEXT NOT NULL DEFAULT '';
ALTER TABLE order_mcf ADD COLUMN checked_at TEXT;
-- When Amazon first said it could not fill the order (UNFULFILLABLE, M6-06); the delay counts from here.
ALTER TABLE order_mcf ADD COLUMN stockout_at TEXT;

-- Customer notices other than shipment and refunds (order_message_jobs only allows those kinds and cannot change, D45).
-- kind: delay:stockout (worker/fulfillment-checks.js); more in PR 3-7. Same lifecycle as order_message_jobs.
CREATE TABLE IF NOT EXISTS order_notice_jobs (
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('pending', 'handed_off', 'skipped')),
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id, kind)
);
CREATE INDEX IF NOT EXISTS notice_jobs_due ON order_notice_jobs (status, next_attempt_at);

-- A refund the store itself asked a payment provider for when cancelling an order (out of stock, M6-06): one per order,
-- so pressing the button again never refunds twice. status: requesting | requested | failed.
CREATE TABLE IF NOT EXISTS order_refund_requests (
  order_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  ref TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL,
  refund_id TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Hold test orders (D26, M6-15): created at Amazon without shipping, read back, then cancelled. No customer data.
CREATE TABLE IF NOT EXISTS mcf_hold_tests (
  id TEXT PRIMARY KEY,
  outcome TEXT NOT NULL,          -- running | passed | failed
  steps_json TEXT NOT NULL DEFAULT '[]',
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
