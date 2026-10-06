-- Structure of the production D1 `apgo-us-store` (b409b132-2f2d-4da8-970c-2cf5560ac830) as of 2026-10-06,
-- exported read-only from sqlite_master (table and index definitions only, no rows). tests/schema.test.mjs
-- applies worker/schema.sql on top of it to prove the merged schema only adds tables there.
CREATE TABLE order_attribution (
  order_id TEXT PRIMARY KEY,
  fbp TEXT NOT NULL DEFAULT '',         -- _fbp cookie value (fb.1.<ms>.<random>)
  fbc TEXT NOT NULL DEFAULT '',         -- _fbc cookie value, or fb.1.<ms>.<fbclid> built from the click id
  fbclid TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',  -- event_source_url (page the checkout started on)
  client_ip TEXT NOT NULL DEFAULT '',
  client_user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE order_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  action TEXT NOT NULL,                 -- e.g. order.shipped
  actor TEXT NOT NULL,                  -- "admin"
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE order_emails (
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- confirmation | shipment
  status TEXT NOT NULL,                 -- pending | sent | failed | skipped
  detail TEXT NOT NULL DEFAULT '',      -- short reason, never secrets or addresses
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id, kind)
);

CREATE TABLE order_fulfillments (
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

CREATE TABLE order_mcf (
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

CREATE TABLE order_meta_events (
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

CREATE TABLE order_notifications (
  order_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,                 -- pending | sent | failed | skipped
  detail_json TEXT NOT NULL DEFAULT '[]', -- per-channel results, no secrets
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE order_payments (
  order_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,               -- paypal (airwallex stays on payment_intent_id only)
  provider_ref TEXT NOT NULL,           -- PayPal order id
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
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

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX order_audit_order ON order_audit (order_id, id);

CREATE INDEX order_mcf_status ON order_mcf (status, updated_at);

CREATE INDEX order_meta_events_status ON order_meta_events (status, updated_at);

CREATE UNIQUE INDEX order_payments_provider_ref ON order_payments (provider, provider_ref);

CREATE INDEX orders_payment_intent ON orders (payment_intent_id);

CREATE INDEX orders_status_created ON orders (status, created_at);
