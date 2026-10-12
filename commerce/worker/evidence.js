// Dispute evidence (M5-12, D57): one printable page in English with what a card issuer or PayPal asks for — the order,
// the payment, the delivery with tracking, the emails sent to the customer, their messages, and the store's policies.
// Opened from the order page, printed or saved as PDF, then uploaded in the Airwallex or PayPal dispute. Internal notes
// and staff names are never on it. Every export is in the order's timeline.
// GET /admin/api/orders/:id/evidence (worker/admin.js).
import { adminOrder } from "./orders.js";
import { getOrderPayment } from "./orders.js";
import { disputesForOrder } from "./disputes.js";
import { recordAudit } from "./fulfillment.js";

const SITE = "https://www.shopapgo.com";
const POLICIES = [["Terms of Sale", "/terms"], ["Returns & Refunds", "/returns"], ["Shipping", "/shipping"], ["Privacy", "/privacy"]];
const EMAIL_NAMES = { confirmation: "Order confirmation", shipment: "Shipping confirmation with tracking", cancelled: "Cancellation notice", "delay:stockout": "Delay notice" };

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (cents, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents ?? 0) / 100);
const when = (value) => (value ? new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");
const rows = (pairs) => pairs.filter(Boolean).map(([label, value]) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`).join("");
const table = (head, body) => `<table class="list"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.join("") || `<tr><td colspan="${head.length}">None</td></tr>`}</tbody></table>`;
const emailName = (kind) => (kind.startsWith("refund:") ? "Refund notice" : kind.startsWith("address:") ? "Shipping address updated" : kind.startsWith("duplicate:") ? "Second payment refunded" : EMAIL_NAMES[kind] ?? kind);

export async function disputeEvidence(env, orderId, actor, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const order = await adminOrder(db, orderId);
  if (!order || !order.paidAt) return null;
  const s = order.shipping ?? {};
  const provider = (await getOrderPayment(db, orderId))?.provider ?? "airwallex";
  const disputes = await disputesForOrder(db, orderId);
  const packages = order.fulfillment?.packages ?? [];
  const { results: messages } = s.erased ? { results: [] } : await db
    .prepare("SELECT created_at, message FROM contact_messages WHERE lower(trim(email)) = lower(trim(?)) ORDER BY created_at")
    .bind(order.email)
    .all();
  const cancellation = await db.prepare("SELECT reason_code, created_at FROM order_cancellations WHERE order_id = ?").bind(orderId).first();
  await recordAudit(db, { orderId, action: "order.evidence_exported", actor: actor.id, detail: {} });

  const address = s.erased ? "Deleted at the customer's request (privacy)" : [
    `${esc(s.firstName)} ${esc(s.lastName)}`, esc(s.street), s.street2 && esc(s.street2), `${esc(s.city)}, ${esc(s.state)} ${esc(s.zip)}`, "United States",
  ].filter(Boolean).join("<br>");
  const check = s.addressCheck?.status;
  const delivered = packages.filter((pkg) => pkg.deliveredAt || pkg.status === "DELIVERED");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Order ${esc(order.id)} — evidence</title>
<style>
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; max-width: 820px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 28px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  p.meta { color: #555; margin: 0 0 16px; } table { border-collapse: collapse; width: 100%; } th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid #eee; }
  table.facts th { width: 34%; color: #444; font-weight: 600; } table.list thead th { background: #f4f4f4; font-weight: 600; }
  .note { color: #555; font-size: 13px; } @media print { body { margin: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head><body>
<h1>Order ${esc(order.id)} — transaction and delivery record</h1>
<p class="meta">APGO (${esc(SITE)}) · prepared ${esc(when(nowMs))}</p>

<h2>Summary</h2>
<table class="facts">${rows([
    ["Order number", esc(order.id)],
    ["Order placed", esc(when(order.createdAt))],
    ["Paid", esc(when(order.paidAt))],
    ["Amount charged", `${esc(money(order.totalCents, order.currency))} (items ${esc(money(order.subtotalCents))}, shipping ${esc(money(order.shippingCents))}, tax ${esc(money(order.taxCents))})`],
    ["Payment", `${provider === "paypal" ? "PayPal" : "Card through Airwallex"}, reference ${esc(order.paymentIntentId)}`],
    ["Refunded so far", esc(money(order.refunds?.refundedCents ?? 0, order.currency))],
    ["Delivery", delivered.length && delivered.length === packages.length ? `Delivered ${esc(when(delivered.map((pkg) => pkg.deliveredAt).sort().at(-1)))}`
      : delivered.length ? `${delivered.length} of ${packages.length} packages delivered (first ${esc(when(delivered.map((pkg) => pkg.deliveredAt).sort()[0]))})`
      : order.fulfillment ? `Shipped ${esc(when(order.fulfillment.shippedAt))}` : "Not shipped"],
    cancellation && ["Cancelled", esc(when(cancellation.created_at))],
    ...disputes.map((d) => [`Dispute ${esc(d.id)}`, `${esc(d.provider === "paypal" ? "PayPal" : "Airwallex")} · ${esc(d.reason || "no reason given")} · ${esc(money(d.amountCents))} · ${esc(d.status)}`]),
  ])}</table>

<h2>Customer and shipping address</h2>
<table class="facts">${rows([
    ["Name", s.erased ? "Deleted (privacy request)" : `${esc(s.firstName)} ${esc(s.lastName)}`],
    ["Email", s.erased ? "Deleted (privacy request)" : esc(order.email)],
    ["Phone", s.erased ? "Deleted (privacy request)" : esc(s.phone || "—")],
    ["Ship to", address],
    check && ["Address check", esc({ verified: "Verified with Google Address Validation", corrected: "Corrected and confirmed by the customer", kept_original: "Customer kept the address as typed", no_unit_confirmed: "Customer confirmed there is no unit number", unverified: "Not verified" }[check] ?? check)],
  ])}</table>

<h2>Items</h2>
${table(["Item", "SKU", "Qty", "Amount"], order.lines.map((line) => `<tr><td>${esc(line.name)} (${esc(line.size)})</td><td>${esc(line.sku)}</td><td>${esc(line.qty)}</td><td>${esc(money(line.lineCents, order.currency))}</td></tr>`))}

<h2>Shipping and tracking</h2>
${order.fulfillment ? `<table class="facts">${rows([
    ["Shipped", esc(when(order.fulfillment.shippedAt))],
    ["Fulfilled by", order.fulfillment.shippedBy === "mcf" ? "Amazon (Multi-Channel Fulfillment)" : "APGO"],
    ["Carrier and tracking", esc(`${order.fulfillment.carrier} ${order.fulfillment.trackingNumber}`)],
  ])}</table>` : "<p>Not shipped.</p>"}
${packages.length ? table(["Package", "Carrier", "Tracking number", "Latest status", "Delivered"], packages.map((pkg, index) => `<tr><td>${index + 1}</td><td>${esc(pkg.carrier)}</td><td>${esc(pkg.trackingNumber)}${pkg.trackingUrl ? `<br><span class="note">${esc(pkg.trackingUrl)}</span>` : ""}</td><td>${esc(pkg.status || "—")}</td><td>${esc(pkg.deliveredAt ? when(pkg.deliveredAt) : "—")}</td></tr>`)) : ""}
${packages.some((pkg) => pkg.events?.length) ? `<h2>Carrier tracking events</h2>${table(["Package", "Time", "Event", "Place"], packages.flatMap((pkg, index) => (pkg.events ?? []).map((event) => `<tr><td>${index + 1}</td><td>${esc(event.at ? when(event.at) : "—")}</td><td>${esc(event.status)}</td><td>${esc([event.city, event.state].filter(Boolean).join(", "))}</td></tr>`)))}` : ""}

<h2>Emails sent to the customer</h2>
${table(["Email", "Status", "Time"], (order.emails ?? []).filter((mail) => !mail.kind.startsWith("refund:team-")).map((mail) => `<tr><td>${esc(emailName(mail.kind))}</td><td>${esc(mail.deliveryStatus === "delivered" ? "Delivered" : mail.deliveryStatus === "accepted" || mail.status === "sent" ? "Sent" : mail.deliveryStatus || mail.status)}</td><td>${esc(when(mail.updatedAt))}</td></tr>`))}

<h2>Messages from the customer</h2>
${table(["Time", "Message (Contact us form)"], messages.map((m) => `<tr><td>${esc(when(m.created_at))}</td><td>${esc(m.message)}</td></tr>`))}

<h2>Store policies shown at checkout</h2>
<ul>${POLICIES.map(([name, path]) => `<li>${esc(name)}: ${esc(SITE + path)}</li>`).join("")}</ul>
<p class="note">Prepared by APGO from its order records. Times are in UTC.</p>
</body></html>`;
  return { filename: `apgo-evidence-${order.id}.html`, html };
}
