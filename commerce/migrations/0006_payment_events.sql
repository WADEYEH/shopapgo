-- PR 3-5 (M5 §4–7): PayPal refunds next to Airwallex ones, disputes, and the daily payment check. Additive only (D45).

-- Refunds from either provider. Rows from before this migration are Airwallex refunds.
ALTER TABLE order_refunds ADD COLUMN provider TEXT NOT NULL DEFAULT 'airwallex';

-- Disputes and chargebacks (M5 §5, D10, D18). An open one holds the order (no Amazon, no shipping); won releases it;
-- lost counts as a full refund (worker/disputes.js). The team is told when one opens and again 3 days before due_at.
CREATE TABLE IF NOT EXISTS order_disputes (
  provider TEXT NOT NULL,                 -- airwallex | paypal
  dispute_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,                   -- open | won | lost
  provider_status TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  due_at TEXT,                            -- respond in the provider's dashboard before this
  reminded_at TEXT,
  provider_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, dispute_id)
);
CREATE INDEX IF NOT EXISTS order_disputes_order ON order_disputes (order_id);
CREATE INDEX IF NOT EXISTS order_disputes_status_due ON order_disputes (status, due_at);

-- Small facts the cron keeps between runs (for example when the daily payment check last ran).
CREATE TABLE IF NOT EXISTS ops_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
