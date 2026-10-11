-- PR 3-8: back office v1 (M9, D50). Additive only (D45).

-- Internal notes on an order (I10, M9-18): who wrote it and when; customers never see them. Notes are never edited or
-- deleted (D50): a correction is another note.
CREATE TABLE IF NOT EXISTS order_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_notes_by_order ON order_notes (order_id, id);

-- Per-product switches the owners set in the back office (A4, M2-04, M9-07). No row = on sale. PR 3-12 (D52) adds the
-- price and text the owners edit to this table.
CREATE TABLE IF NOT EXISTS product_settings (
  sku TEXT PRIMARY KEY,
  on_sale INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
