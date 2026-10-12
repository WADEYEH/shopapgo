-- PR 3-12: owners edit a product's price, words and photos from the back office (D52, D61–D64; M9-26, M9-27).
-- Additive only (D45).

-- What is live now for one product: only what an owner changed (the rest is the site's own product data,
-- lib/shop/product-data.mjs). content_json: { priceCents?, name?, promise?, when?, lasts?, scope?, seoTitle?,
-- seoDescription?, images?: [{ src, alt }] }. version counts the publishes; 0 means nothing was ever changed.
CREATE TABLE IF NOT EXISTS product_content (
  sku TEXT PRIMARY KEY,
  content_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Every publish, so any earlier one (or the original, version 0) can be put back with one press (D63).
CREATE TABLE IF NOT EXISTS product_versions (
  sku TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL,
  restored_from INTEGER,                  -- the version it put back, when it was a restore
  PRIMARY KEY (sku, version)
);

-- Photos uploaded for a product (Cloudflare R2, binding PRODUCT_IMAGES; D61, D62). Already resized in the browser; the
-- Worker serves them at /media/products/<sku>/<id>.webp and they never change (a new photo is a new file).
CREATE TABLE IF NOT EXISTS product_images (
  key TEXT PRIMARY KEY,                   -- products/<sku>/<id>.webp
  sku TEXT NOT NULL,
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS product_images_sku ON product_images (sku, uploaded_at);
