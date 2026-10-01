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
-- idempotency claim: each email is attempted at most once per order.
CREATE TABLE IF NOT EXISTS order_emails (
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- confirmation | shipment
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
