import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { quote } from "../worker/catalog.js";
import { recordPayment, updateCheckout } from "../worker/checkouts.js";
import { attachPaymentIntent, attachPaypalOrder, getOrder, insertOrder, settleIntent, settlePaypalOrder } from "../worker/orders.js";
import { buildMcfInput } from "../worker/mcf.js";

globalThis.fetch = async () => { throw new Error("Unexpected network request in security regression test"); };
const id = "APGO-US-000000000001";
const ref = "security-test-payment";
const shipping = { firstName: "Audit", lastName: "Example", street: "100 Example Ave", street2: "", city: "Austin", state: "TX", zip: "78701" };
const checkout = { email: "audit@example.invalid", shipping };
const priced = (qty) => quote([{ sku: "d215", qty }], { state: "TX" });

async function setup(provider, qty = 1) {
  const db = await createD1();
  await insertOrder(db, { id, checkout, quote: priced(qty) });
  await recordPayment(db, { provider, ref, checkoutId: id, amountCents: priced(qty).totalCents, currency: "USD" });
  return db;
}

const settle = (provider, db, extra = {}) => provider === "airwallex"
  ? settleIntent(db, { id: ref, merchant_order_id: id, status: "SUCCEEDED", amount: priced(1).totalCents / 100, currency: "USD", ...extra })
  : settlePaypalOrder(db, { orderId: id, paypalOrderId: ref, status: "COMPLETED", amountValue: (priced(1).totalCents / 100).toFixed(2), currency: "USD", shipping, captureId: "security-test-capture", ...extra });

// Pause after the real SELECT returns its snapshot. A second legitimate checkout request updates the live row
// before settlement resumes: no timers or guessed scheduling, and the production SQL still runs unmodified.
function afterSnapshot(db, change) {
  let changed = false;
  return { ...db, prepare(sql) {
    const statement = db.prepare(sql);
    if (sql !== "SELECT * FROM orders WHERE id = ?") return statement;
    const bind = statement.bind;
    statement.bind = (...args) => {
      const bound = bind(...args);
      const first = bound.first;
      bound.first = async () => {
        const snapshot = await first();
        if (!changed) { changed = true; await change(); }
        return snapshot;
      };
      return bound;
    };
    return statement;
  } };
}

for (const provider of ["airwallex", "paypal"]) {
  test(`${provider}: a checkout changed after the payment read cannot become a paid ten-item order`, async () => {
    const db = await setup(provider);
    const raced = afterSnapshot(db, () => updateCheckout(db, id, { checkout, quote: priced(10) }));
    const result = await settle(provider, raced);
    const order = await getOrder(db, id);
    assert.equal(result.status, "review");
    assert.equal(order.status, "review");
    assert.equal(order.total_cents, priced(10).totalCents);
    assert.equal(buildMcfInput(order, { skuMap: { D215: "test-sku" }, shippingMap: { STANDARD: "Standard" } }).items[0].qty, 10);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_email_jobs").get().n, 0);
    assert.equal(db.raw.prepare("SELECT status FROM checkout_payments WHERE ref = ?").get(ref).status, "succeeded");
  });

  test(`${provider}: a concurrent cart correction uses the current amount instead of a stale mismatch`, async () => {
    const db = await setup(provider, 10);
    const raced = afterSnapshot(db, () => updateCheckout(db, id, { checkout, quote: priced(1) }));
    const result = await settle(provider, raced);
    assert.equal(result.status, "paid");
    assert.equal(result.order.total_cents, priced(1).totalCents);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_email_jobs").get().n, 1);
    assert.equal((await settle(provider, db)).changed, false);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_email_jobs").get().n, 1);
  });

  test(`${provider}: payment recording failure rolls back the order and confirmation instruction`, async () => {
    const db = await setup(provider);
    db.raw.exec("CREATE TRIGGER fail_payment_record BEFORE UPDATE ON checkout_payments BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await assert.rejects(settle(provider, db), /test failure/);
    assert.equal((await getOrder(db, id)).status, "pending");
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_email_jobs").get().n, 0);
  });

  test(`${provider}: neither payment attachment overwrites an order waiting for review`, async () => {
    const db = await setup(provider);
    await settle(provider, db, { currency: "EUR" });
    assert.equal(await attachPaymentIntent(db, id, "replacement-card"), false);
    assert.equal(await attachPaypalOrder(db, id, "replacement-paypal"), false);
    assert.equal((await getOrder(db, id)).payment_intent_id, ref);
  });

  test(`${provider}: simultaneous observations settle and enqueue confirmation only once`, async () => {
    const db = await setup(provider);
    const results = await Promise.all([settle(provider, db), settle(provider, db)]);
    assert.equal(results.filter((result) => result.changed).length, 1);
    assert.ok(results.every((result) => !result.duplicate));
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_email_jobs").get().n, 1);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM checkout_payments WHERE status = 'succeeded'").get().n, 1);
  });

  test(`${provider}: confirmation queue failure also rolls back the payment record`, async () => {
    const db = await setup(provider);
    db.raw.exec("CREATE TRIGGER fail_confirmation BEFORE INSERT ON order_email_jobs BEGIN SELECT RAISE(ABORT, 'queue failure'); END");
    await assert.rejects(settle(provider, db), /queue failure/);
    assert.equal((await getOrder(db, id)).status, "pending");
    assert.equal(db.raw.prepare("SELECT status FROM checkout_payments WHERE ref = ?").get(ref).status, "open");
  });

  test(`${provider}: invalid provider amounts never create a paid order`, async () => {
    const db = await setup(provider);
    for (const amount of [NaN, Infinity, null, "", -1, 0, 37.981]) {
      await assert.rejects(settle(provider, db, provider === "airwallex" ? { amount } : { amountValue: amount }), /Invalid payment amount/);
    }
    assert.equal((await getOrder(db, id)).status, "pending");
  });
}

test("PayPal settlement retains the live checkout phone across a concurrent address update", async () => {
  const db = await setup("paypal");
  const raced = afterSnapshot(db, () => updateCheckout(db, id, { checkout: { ...checkout, shipping: { ...shipping, phone: "+15125550123" } }, quote: priced(1) }));
  const result = await settle("paypal", raced);
  assert.equal(result.status, "paid");
  assert.equal(JSON.parse(result.order.shipping_json).phone, "+15125550123");
});

