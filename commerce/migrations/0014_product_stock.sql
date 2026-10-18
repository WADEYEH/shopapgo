-- Amazon stock for the store (D25, D76; M6-09, M9-17): what Amazon can ship of each product, read every 15 minutes
-- through the Amazon gateway (worker/inventory.js). Additive only (D45).

-- One row per store product (sku = the product id, e.g. d204) once it has been read. available: Amazon's sellable
-- (fulfillable) units; inbound: on the way to or being received at Amazon; reserved: held by Amazon. out_since: when it
-- went below the threshold (NULL while in stock). simulated_available: staging only (SITE_ENV=staging), a number used
-- instead of Amazon's to try a stock-out (docs/ops/runbook.md section 26); production ignores it.
CREATE TABLE IF NOT EXISTS product_stock (
  sku TEXT PRIMARY KEY,
  seller_sku TEXT NOT NULL,
  available INTEGER NOT NULL,
  inbound INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  amazon_updated_at TEXT,
  read_at TEXT NOT NULL,
  out_since TEXT,
  simulated_available INTEGER
);
