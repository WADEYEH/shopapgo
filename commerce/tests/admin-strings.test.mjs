// The back office in Chinese and English (D49, M9-24): every word the pages use is in public/admin/strings.js in both
// languages, with the same {holes}; and every state the Worker can report has its words.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const ADMIN = new URL("../../public/admin/", import.meta.url);
const read = (file) => readFile(new URL(file, ADMIN), "utf8");
// Imported as a module from its text: the page files are plain browser modules.
const { STRINGS } = await import(`data:text/javascript,${encodeURIComponent(await read("strings.js"))}`);
const holes = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every entry has Chinese and English, and the two use the same {holes}", () => {
  for (const [key, entry] of Object.entries(STRINGS)) {
    for (const lang of ["zh", "en"]) {
      const text = entry[lang];
      assert.ok(typeof text === "function" || (typeof text === "string" && text.trim()), `${key}.${lang} is missing`);
    }
    if (typeof entry.zh === "string" && typeof entry.en === "string") assert.deepEqual(holes(entry.zh), holes(entry.en), `${key}: different holes`);
    if (typeof entry.zh === "string") assert.ok(!/[A-Za-z]{4,}/.test(entry.zh.replace(/\{\w+\}|Airwallex|PayPal|Amazon|Email|Google|Cloudflare|Resend|Seller Central|United States|Access|Hold|PAYPAL_WEBHOOK_ID|https|CSV|SKU|UPS|USPS|FedEx|APGO|shopapgo|www|Hold|PR/g, "")) || ["order.unitedStates"].includes(key), `${key}: Chinese text has untranslated English: ${entry.zh}`);
  }
});

test("every word the page code asks for is there", async () => {
  const files = (await readdir(ADMIN)).filter((file) => file.endsWith(".js") && file !== "strings.js");
  const used = new Set();
  for (const file of files) {
    for (const match of (await read(file)).matchAll(/\bt\(\s*"([^"]+)"/g)) used.add(match[1]);
  }
  const html = await read("index.html");
  for (const match of html.matchAll(/data-t(?:-label|-placeholder)?="([^"]+)"/g)) used.add(match[1]);
  const missing = [...used].filter((key) => !(key in STRINGS));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 150, `only ${used.size} keys found: the scan is broken`);
});

test("every state the Worker reports has its words", async () => {
  const families = {
    payment: ["paid", "review", "disputed", "refund_failed", "partly_refunded", "refunded", "cancelled", "awaiting"],
    shipping: ["review", "cooling_off", "waiting", "with_amazon", "out_of_stock", "not_sent", "on_hold", "shipped", "cancelled"],
    "orders.view": ["all", "to_ship", "review", "problems", "disputes", "shipped", "cancelled"],
    "orders.hint": ["all", "to_ship", "review", "problems", "disputes", "shipped", "cancelled"],
    "orders.col": ["order", "date", "customer", "total", "method", "payment", "shipping", "items", "todo", "time"],
    "orders.stat": ["today", "month", "toShip", "shipTime", "refunds"],
    todo: ["review", "dispute", "disputeBy", "stockout", "not_sent", "refund_failed"],
    attention: ["review", "not_sent", "stockout", "no_tracking", "disputes", "refunds", "returned", "emails", "addresses"],
    pipeline: ["coolingOff", "waiting", "withAmazon", "shippedThisWeek"],
    "dashboard.kpi": ["today", "month", "average", "refunded"],
    health: ["airwallex", "paypal", "email", "amazon", "address", "schedule", "digest"],
    role: ["owner", "member"],
    cancelReason: ["customer_request", "out_of_stock", "full_refund", "chargeback", "review_rejected", "other"],
    hold: ["review", "refund", "dispute"],
    progress: ["paid", "cooling", "amazon", "shipped"],
    "mcf.status": ["submitting", "submitted", "shipped", "failed", "rejected"],
    "mcf.check": ["ok", "mismatch", "unreadable"],
    "mcf.cancel": ["requested", "skipped", "failed"],
    "mcf.submit": ["submitted", "failed", "duplicate", "skipped"],
    refundStatus: ["RECEIVED", "ACCEPTED", "SETTLED", "FAILED"],
    addressCheck: ["verified", "corrected", "kept_original", "no_unit_confirmed", "unverified"],
    "products.col": ["product", "status", "stock", "price", "sold", "refunds"],
    "amazon.holdStep": ["config", "create", "check", "cancel"],
    "checkouts.status": ["all", "open", "expired"],
    "messages.email": ["sent", "skipped", "failed", "pending"],
    "email.delivery": ["accepted", "delivered", "bounced", "complained", "suppressed", "failed", "review", "retry"],
    "email.kind": ["confirmation", "shipment", "cancelled"],
    nav: ["dashboard", "orders", "checkouts", "products", "customers", "messages", "reports", "activity", "members"],
    "customers.sort": ["last", "orders", "spent", "name"],
    "customers.col": ["customer", "phone", "place", "orders", "spent", "last", "marketing"],
    "privacy.kind": ["access", "delete"],
    "privacy.outcome": ["exported", "deleted", "other"],
    "privacy.blocker": ["open_order", "dispute", "refund", "email"],
    "attention.privacy": ["access", "delete", "action"],
    "refund.reason": ["customer_request", "returned", "damaged", "not_received", "out_of_stock", "goodwill", "other"],
    "refund.status": ["requesting", "requested", "failed", "not_cancelled"],
    "refund.why": ["not_paid", "dispute_open", "nothing_left"],
    "reports.preset": ["today", "7d", "30d", "month", "last_month", "year", "custom"],
    "reports.kpi": ["gross", "refunds", "net", "orders", "average"],
    "reports.export": ["orders", "payments"],
    "packages.status": ["IN_TRANSIT", "DELIVERED", "RETURNING", "RETURNED", "UNDELIVERABLE", "RETURN_RECEIVED_IN_FC"],
    action: ["customer.exported", "customer.erased", "privacy.request_recorded", "privacy.request_closed", "export.orders", "export.payments"],
  };
  const missing = Object.entries(families).flatMap(([family, values]) => values.map((value) => `${family}.${value}`)).filter((key) => !(key in STRINGS));
  for (const kind of families.attention) for (const suffix of ["action", "clear"]) if (!(`attention.${kind}.${suffix}` in STRINGS)) missing.push(`attention.${kind}.${suffix}`);
  const health = { airwallex: ["ok", "off"], paypal: ["ok", "warn", "off"], email: ["ok", "off"], amazon: ["ok", "warn", "off"], address: ["ok", "warn", "off"], schedule: ["ok", "warn"], digest: ["ok", "off"] };
  for (const [key, statuses] of Object.entries(health)) for (const status of statuses) if (!(`health.${key}.${status}` in STRINGS)) missing.push(`health.${key}.${status}`);
  // Every action the Worker writes to the activity log.
  const worker = new URL("../worker/", import.meta.url);
  const sources = await Promise.all((await readdir(worker)).filter((file) => file.endsWith(".js")).map((file) => readFile(new URL(file, worker), "utf8")));
  const actions = new Set(sources.flatMap((source) => [...source.matchAll(/["'`]((?:mcf|order|product|member|access_list)\.[a-z_.]+)["'`]/g)].map((m) => m[1])));
  for (const outcome of ["opened", "won", "lost"]) actions.add(`order.dispute_${outcome}`);
  actions.add("staging.refund.check");
  for (const action of actions) if (!(`action.${action}` in STRINGS)) missing.push(`action.${action}`);
  assert.deepEqual([...new Set(missing)], []);
});
