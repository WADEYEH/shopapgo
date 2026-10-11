// Global Privacy Control (D46, M10-08; O7 waits for counsel): a shopper whose browser sends GPC is asking us not to sell
// or share their data, which for this store means Meta. While HONOR_GPC is not "false" (the default honours it), such a
// checkout keeps no ad attribution and the order is marked, so worker/meta-capi.js never sends Meta an event for it. The
// page does the same for the browser Pixel (public/js/meta-pixel.js, lib/us/privacy.js). GA4 is not affected.
//
// The signal: the browser's own Sec-GPC: 1 request header, or the checkout page saying privacy.gpc (it reads
// navigator.globalPrivacyControl), whichever arrives.

export const honorsGpc = (env = {}) => String(env.HONOR_GPC ?? "true").trim().toLowerCase() !== "false";

export const gpcRequested = (request, body) =>
  request?.headers?.get?.("sec-gpc")?.trim() === "1" || (body && typeof body === "object" && body.privacy?.gpc === true);

// Marks the order and drops any attribution an earlier attempt of the same checkout left.
export async function recordGpc(db, orderId, { now = () => new Date().toISOString() } = {}) {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO order_privacy (order_id, gpc, created_at) VALUES (?, 1, ?)").bind(orderId, now()),
    db.prepare("DELETE FROM order_attribution WHERE order_id = ?").bind(orderId),
  ]);
}

// True when Meta must not hear about this order. A database without the table yet (before migration 0010) has none.
export async function gpcOptedOut(env, orderId) {
  if (!orderId || !honorsGpc(env)) return false;
  try {
    return Boolean(await env.DB.prepare("SELECT 1 AS yes FROM order_privacy WHERE order_id = ? AND gpc = 1").bind(orderId).first());
  } catch {
    return false;
  }
}
