-- PR 3-10: customers, privacy requests, refunds from the back office, reports (M9, D51, D53–D56). Additive only (D45).

-- Refunds asked from the order page by a member (D51, M9-25; worker/admin-refunds.js). One row per press of "Refund",
-- keyed by the request id the page made when the panel opened (refund-<key>): pressed twice, the second press finds the
-- first row and the provider gets the same request id, so the money goes back once. notify = 0: the customer is not
-- emailed about this refund (the provider's later refund events do not email either).
CREATE TABLE IF NOT EXISTS admin_refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL,                 -- airwallex | paypal
  ref TEXT NOT NULL,                      -- the payment it refunds (PaymentIntent id | PayPal order id)
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  notify INTEGER NOT NULL DEFAULT 1,
  cancel_first INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,                   -- requesting | requested | failed | not_cancelled
  refund_id TEXT NOT NULL DEFAULT '',     -- the provider's refund id once it accepted the request
  error TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_refunds_order ON admin_refunds (order_id, created_at);
CREATE INDEX IF NOT EXISTS admin_refunds_refund ON admin_refunds (refund_id);

-- Internal notes on a customer (I7, I10, M9-18), keyed by the lowercased email: any member can read and write them,
-- customers never see them, never edited (a correction is another note). A privacy deletion removes them (D53).
CREATE TABLE IF NOT EXISTS customer_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_notes_by_customer ON customer_notes (customer, id);

-- Privacy requests (E11, M11-05; worker/customer-privacy.js): a customer asked to see or delete their data. Who handles
-- it and the date to answer by (45 days); the dashboard and the daily team email remind until it is closed. After a
-- deletion the customer column holds "deleted:<hash>", never the email.
CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,                    -- PR-<uuid>
  customer TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- access | delete
  received_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  handler TEXT NOT NULL,
  status TEXT NOT NULL,                   -- open | done
  outcome TEXT NOT NULL DEFAULT '',       -- exported | deleted | other
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_by TEXT,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS privacy_requests_open ON privacy_requests (status, due_at);
CREATE INDEX IF NOT EXISTS privacy_requests_customer ON privacy_requests (customer);

-- Amazon's fee estimate for an order, read (getFulfillmentPreview, read-only) right after it was sent to Amazon: the
-- report's "shipping charged vs Amazon's fee" (I8, M9-16).
CREATE TABLE IF NOT EXISTS order_mcf_fees (
  order_id TEXT PRIMARY KEY,
  fee_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT '',
  captured_at TEXT NOT NULL
);
