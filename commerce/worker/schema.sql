-- APGO US store orders (Cloudflare D1).
-- Apply locally:  npx wrangler d1 execute apgo-us-store --local --file worker/schema.sql
-- Apply remote:   npx wrangler d1 execute apgo-us-store --remote --file worker/schema.sql

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,                  -- APGO-US-XXXXXXXXXXXX, also Airwallex merchant_order_id
  status TEXT NOT NULL,                 -- pending | paid | cancelled | review
  email TEXT NOT NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  shipping_json TEXT NOT NULL,          -- name + US address
  shipping_method TEXT NOT NULL,
  lines_json TEXT NOT NULL,             -- priced lines as charged
  currency TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  payment_intent_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS orders_payment_intent ON orders (payment_intent_id);
CREATE INDEX IF NOT EXISTS orders_status_created ON orders (status, created_at);

-- One record per failed attempt. Failures never cancel the associated order.
CREATE TABLE IF NOT EXISTS order_payment_failures (
  attempt_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  failure_code TEXT NOT NULL DEFAULT '',
  provider_code TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  trace_id TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_failures_order ON order_payment_failures (order_id, occurred_at);

-- Observed refunds only. No provider payloads, card data or free-text reasons.
CREATE TABLE IF NOT EXISTS order_refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  payment_intent_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED','ACCEPTED','SETTLED','FAILED')),
  failure_code TEXT NOT NULL DEFAULT '',
  provider_created_at TEXT NOT NULL,
  provider_updated_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS refunds_order ON order_refunds(order_id,status);

-- Airwallex retries deliveries; the event id makes webhook handling idempotent.
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  received_at TEXT NOT NULL
);

-- One row per order the first time it is paid; the primary key makes the new-order
-- notification fire at most once even if the webhook and the retrieve fallback race.
CREATE TABLE IF NOT EXISTS order_notifications (
  order_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,                 -- pending | sent | failed | skipped
  detail_json TEXT NOT NULL DEFAULT '[]', -- per-channel results, no secrets
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------------------------
-- Fulfilment, customer emails and audit trail.
--
-- Migration policy: this file is re-run on every `npm run db:migrate:*`, and SQLite/D1 fail
-- a re-run of an added-column statement (duplicate column). So new data goes in NEW
-- tables that use CREATE ... IF NOT EXISTS; existing tables are never altered and
-- existing orders keep working untouched. An order's fulfilment status is derived:
--   no row in order_fulfillments  ->  "unfulfilled"
--   a row                         ->  its fulfillment_status ("shipped")
-- Payment status stays in orders.status and is never mixed with fulfilment.
-- ---------------------------------------------------------------------------------

-- At most one row per order (the primary key is what makes "ship twice" impossible).
CREATE TABLE IF NOT EXISTS order_fulfillments (
  order_id TEXT PRIMARY KEY,
  fulfillment_status TEXT NOT NULL DEFAULT 'shipped', -- shipped (unfulfilled = no row)
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  tracking_url TEXT,                    -- optional https link
  shipped_at TEXT NOT NULL,
  shipped_by TEXT NOT NULL,             -- who: "admin" (shared ADMIN_TOKEN) today
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Customer emails (order confirmation / shipment). The (order_id, kind) key is the
-- legacy claim/projection. New reliable delivery state is in order_email_delivery;
-- status 'sent' means API acceptance, not proven delivery.
CREATE TABLE IF NOT EXISTS order_emails (
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- confirmation | shipment | refund:<id>
  status TEXT NOT NULL,                 -- pending | sent | failed | skipped
  detail TEXT NOT NULL DEFAULT '',      -- short reason, never secrets or addresses
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id, kind)
);

-- Append-only log of back-office writes.
CREATE TABLE IF NOT EXISTS order_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  action TEXT NOT NULL,                 -- e.g. order.shipped
  actor TEXT NOT NULL,                  -- "admin"
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_audit_order ON order_audit (order_id, id);

-- ---------------------------------------------------------------------------------
-- Amazon Multi-Channel Fulfillment (MCF). One row per order that was (or is being) sent to Amazon; no row =
-- "never sent" (MCF off, not configured, or shipped by hand). New table only, so existing databases need no ALTER.
-- The primary key makes the automatic submission fire once per order; seller_order_id is the
-- SellerFulfillmentOrderId sent to Amazon (= our order id; a "-R<n>" suffix only after Amazon itself closed an
-- earlier MCF order as cancelled / unfulfillable / invalid).
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_mcf (
  order_id TEXT PRIMARY KEY,
  seller_order_id TEXT NOT NULL,
  status TEXT NOT NULL,                 -- submitting | submitted | shipped | failed | rejected
  mcf_status TEXT NOT NULL DEFAULT '',  -- Amazon's order status: PROCESSING | COMPLETE | COMPLETE_PARTIAL | CANCELLED | UNFULFILLABLE | INVALID
  attempts INTEGER NOT NULL DEFAULT 1,
  service_tier TEXT NOT NULL DEFAULT '',-- STANDARD | EXPEDITED
  error_kind TEXT NOT NULL DEFAULT '',  -- auth | invalid | transient | ... (empty when fine)
  error_message TEXT NOT NULL DEFAULT '', -- short reason, never credentials
  note TEXT NOT NULL DEFAULT '',        -- e.g. "Amazon shipped; waiting for a tracking number"
  carrier TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  submitted_at TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_mcf_status ON order_mcf (status, updated_at);

-- Durable customer-email outbox. Frozen payloads ensure retries use the exact same
-- Resend idempotency key/body. Contains customer data; protect like orders.
CREATE TABLE IF NOT EXISTS order_email_delivery (
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  request_key TEXT NOT NULL,
  provider_id TEXT UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  lease_until TEXT,
  lease_token TEXT,
  first_attempt_at TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id, kind)
);
CREATE INDEX IF NOT EXISTS email_delivery_due ON order_email_delivery(status, next_attempt_at);

-- Initial confirmation instructions, committed in the same D1 transaction as
-- pending -> paid. No historic-order backfill; transport retries live above.
CREATE TABLE IF NOT EXISTS order_email_jobs (
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'confirmation'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'handed_off', 'skipped')),
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id, kind)
);
CREATE INDEX IF NOT EXISTS email_jobs_due ON order_email_jobs(status, next_attempt_at);

-- Shipment and per-refund instructions. Created atomically with the underlying
-- state transition; payload_json contains only the immutable refund summary.
-- A separate table preserves the existing confirmation-only CHECK constraint.
CREATE TABLE IF NOT EXISTS order_message_jobs (
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind = 'shipment' OR kind LIKE 'refund:%'),
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('pending', 'handed_off', 'skipped')),
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id, kind)
);
CREATE INDEX IF NOT EXISTS message_jobs_due ON order_message_jobs(status, next_attempt_at);

-- Minimal signed event metadata only: no raw webhook payloads or recipients.
CREATE TABLE IF NOT EXISTS customer_email_events (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_email_events_provider ON customer_email_events(provider_id);
CREATE TABLE IF NOT EXISTS customer_email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
