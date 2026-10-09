-- PR 3-4 (D36, M3 §5): an order exists only once it is paid. Until then the row in orders is a checkout
-- (status pending, or expired after 24 hours); one per purchase, reused when the shopper retries or switches method.
-- Additive only (D45).

-- Every payment object made for a checkout: Airwallex PaymentIntents and PayPal orders. orders.payment_intent_id keeps
-- the latest (or, once paid, the one that paid); this table is what lets a payment on an older object be recognised,
-- and a second successful payment for the same checkout be refunded (C11, M5-08).
CREATE TABLE IF NOT EXISTS checkout_payments (
  provider TEXT NOT NULL,                 -- airwallex | paypal
  ref TEXT NOT NULL,                      -- PaymentIntent id | PayPal order id
  checkout_id TEXT NOT NULL,              -- orders.id
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,                   -- open | voided | succeeded | duplicate_refunded | duplicate_refund_failed
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, ref)
);
CREATE INDEX IF NOT EXISTS checkout_payments_checkout ON checkout_payments (checkout_id, created_at);

-- When an unpaid checkout expired (24 hours, worker/checkouts.js), and when its personal details were deleted (30 days).
ALTER TABLE orders ADD COLUMN expired_at TEXT;
ALTER TABLE orders ADD COLUMN purged_at TEXT;
