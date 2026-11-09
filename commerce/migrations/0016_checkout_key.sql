-- The key that lets a browser keep using its checkout (F1, 2026-11-09). The checkout id is also the order number, which
-- the shopper sees and PayPal and Meta receive, so it must not be enough to change a pending checkout: a new checkout
-- gets a random key, only its SHA-256 is kept here, and reusing the checkout needs the key (worker/checkouts.js).
-- Checkouts made before this have none and are simply not reused (a new one is started). Additive only (D45).
ALTER TABLE orders ADD COLUMN checkout_key_hash TEXT;
