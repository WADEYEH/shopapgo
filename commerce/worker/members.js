// Back-office members (M9 §1, D33, D44; tests M9-09, M9-10). One list, kept here: who may use the back office and
// with which role.
//
//   owner   everything, plus managing members (and settings later)
//   member  day-to-day work, no member management
//
// Only owners add, remove or change members; the last active owner can never be removed or demoted. Every change is
// written to the activity log (worker/activity.js) with the reason, every owner is emailed about it, and the list is
// copied to the Cloudflare Access email list (worker/access-list.js) when that is configured.
//
// The first owner: while the table has no active owner, the email in ADMIN_OWNER_EMAIL (a plain var) becomes one.
import { isEmail } from "../../lib/shop/contact-rules.mjs";
import { recordAdminAudit, updateAdminAuditDetail } from "./activity.js";
import { syncAccessList } from "./access-list.js";
import { emailOwners } from "./team-alerts.js";

export const ROLES = ["owner", "member"];
const SYSTEM = { id: "system", via: "system", role: "owner" };
const REASON_MAX = 300;

export class MemberError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const cleanReason = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, REASON_MAX);
const snapshot = (row) => (row ? { email: row.email, role: row.role, status: row.status } : null);

const publicMember = (row) => ({
  email: row.email,
  role: row.role,
  status: row.status,
  addedBy: row.added_by,
  addedAt: row.added_at,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
});

const getMember = (db, email) => db.prepare("SELECT * FROM admin_members WHERE email = ?").bind(email).first();

export async function activeMember(db, email) {
  const row = await getMember(db, normalizeEmail(email));
  return row?.status === "active" ? row : null;
}

// Active members first (owners, then by email), then removed ones, most recent first.
export async function listMembers(db) {
  const { results } = await db
    .prepare(
      `SELECT * FROM admin_members
       ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, CASE role WHEN 'owner' THEN 0 ELSE 1 END,
                CASE status WHEN 'active' THEN email END, updated_at DESC`,
    )
    .all();
  return results.map(publicMember);
}

// Makes ADMIN_OWNER_EMAIL an owner while nobody is. Returns true when it did.
export async function ensureOwner(env, { now = () => new Date().toISOString() } = {}) {
  const email = normalizeEmail(env.ADMIN_OWNER_EMAIL);
  if (!isEmail(email)) return false;
  const db = env.DB;
  const owners = await db.prepare("SELECT COUNT(*) AS n FROM admin_members WHERE role = 'owner' AND status = 'active'").first();
  if ((owners?.n ?? 0) > 0) return false;
  const before = await getMember(db, email);
  const at = now();
  await db
    .prepare(
      `INSERT INTO admin_members (email, role, status, added_by, added_at, updated_by, updated_at)
       VALUES (?, 'owner', 'active', 'system', ?, 'system', ?)
       ON CONFLICT(email) DO UPDATE SET role = 'owner', status = 'active', updated_by = 'system', updated_at = excluded.updated_at`,
    )
    .bind(email, at, at)
    .run();
  await recordAdminAudit(db, { actor: SYSTEM, action: "member.bootstrap", target: email, before: snapshot(before), after: { email, role: "owner", status: "active" }, reason: "First owner (ADMIN_OWNER_EMAIL).", at });
  return true;
}

// ---------- changes ----------

function requireOwner(actor) {
  if (actor?.role !== "owner") throw new MemberError(403, "owner_only", "Only an owner can manage members.");
}

function checkEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || !isEmail(email)) throw new MemberError(400, "invalid_email", "Enter a valid email address.");
  return email;
}

function checkRole(value) {
  const role = String(value ?? "").trim().toLowerCase();
  if (!ROLES.includes(role)) throw new MemberError(400, "invalid_role", "Choose owner or member.");
  return role;
}

const activeOwners = async (db) => (await db.prepare("SELECT COUNT(*) AS n FROM admin_members WHERE role = 'owner' AND status = 'active'").first())?.n ?? 0;

// After a change: log it, tell the owners, update the Cloudflare list. Returns what the page shows.
async function afterChange(env, actor, { action, email, before, after, reason }, { fetchImpl, now }) {
  const db = env.DB;
  const at = now();
  const auditId = await recordAdminAudit(db, { actor, action, target: email, before: snapshot(before), after: snapshot(after), reason, at });
  const notified = await notifyOwners(env, { actor, action, email, before, after, reason, at, auditId }, fetchImpl);
  await updateAdminAuditDetail(db, auditId, { notified });
  const sync = await syncAccessList(env, { actor, fetchImpl });
  return { member: publicMember(after), notified, sync };
}

export async function addMember(env, actor, body, { fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  requireOwner(actor);
  const email = checkEmail(body?.email);
  const role = checkRole(body?.role ?? "member");
  const reason = cleanReason(body?.reason);
  const db = env.DB;
  const before = await getMember(db, email);
  if (before?.status === "active") throw new MemberError(409, "already_member", `${email} is already a member.`);
  const at = now();
  const result = await db
    .prepare(
      `INSERT INTO admin_members (email, role, status, added_by, added_at, updated_by, updated_at)
       VALUES (?, ?, 'active', ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET role = excluded.role, status = 'active', added_by = excluded.added_by,
         added_at = excluded.added_at, updated_by = excluded.updated_by, updated_at = excluded.updated_at
       WHERE admin_members.status = 'removed'`,
    )
    .bind(email, role, actor.id, at, actor.id, at)
    .run();
  if (!(result.meta?.changes > 0)) throw new MemberError(409, "already_member", `${email} is already a member.`);
  const after = await getMember(db, email);
  return afterChange(env, actor, { action: "member.added", email, before, after, reason }, { fetchImpl, now });
}

export async function changeRole(env, actor, body, { fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  requireOwner(actor);
  const email = checkEmail(body?.email);
  const role = checkRole(body?.role);
  const reason = cleanReason(body?.reason);
  const db = env.DB;
  const before = await getMember(db, email);
  if (before?.status !== "active") throw new MemberError(404, "not_a_member", `${email} is not a member.`);
  if (before.role === role) throw new MemberError(409, "no_change", `${email} is already ${role === "owner" ? "an owner" : "a member"}.`);
  // One statement: demoting an owner only happens while another active owner remains, even with two clicks at once.
  const result = await db
    .prepare(
      `UPDATE admin_members SET role = ?, updated_by = ?, updated_at = ?
       WHERE email = ? AND status = 'active' AND role = ?
         AND (? = 'owner' OR (SELECT COUNT(*) FROM admin_members WHERE role = 'owner' AND status = 'active') > 1)`,
    )
    .bind(role, actor.id, now(), email, before.role, role)
    .run();
  if (!(result.meta?.changes > 0)) {
    if (before.role === "owner" && (await activeOwners(db)) <= 1) throw new MemberError(409, "last_owner", "The last owner cannot be made a member. Make someone else an owner first.");
    throw new MemberError(409, "changed_meanwhile", "This member was changed meanwhile. Reload and try again.");
  }
  const after = await getMember(db, email);
  return afterChange(env, actor, { action: "member.role_changed", email, before, after, reason }, { fetchImpl, now });
}

export async function removeMember(env, actor, body, { fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  requireOwner(actor);
  const email = checkEmail(body?.email);
  const reason = cleanReason(body?.reason);
  const db = env.DB;
  const before = await getMember(db, email);
  if (before?.status !== "active") throw new MemberError(404, "not_a_member", `${email} is not a member.`);
  const result = await db
    .prepare(
      `UPDATE admin_members SET status = 'removed', updated_by = ?, updated_at = ?
       WHERE email = ? AND status = 'active'
         AND (role != 'owner' OR (SELECT COUNT(*) FROM admin_members WHERE role = 'owner' AND status = 'active') > 1)`,
    )
    .bind(actor.id, now(), email)
    .run();
  if (!(result.meta?.changes > 0)) {
    if (before.role === "owner" && (await activeOwners(db)) <= 1) throw new MemberError(409, "last_owner", "The last owner cannot be removed. Make someone else an owner first.");
    throw new MemberError(409, "changed_meanwhile", "This member was changed meanwhile. Reload and try again.");
  }
  const after = await getMember(db, email);
  return afterChange(env, actor, { action: "member.removed", email, before, after, reason }, { fetchImpl, now });
}

// ---------- telling the owners ----------

const ACTION_TEXT = {
  "member.added": (c) => `${c.email} was added as ${c.after.role === "owner" ? "an owner" : "a member"}`,
  "member.role_changed": (c) => `${c.email} changed from ${c.before.role} to ${c.after.role}`,
  "member.removed": (c) => `${c.email} was removed`,
};

// Emails every active owner (worker/team-alerts.js). Returns { sent, skipped, failed }. Never throws: the change itself
// is already saved.
function notifyOwners(env, change, fetchImpl) {
  const what = ACTION_TEXT[change.action]?.(change) ?? `${change.email}: ${change.action}`;
  const text = [
    `${what}.`,
    `By: ${change.actor.id}`,
    `When: ${change.at}`,
    change.reason ? `Reason: ${change.reason}` : "Reason: (none given)",
    "",
    "You get this because you are an owner of the APGO back office. Members and the full history are on the Members and Activity sections of the back office.",
  ].join("\n");
  return emailOwners(env, { subject: `Back office: ${what}`, text, idempotencyKey: `member-${change.auditId}` }, fetchImpl);
}
