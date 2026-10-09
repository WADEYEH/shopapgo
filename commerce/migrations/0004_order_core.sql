-- PR 3-3 (M4): order core. Additive only (D45): orders keeps its columns and status values; the stage an order is in
-- (review, paid, fulfilling, shipped, cancelled) is read from orders.status plus order_mcf and order_fulfillments
-- (worker/order-core.js), so the version before this deploy keeps working on the same rows.

-- Why and by whom an order was cancelled (M4 §2.1). One row per cancelled order, written with the status change.
CREATE TABLE IF NOT EXISTS order_cancellations (
  order_id TEXT PRIMARY KEY,
  from_stage TEXT NOT NULL,               -- review | paid | fulfilling
  reason_code TEXT NOT NULL,              -- customer_request | out_of_stock | full_refund | chargeback | review_rejected | other
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  amazon_cancel TEXT NOT NULL DEFAULT '', -- requested (it was with Amazon) | '' (it was not)
  created_at TEXT NOT NULL
);

-- Orders waiting for the end of the cooling-off period (M4 §3.6, D23) before they go to Amazon MCF. A row is added
-- when an order turns paid while automatic submission is on; the cron sends it once due_at has passed and nothing
-- holds it. Orders paid before this existed, or while submission was off, are never sent automatically.
CREATE TABLE IF NOT EXISTS mcf_submission_queue (
  order_id TEXT PRIMARY KEY,
  due_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mcf_submission_queue_due ON mcf_submission_queue (due_at);

-- Team alerts, once per key (worker/team-alerts.js): an order to review, a refund holding shipping, a refused state
-- change, an order that could not be sent to Amazon.
CREATE TABLE IF NOT EXISTS team_alerts (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  order_id TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,                   -- pending | sent | skipped | failed
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS team_alerts_created ON team_alerts (created_at);
