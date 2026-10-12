-- PR 3-11: every package of a shipment, returned packages, GA4 refund events (F6, F9, K3; M8-05, M10-03). Additive only (D45).

-- Each package Amazon shipped (worker/mcf.js), with its tracking number: the shipment email lists them all (F6, M8-05).
-- The tracking watch (worker/package-tracking.js) reads Amazon's status once a day until the package is delivered or 30
-- days have passed; a package returned to the sender tells the team once (returned_at, F9). events_json keeps the last
-- tracking events (status, time, city and state) for dispute evidence; a privacy deletion empties it.
CREATE TABLE IF NOT EXISTS order_packages (
  order_id TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  package_id TEXT NOT NULL DEFAULT '',    -- Amazon's packageNumber (numeric), '' for a shipment typed in by hand
  carrier TEXT NOT NULL DEFAULT '',
  tracking_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',        -- Amazon's currentStatus: IN_TRANSIT | DELIVERED | RETURNING | RETURNED | ...
  status_at TEXT,
  delivered_at TEXT,
  returned_at TEXT,
  events_json TEXT NOT NULL DEFAULT '[]',
  checked_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (order_id, tracking_number)
);
CREATE INDEX IF NOT EXISTS order_packages_watch ON order_packages (status, checked_at);

-- The visitor's Google Analytics client id (the _ga cookie) at checkout, so a refund event joins the same user in GA4.
-- Not affected by Global Privacy Control (D46: GA4 runs as usual); a privacy deletion removes it.
CREATE TABLE IF NOT EXISTS order_analytics (
  order_id TEXT PRIMARY KEY,
  ga_client_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Events the Worker sends to GA4 itself (Measurement Protocol, worker/ga4.js): a refund once the provider accepted it
-- (K3, M10-03), so GA4 takes it off the revenue. Sent by the cron; never from staging (M10-04).
CREATE TABLE IF NOT EXISTS order_ga_events (
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- refund:<refund id>
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,                   -- pending | sent | skipped | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  next_attempt_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_id, kind)
);
CREATE INDEX IF NOT EXISTS order_ga_events_due ON order_ga_events (status, next_attempt_at);
