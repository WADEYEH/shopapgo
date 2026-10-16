// The Hold test order (D26, M6-15): proves on the day of the cutover that the real Amazon connection accepts our orders,
// without shipping anything. An owner presses "Hold test order" in the back office:
//
//   1. create   one unit of the first store product, fulfillment_action "Hold", to a fixed test address. Amazon keeps it
//               on hold (stock reserved, nothing picked) until it is released in Seller Central, which nobody does;
//   2. check    read it back and compare items and address with what was sent (the same check as every order, M6-16),
//               and that Amazon really has it on hold;
//   3. cancel   cancel it, then read it again. Amazon refuses a cancel sent a moment after the create ("System is busy,
//               another request for the same order is being processed", the cutover on 2026-10-16), so the test waits
//               first and tries again while Amazon says it is busy.
//
// Works whether or not automatic sending (MCF_AUTO_SUBMIT) is on: this is the check before turning it on. On staging the
// fake Amazon answers (worker/fake-amazon.js). If the cancel does not go through, the team is told to cancel it in Seller
// Central. Results are kept in mcf_hold_tests (no customer data).
import { McfError, cancelFulfillmentOrder, connectionProblem, createFulfillmentOrder, getFulfillmentOrder, mcfReadiness } from "./amazon-mcf.js";
import { compareAmazonCopy } from "./mcf.js";
import { alertTeam } from "./team-alerts.js";
import { PRODUCTS } from "./catalog.js";
import { adminHost } from "./hosts.js";

export const HOLD_TEST_ADDRESS = { name: "APGO Hold Test", addressLine1: "400 Broad St", city: "Seattle", stateOrRegion: "WA", postalCode: "98109" };
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const clip = (value, max) => String(value ?? "").slice(0, max);
const adminUrlOf = (env) => `${adminHost(env) ? `https://${adminHost(env)}` : "https://www.shopapgo.com"}/admin/`;
const reason = (error) => clip(error instanceof McfError ? error.message : error?.message ?? "unknown error", 200);

// Waits around the cancel (tests set them to 0).
export const HOLD_TEST_CANCEL = { firstWaitMs: 5000, retryWaitMs: 10000, attempts: 3 };
const sleep = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
const amazonBusy = (error) => /system is busy|another request for the same order/i.test(`${error?.message ?? ""} ${error?.details ?? ""}`);

async function cancelWhenAmazonIsFree(env, id) {
  await sleep(HOLD_TEST_CANCEL.firstWaitMs);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await cancelFulfillmentOrder(env, id);
    } catch (error) {
      if (!amazonBusy(error) || attempt >= HOLD_TEST_CANCEL.attempts) throw error;
      await sleep(HOLD_TEST_CANCEL.retryWaitMs);
    }
  }
}

async function save(db, id, outcome, steps, actor, at) {
  await db
    .prepare(
      `INSERT INTO mcf_hold_tests (id, outcome, steps_json, actor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET outcome = excluded.outcome, steps_json = excluded.steps_json, updated_at = excluded.updated_at`,
    )
    .bind(id, outcome, JSON.stringify(steps), actor, at, iso())
    .run();
}

export async function runHoldTest(env, { actor = "admin", nowMs = Date.now() } = {}) {
  const db = env.DB;
  const at = iso(nowMs);
  const id = `HOLDTEST-${at.replace(/[-:TZ.]/g, "").slice(0, 14)}`;
  const steps = [];
  const finish = async (outcome) => {
    await save(db, id, outcome, steps, actor, at);
    return { id, outcome, steps, at };
  };

  const config = mcfReadiness(env, null).config;
  const problem = connectionProblem(config);
  const product = Object.values(PRODUCTS)[0];
  const sku = config.skuMap[String(product.sku).toUpperCase()];
  if (problem || !sku) {
    steps.push({ step: "config", ok: false, detail: problem || `Missing Amazon SKU mapping for ${product.sku}.` });
    return finish("failed");
  }
  const input = { address: HOLD_TEST_ADDRESS, items: [{ sku, qty: 1 }] };
  await save(db, id, "running", steps, actor, at);

  try {
    const created = await createFulfillmentOrder(env, { orderId: id, address: input.address, items: input.items, tier: "STANDARD", action: "Hold" });
    steps.push({ step: "create", ok: true, detail: created.alreadyExists ? `Amazon already had ${id}.` : `Amazon accepted ${id} on hold (1 × ${sku}).` });
  } catch (error) {
    steps.push({ step: "create", ok: false, detail: `Amazon did not accept the order: ${reason(error)}` });
    return finish("failed");
  }

  let checkOk = false;
  try {
    const copy = await getFulfillmentOrder(env, id);
    const differences = copy ? compareAmazonCopy(input, copy) : null;
    const onHold = !copy?.action || copy.action.toLowerCase() === "hold";
    checkOk = Boolean(differences) && differences.length === 0 && onHold;
    steps.push({
      step: "check", ok: checkOk,
      detail: !copy ? "Amazon did not return the order." : !differences ? "Amazon's copy had no items or address to compare."
        : !onHold ? `Amazon has it as "${copy.action}", not on hold.` : differences.length ? differences.join("; ") : `Items and address match; status ${copy.status || "unknown"}, on hold.`,
    });
  } catch (error) {
    steps.push({ step: "check", ok: false, detail: `Reading it back failed: ${reason(error)}` });
  }

  let cancelOk = false;
  try {
    await cancelWhenAmazonIsFree(env, id);
    const after = await getFulfillmentOrder(env, id).catch(() => null);
    cancelOk = true;
    steps.push({ step: "cancel", ok: true, detail: `Cancelled; Amazon now shows ${after?.status || "the cancellation pending"}.` });
  } catch (error) {
    steps.push({ step: "cancel", ok: false, detail: `Cancelling failed: ${reason(error)}` });
    await alertTeam(env, {
      key: `hold-test-open:${id}`, kind: "hold_test_open", adminUrl: adminUrlOf(env),
      subject: `Hold test order ${id} is still open at Amazon`,
      lines: [`The Hold test order ${id} could not be cancelled (${reason(error)}).`, "It does not ship while on hold, but it reserves one unit: cancel it in Seller Central (Multi-Channel Fulfillment orders)."],
    });
  }
  return finish(checkOk && cancelOk ? "passed" : "failed");
}

export async function listHoldTests(db, limit = 5) {
  const { results } = await db.prepare("SELECT * FROM mcf_hold_tests ORDER BY created_at DESC LIMIT ?").bind(limit).all();
  return results.map((row) => ({ id: row.id, outcome: row.outcome, steps: JSON.parse(row.steps_json || "[]"), by: row.actor, at: row.created_at }));
}
