-- APGO US store (Cloudflare D1), migration 0001: the baseline. Every table the store had before numbered migrations
-- (D45, 2026-10-09). It is written with IF NOT EXISTS throughout, so applying it to a database that already has these
-- tables (staging, the production database landing created) changes nothing and only adds the missing ones.
--
-- Migrations are applied with wrangler, which records each applied file in the d1_migrations table and runs it once:
--   npm run db:migrate:local      npm run db:migrate:staging      production: the Deploy workflow (CI)
-- Rule (D45, tests/schema.test.mjs): additive only. New tables and indexes, and new columns, but never a DROP,
-- RENAME, a type change or a data rewrite, so the version before a deploy keeps working on the new structure.

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
-- Before numbered migrations this file was re-run on every deploy, so these tables were added as NEW tables
-- (CREATE ... IF NOT EXISTS) rather than as columns on orders. An order's fulfilment status is derived:
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

-- ---------------------------------------------------------------------------------
-- Meta Conversions API (CAPI). Both tables are new (CREATE TABLE IF NOT EXISTS, no ALTER) and are only written when
-- META_DATASET_ID is set (production), so staging and existing databases behave exactly as before.
-- ---------------------------------------------------------------------------------
-- Browser/ad attribution captured when the order is created. Every value is format-checked and length-capped in
-- worker/meta-attribution.js before it is stored. IP + user agent are kept on purpose (Meta matching; no consent banner).
CREATE TABLE IF NOT EXISTS order_attribution (
  order_id TEXT PRIMARY KEY,
  fbp TEXT NOT NULL DEFAULT '',         -- _fbp cookie value (fb.1.<ms>.<random>)
  fbc TEXT NOT NULL DEFAULT '',         -- _fbc cookie value, or fb.1.<ms>.<fbclid> built from the click id
  fbclid TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',  -- event_source_url (page the checkout started on)
  client_ip TEXT NOT NULL DEFAULT '',
  client_user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- One row per (order, event): the primary key is the atomic claim that keeps a webhook redelivery or two parallel
-- requests from sending the same event twice. event_id / event_time are fixed at claim time so a retry (cron) sends
-- the identical event and Meta deduplicates it. error never holds PII or tokens (HTTP status + Meta error codes only).
CREATE TABLE IF NOT EXISTS order_meta_events (
  order_id TEXT NOT NULL,
  event_name TEXT NOT NULL,             -- InitiateCheckout | Purchase
  event_id TEXT NOT NULL,               -- ic_<order id> | purchase_<order id>
  event_time INTEGER NOT NULL,          -- unix seconds (order created / paid time)
  status TEXT NOT NULL,                 -- sending | sent | failed
  attempts INTEGER NOT NULL DEFAULT 0,  -- HTTP attempts so far (the cron stops after a fixed cap)
  error TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id, event_name)
);
CREATE INDEX IF NOT EXISTS order_meta_events_status ON order_meta_events (status, updated_at);

-- ---------------------------------------------------------------------------------
-- Payment provider refs (PayPal Orders v2). New table only — orders.payment_intent_id
-- is still written (Airwallex intent id or PayPal order id) so existing admin views
-- keep working. Airwallex rows do not need a row here; lookup falls back to
-- payment_intent_id.
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_payments (
  order_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,               -- paypal (airwallex stays on payment_intent_id only)
  provider_ref TEXT NOT NULL,           -- PayPal order id
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS order_payments_provider_ref ON order_payments (provider, provider_ref);

-- ---------------------------------------------------------------------------------
-- Contact us form (worker/contact.js, D28). Saved before the email goes out, so a message is never lost and the
-- back office lists it. ip_hash is a salted hash that changes every UTC day (hourly sending cap only).
-- ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,                  -- CM-<uuid>
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  email_status TEXT NOT NULL,           -- pending | sent | skipped | failed
  email_detail TEXT
);
CREATE INDEX IF NOT EXISTS contact_messages_created ON contact_messages (created_at);
CREATE INDEX IF NOT EXISTS contact_messages_ip ON contact_messages (ip_hash, created_at);
