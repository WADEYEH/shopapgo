-- PR 3-9: Global Privacy Control (D46, M10-08). Additive only (D45).

-- Orders whose checkout came with GPC (the browser's Sec-GPC header, or the page's privacy.gpc) while the Worker honours
-- it (HONOR_GPC not "false"): no ad attribution is kept and no Meta Conversions API event is ever sent for them.
CREATE TABLE IF NOT EXISTS order_privacy (
  order_id TEXT PRIMARY KEY,
  gpc INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
