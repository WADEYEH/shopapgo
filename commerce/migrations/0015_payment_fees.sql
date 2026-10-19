-- What the payment providers kept and paid out for each payment (C20, M15), so the payment report shows the fee and
-- the net next to the amount and can be matched line by line with PayPal's and Airwallex's own reports. Filled by the
-- cron job "fees" (worker/payment-fees.js): PayPal's seller_receivable_breakdown, Airwallex's financial transactions.
-- Without a row, or with status unknown, the fee is not known yet. Additive only (D45).
CREATE TABLE IF NOT EXISTS payment_fees (
  provider TEXT NOT NULL,                 -- airwallex | paypal
  ref TEXT NOT NULL,                      -- as in payments.csv: PaymentIntent id | PayPal order id
  order_id TEXT NOT NULL,
  provider_ref TEXT NOT NULL DEFAULT '',  -- what the provider's report shows: PayPal capture id | Airwallex payment attempt id
  gross_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,                 -- of the fee and the net
  status TEXT NOT NULL,                   -- final | pending (Airwallex has not settled it yet) | unknown (not found yet; amounts 0)
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (provider, ref)
);
CREATE INDEX IF NOT EXISTS payment_fees_order ON payment_fees (order_id);
