-- PR 3-2 (M9 §1, D33, D44): back-office members and the site-wide activity log. Additive only (D45).

-- Who may use the back office, and with which role. One row per email (lowercase). Removing someone keeps the row
-- (status 'removed') so the history still names them, and adding them again reactivates it. Owners manage members;
-- the last active owner can never be removed or demoted (worker/members.js). The first owner comes from the
-- ADMIN_OWNER_EMAIL var when the table has no active owner yet.
CREATE TABLE IF NOT EXISTS admin_members (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL,                     -- owner | member
  status TEXT NOT NULL,                   -- active | removed
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Changes not tied to one order: members, the Cloudflare Access list sync, settings later. Order actions stay in
-- order_audit; the Activity page (worker/activity.js) shows both. before / after are JSON snapshots, reason is what
-- the person typed.
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,                    -- member email, or token / staging-login / system
  actor_via TEXT NOT NULL,                -- access | password | token | staging-login | system
  action TEXT NOT NULL,                   -- member.added | member.role_changed | member.removed | access_list.synced ...
  target TEXT NOT NULL DEFAULT '',
  before_json TEXT,
  after_json TEXT,
  reason TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit (at);
CREATE INDEX IF NOT EXISTS admin_audit_actor ON admin_audit (actor, at);

-- The Activity page filters order_audit by time and person too.
CREATE INDEX IF NOT EXISTS order_audit_created ON order_audit (created_at);
CREATE INDEX IF NOT EXISTS order_audit_actor ON order_audit (actor, created_at);
