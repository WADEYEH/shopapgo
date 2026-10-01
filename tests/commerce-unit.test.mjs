import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { PRODUCTS, QuoteError, TAX_RATES_BPS, quote, toMajor } from "../worker/catalog.js";
import { ORDER_ID_PATTERN, maskEmail, newOrderId, validateCheckout } from "../worker/checkout.js";
import { verifyWebhookSignature } from "../worker/airwallex.js";
import { applyIntentStatus, publicOrder } from "../worker/orders.js";

const validBody = {
  contact: { email: "Shopper@Example.com", marketingOptIn: true },
  shipping: { firstName: "Ada", lastName: "Lee", street: "1 Main St", city: "Austin", state: "tx", zip: "78701" },
  method: "express",
};

test("quote prices lines, shipping and totals on the server in cents", () => {
  const result = quote([{ sku: "d204", qty: 2 }, { sku: "D215", qty: 1 }], { method: "express" });
  assert.equal(result.subtotalCents, PRODUCTS.d204.priceCents * 2 + PRODUCTS.d215.priceCents);
  assert.equal(result.shippingCents, 900);
  assert.equal(result.taxCents, null, "tax is unknown until a state is supplied");
  assert.equal(result.totalCents, result.subtotalCents + 900);
  assert.deepEqual(result.lines.map((l) => [l.id, l.qty]), [["d204", 2], ["d215", 1]]);
});

test("quote merges duplicate SKUs and ignores client-sent prices", () => {
  const result = quote([{ sku: "d204", qty: 1, priceCents: 1 }, { sku: "d204", qty: 2 }]);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].qty, 3);
  assert.equal(result.lines[0].unitCents, PRODUCTS.d204.priceCents);
});

test("quote rejects empty carts, unknown SKUs and bad quantities", () => {
  assert.throws(() => quote([]), (e) => e instanceof QuoteError && e.code === "empty_cart");
  assert.throws(() => quote([{ sku: "x999", qty: 1 }]), { code: "unknown_sku" });
  assert.throws(() => quote([{ sku: "d204", qty: 0 }]), { code: "invalid_qty" });
  assert.throws(() => quote([{ sku: "d204", qty: 1.5 }]), { code: "invalid_qty" });
  assert.throws(() => quote([{ sku: "d204", qty: 6 }, { sku: "d204", qty: 5 }]), { code: "invalid_qty" });
  assert.throws(() => quote([{ sku: "d204", qty: 1 }], { method: "drone" }), { code: "invalid_shipping" });
  assert.throws(() => quote([{ sku: "d204", qty: 1 }], { state: "ZZ" }), { code: "invalid_state" });
});

test("tax applies the configured state rate and rounds to the cent", () => {
  TAX_RATES_BPS.CA = 725;
  try {
    const result = quote([{ sku: "d204", qty: 1 }], { state: "CA" });
    assert.equal(result.taxCents, Math.round((PRODUCTS.d204.priceCents * 725) / 10000));
    assert.equal(result.totalCents, result.subtotalCents + result.shippingCents + result.taxCents);
    assert.equal(quote([{ sku: "d204", qty: 1 }], { state: "OR" }).taxCents, 0);
  } finally {
    delete TAX_RATES_BPS.CA;
  }
});

test("toMajor converts cents to Airwallex major units without float drift", () => {
  assert.equal(toMajor(5480), 54.8);
  assert.equal(toMajor(1), 0.01);
  assert.equal(toMajor(1999), 19.99);
});

test("validateCheckout normalizes input and rejects bad addresses", () => {
  const result = validateCheckout(validBody);
  assert.equal(result.email, "shopper@example.com");
  assert.equal(result.shipping.state, "TX");
  assert.equal(result.marketingOptIn, true);
  assert.equal(result.method, "express");

  const bad = (patch, code) =>
    assert.throws(() => validateCheckout({ ...validBody, shipping: { ...validBody.shipping, ...patch } }), { code });
  bad({ zip: "7870" }, "invalid_zip");
  bad({ state: "ZZ" }, "invalid_state");
  bad({ street: " " }, "invalid_address");
  assert.throws(() => validateCheckout({ ...validBody, contact: { email: "nope" } }), { code: "invalid_email" });
});

test("order ids are unguessable and match the public pattern", () => {
  const ids = new Set(Array.from({ length: 200 }, newOrderId));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, ORDER_ID_PATTERN);
  assert.equal(maskEmail("shopper@example.com"), "s••••••@example.com");
});

function sign(secret, timestamp, body) {
  return createHmac("sha256", secret).update(`${timestamp}${body}`).digest("hex");
}

test("webhook signature: accepts valid, rejects tampered, stale or unsigned requests", async () => {
  const secret = "whsec_test";
  const rawBody = JSON.stringify({ id: "evt_1", name: "payment_intent.succeeded" });
  const now = 1_780_000_000_000;
  const timestamp = String(now - 1000);
  const signature = sign(secret, timestamp, rawBody);

  assert.equal(await verifyWebhookSignature({ secret, timestamp, signature, rawBody, now }), true);
  assert.equal(await verifyWebhookSignature({ secret, timestamp, signature, rawBody: rawBody.replace("1", "2"), now }), false);
  assert.equal(await verifyWebhookSignature({ secret: "other", timestamp, signature, rawBody, now }), false);
  assert.equal(await verifyWebhookSignature({ secret, timestamp, signature, rawBody, now: now + 10 * 60_000 }), false);
  assert.equal(await verifyWebhookSignature({ secret, timestamp, signature: null, rawBody, now }), false);
  assert.equal(await verifyWebhookSignature({ secret: "", timestamp, signature, rawBody, now }), false);
});

// Minimal D1 stand-in covering the statements orders.js issues.
function fakeDb(order) {
  const rows = new Map([[order.id, { ...order }]]);
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return rows.get(args[0]) ?? null;
            },
            async run() {
              if (sql.startsWith("UPDATE orders SET status")) {
                const [status, paidAt, updatedAt, id] = args;
                const row = rows.get(id);
                if (row?.status === "pending") Object.assign(row, { status, paid_at: paidAt, updated_at: updatedAt });
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const storedOrder = {
  id: "APGO-US-0123456789AB",
  status: "pending",
  email: "shopper@example.com",
  currency: "USD",
  total_cents: 5480,
  payment_intent_id: "int_1",
  lines_json: JSON.stringify([{ id: "d204", sku: "D204", name: "APGO Atomic Colored Glaze", routine: "dry", size: "300 mL", qty: 1, unitCents: 2990, lineCents: 2990 }]),
  shipping_method: "standard",
  subtotal_cents: 5480,
  shipping_cents: 0,
  tax_cents: 0,
  created_at: "2026-09-30T00:00:00.000Z",
};

test("a succeeded intent matching the stored total marks the order paid", async () => {
  const db = fakeDb(storedOrder);
  const status = await applyIntentStatus(db, { id: "int_1", merchant_order_id: storedOrder.id, status: "SUCCEEDED", amount: 54.8, currency: "USD" });
  assert.equal(status, "paid");
  assert.equal(db.rows.get(storedOrder.id).status, "paid");
});

test("a succeeded intent with a different amount is parked for review", async () => {
  const db = fakeDb(storedOrder);
  const status = await applyIntentStatus(db, { id: "int_1", merchant_order_id: storedOrder.id, status: "SUCCEEDED", amount: 1, currency: "USD" });
  assert.equal(status, "review");
});

test("intents that do not belong to the order are ignored", async () => {
  const db = fakeDb(storedOrder);
  assert.equal(await applyIntentStatus(db, { id: "int_other", merchant_order_id: storedOrder.id, status: "SUCCEEDED", amount: 54.8, currency: "USD" }), null);
  assert.equal(db.rows.get(storedOrder.id).status, "pending");
});

test("publicOrder hides the address and masks the email", () => {
  const view = publicOrder({ ...storedOrder, shipping_json: JSON.stringify({ street: "1 Main St" }) });
  assert.equal(view.email, "s••••••@example.com");
  assert.ok(!JSON.stringify(view).includes("Main St"));
  assert.ok(!("unitCents" in view.lines[0]));
});
