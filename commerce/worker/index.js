// APGO US store Worker: serves the site (the Next.js export, ../out) as static assets and owns /api/* and /admin/*.
//
//   GET  /api/store/config         prices, shipping methods, tax status, wallets, states, Airwallex env, Airwallex Pay, PayPal
//   GET  /.well-known/apple-developer-merchantid-domain-association   Apple Pay domain check
//   POST /api/cart/quote           server-priced cart ({ items, state?, method? })
//   POST /api/checkout/address     shipping-address check before payment ({ shipping }; worker/address-check.js)
//   POST /api/checkout/session     the checkout (reused via checkoutId, D36) + its Airwallex PaymentIntent
//   POST /api/checkout/paypal/order   the checkout (reused via checkoutId) + a PayPal Orders v2 order
//   POST /api/checkout/paypal/capture capture a PayPal order and settle the store order
//   GET  /api/orders/:id           public order status (syncs pending intents / PayPal)
//   GET  /api/health               200 while the cron keeps running, 503 once it has stopped (worker/cron.js)
//   POST /api/webhooks/airwallex   signed Airwallex events
//   POST /api/webhooks/paypal      verified PayPal events (PAYMENT.CAPTURE.COMPLETED)
//   POST /api/webhooks/resend      Svix-signed Resend email delivery events
//   GET  /admin/api/orders[/:id]   order back office data (admin auth)
//   GET  /admin/api/airwallex/intents/:id, /admin/api/paypal/orders/:id   read-only provider lookups (admin auth)
//   POST /admin/api/orders/:id/ship  mark a paid order shipped + email the customer (admin auth)
//   POST /admin/api/orders/:id/mcf/submit | /mcf/sync, POST /admin/api/mcf/sync   Amazon MCF retry / status sync (admin auth)
//   GET  /admin/                   order back office page (admin auth)
//
// Meta Conversions API (production only, worker/meta-capi.js): InitiateCheckout when the PaymentIntent is created and Purchase
// when an order turns paid; a cron re-sends failures. All of it is skipped unless META_DATASET_ID is set.
//
// With ADMIN_HOST set, /admin* is served only on that hostname and the store hostnames answer 404 (worker/hosts.js).
//
// Starting a payment, the address check and quotes are limited per client address (worker/rate-limit.js): 429 when over.

import { QuoteError, publicConfig, quote, toMajor } from "./catalog.js";
import { PricingConfigError, resolvePricing, storeReadiness, taxStatus } from "./pricing.js";
import { APPLE_PAY_DOMAIN_PATH, paymentMethodOptions, serveAppleDomainAssociation } from "./wallets.js";
import { ORDER_ID_PATTERN, newOrderId, validateCheckout, validatePaypalCheckout } from "./checkout.js";
import { ADDRESS_MESSAGES, checkAddress, enforceAddress } from "./address-check.js";
import { checkShipping } from "../../lib/shop/address-rules.mjs";
import { recordPaymentFailure, publicPaymentFailure } from "./payment-failures.js";
import {
  AirwallexError,
  createPaymentIntent,
  retrievePaymentIntent,
  verifyWebhookSignature,
} from "./airwallex.js";
import {
  PaypalError,
  approveUrlFrom,
  capturePaypalOrder,
  checkoutReturnUrls,
  createPaypalOrder,
  inspectPaypalOrder,
  isUsableUsShipping,
  paypalOrderIdFromWebhook,
  paypalOrderPayload,
  retrievePaypalOrder,
  storeOrderIdFromWebhook,
  storefrontOrigin,
  verifyPaypalWebhook,
  paypalWebhookHeaders,
} from "./paypal.js";
import {
  attachPaymentIntent,
  attachPaypalOrder,
  getOrder,
  getOrderByPaypalOrderId,
  getOrderPayment,
  insertOrder,
  publicOrder,
  recordWebhookEvent,
  settleIntent,
  settlePaypalOrder,
} from "./orders.js";
import { processMessageJob } from "./customer-email.js";
import { handleRefundEvent } from './refunds.js';
import { handleResendWebhook } from "./email-delivery.js";
import { attributionMetadata, readAttribution, saveAttribution } from "./meta-attribution.js";
import { metaEnabled, metaEventId } from "./meta-capi.js";
import { runMetaEvent, settleFollowUps } from "./after-payment.js";
import { applyRefundsToOrder } from "./order-core.js";
import { handleAdmin, isAdminPath } from "./admin.js";
import { fail, json } from "./http.js";
import { withStaging } from "./staging.js";
import { siteRedirect } from "./redirects.js";
import { handleContact } from "./contact.js";
import { adminHost, hostSplit, isAdminHost, withNoindex } from "./hosts.js";
import { rateLimited } from "./rate-limit.js";
import { cronHealth, runScheduled } from "./cron.js";
import { checkoutIdForPayment, checkoutPayments, nextRequestId, paymentBelongsTo, recordPayment, reusableCheckout, updateCheckout, voidPayments } from "./checkouts.js";

async function readBody(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object") throw new QuoteError("invalid_json", "Request body must be a JSON object.");
  return body;
}

async function handleQuote(request, env) {
  const body = await readBody(request);
  return json(quote(body.items, { state: body.state || undefined, method: body.method || undefined }, resolvePricing(env)));
}

// The checkout page asks before showing the payment step: { status, suggestion?, message? }. status is valid,
// suggest (with Google's spelling), missing_unit, undeliverable, po_box or unverified (no answer; the order goes ahead).
async function handleAddressCheck(request, env) {
  const body = await readBody(request);
  const { value, errors } = checkShipping(body.shipping);
  const [field, message] = Object.entries(errors)[0] ?? [];
  if (field) throw new QuoteError("invalid_address", message, field);
  const result = await checkAddress(env, value);
  const messages = { undeliverable: ADDRESS_MESSAGES.undeliverable, missing_unit: ADDRESS_MESSAGES.missingUnit, po_box: ADDRESS_MESSAGES.poBox };
  return json({
    status: result.status,
    ...(result.suggestion ? { suggestion: result.suggestion } : {}),
    ...(messages[result.status] ? { message: messages[result.status] } : {}),
  });
}

// The checkout for this purchase (D36, M3 §5): the one the page sent back while it can still be paid, brought up to
// date with what the shopper now has; otherwise a new one. Its id becomes the order number.
async function openCheckout(env, checkoutId, { checkout, quote: priced }) {
  const existing = await reusableCheckout(env.DB, checkoutId);
  if (existing && (await updateCheckout(env.DB, existing.id, { checkout, quote: priced }))) return { orderId: existing.id, reused: true };
  const orderId = newOrderId();
  await insertOrder(env.DB, { id: orderId, checkout, quote: priced });
  return { orderId, reused: false };
}

// A PaymentIntent of this checkout that can still be paid for this amount, so a retry, a refresh or a second tab pays
// the same one (M3-13). { intent } to reuse, { settled: status } when one already succeeded or is processing, or null.
async function reusableIntent(env, orderId, priced, services) {
  const order = await getOrder(env.DB, orderId);
  const candidates = (await checkoutPayments(env.DB, order))
    .filter((p) => p.provider === "airwallex" && p.status === "open" && p.amount_cents === priced.totalCents && p.currency === priced.currency);
  for (const payment of candidates) {
    let intent;
    try {
      intent = await retrievePaymentIntent(env, payment.ref);
    } catch (error) {
      if (!(error instanceof AirwallexError)) throw error;
      continue;
    }
    if (intent.status === "SUCCEEDED") {
      await afterSettle(await settleIntent(env.DB, intent), services);
      return { settled: (await getOrder(env.DB, orderId)).status };
    }
    if (["PENDING", "REQUIRES_CAPTURE"].includes(intent.status)) return { settled: "processing" };
    if (["REQUIRES_PAYMENT_METHOD", "REQUIRES_CUSTOMER_ACTION"].includes(intent.status) && intent.client_secret && Math.abs(Number(intent.amount) - toMajor(priced.totalCents)) < 0.005) {
      return { intent };
    }
  }
  return null;
}

async function handleCheckoutSession(request, env, services) {
  // With AIRWALLEX_ENV=prod the store stays closed until the owner sets
  // PRICING_APPROVED=true, so placeholder prices/shipping/tax cannot go live by accident.
  if (!storeReadiness(env).ready) {
    return fail(503, "store_not_ready", "Checkout isn't open yet. Please check back soon.");
  }
  const body = await readBody(request);
  const checkout = validateCheckout(body);
  const priced = quote(body.items, { state: checkout.shipping.state, method: checkout.method }, resolvePricing(env));
  // Checked again here, whatever the page did: an undeliverable address never reaches a payment.
  checkout.shipping.addressCheck = await enforceAddress(env, checkout.shipping, checkout.addressReview);
  const origin = new URL(request.url).origin;
  const { orderId, reused } = await openCheckout(env, body.checkoutId, { checkout, quote: priced });

  // Meta attribution (production only): browser-sent ids, cookies, IP and user agent, validated and stored per order.
  // Optional by design: a missing or malformed `attribution` never affects checkout.
  const attribution = await captureAttribution(env, request, body, orderId, origin);

  // Reuse the checkout's PaymentIntent while it can still be paid for this amount; a paid or processing checkout
  // sends the page to the order (no new payment).
  const reusable = reused ? await reusableIntent(env, orderId, priced, services) : null;
  if (reusable?.settled) return json({ orderId, quote: priced, settled: reusable.settled });
  let intent = reusable?.intent ?? null;
  if (!intent) {
    // A new amount (or nothing payable left): older intents of this checkout are cancelled first.
    await voidPayments(env, orderId, { provider: "airwallex" });
    // Stable per payment object: if our request times out and is retried, Airwallex returns the original intent
    // instead of creating a second one.
    const requestId = await nextRequestId(env.DB, orderId, "airwallex");
    intent = await createPaymentIntent(env, {
      request_id: requestId,
      amount: toMajor(priced.totalCents),
      currency: priced.currency,
      merchant_order_id: orderId,
      return_url: `${origin}/checkout?order=${orderId}`,
      customer: {
        email: checkout.email,
        first_name: checkout.shipping.firstName,
        last_name: checkout.shipping.lastName,
      },
      order: {
        type: "physical_goods",
        products: priced.lines.map((line) => ({
          code: line.sku,
          name: line.name,
          quantity: line.qty,
          unit_price: toMajor(line.unitCents),
          type: "physical_good",
        })),
        shipping: {
          first_name: checkout.shipping.firstName,
          last_name: checkout.shipping.lastName,
          shipping_method: priced.shippingMethod,
          fee_amount: toMajor(priced.shippingCents),
          address: {
            country_code: "US",
            state: checkout.shipping.state,
            city: checkout.shipping.city,
            street: [checkout.shipping.street, checkout.shipping.street2].filter(Boolean).join(", "),
            postcode: checkout.shipping.zip,
          },
        },
      },
      // Same capture mode for cards, wallets, and Airwallex Pay (Drop-in confirms
      // `airwallex_pay` against this intent; no extra create fields are required).
      payment_method_options: paymentMethodOptions(env),
      // Attribution first so it can never overwrite source / order_id.
      metadata: { ...attributionMetadata(attribution), source: "apgo-us-store", order_id: orderId },
    });
    // A failure above leaves the checkout open: the next try reuses it (and it expires after 24 hours if never paid).
    await recordPayment(env.DB, { provider: "airwallex", ref: intent.id, checkoutId: orderId, amountCents: priced.totalCents, currency: priced.currency });
    await attachPaymentIntent(env.DB, orderId, intent.id);
  }
  await deferred(services, runMetaEvent(env, orderId, "InitiateCheckout"));

  return json({
    orderId,
    quote: priced,
    intent: { id: intent.id, clientSecret: intent.client_secret, currency: intent.currency },
  });
}

function eventIdsFor(orderId) {
  return { initiateCheckout: metaEventId("InitiateCheckout", orderId), purchase: metaEventId("Purchase", orderId) };
}

async function handlePaypalCreate(request, env, services) {
  if (!storeReadiness(env).ready) {
    return fail(503, "store_not_ready", "Checkout isn't open yet. Please check back soon.");
  }
  const body = await readBody(request);
  const pricing = resolvePricing(env);
  const checkout = validatePaypalCheckout(body, { requireShipping: taxStatus(pricing) === "configured" });
  const priced = quote(body.items, { state: checkout.shipping.state || undefined, method: checkout.method }, pricing);
  // Our address is checked like a card checkout. An address PayPal supplies later meets the same rules before capture.
  if (checkout.shippingSource === "checkout") {
    checkout.shipping.addressCheck = await enforceAddress(env, checkout.shipping, checkout.addressReview);
  }
  const origin = storefrontOrigin(request, env);
  const { orderId } = await openCheckout(env, body.checkoutId, { checkout, quote: priced });
  const { returnUrl, cancelUrl } = checkoutReturnUrls(origin, orderId);
  await captureAttribution(env, request, body, orderId, origin);

  // Each PayPal button press is a new PayPal order; the checkout's older ones can no longer be captured.
  await voidPayments(env, orderId, { provider: "paypal" });
  const paypalOrder = await createPaypalOrder(
    env,
    paypalOrderPayload({ orderId, quote: priced, checkout, returnUrl, cancelUrl }),
    await nextRequestId(env.DB, orderId, "paypal"),
  );
  await recordPayment(env.DB, { provider: "paypal", ref: paypalOrder.id, checkoutId: orderId, amountCents: priced.totalCents, currency: priced.currency });
  await attachPaypalOrder(env.DB, orderId, paypalOrder.id);
  await deferred(services, runMetaEvent(env, orderId, "InitiateCheckout"));

  return json({
    orderId,
    quote: priced,
    paypal: { id: paypalOrder.id, status: paypalOrder.status, approveUrl: approveUrlFrom(paypalOrder) },
    eventIds: eventIdsFor(orderId),
  });
}

async function settleFromPaypalSnapshot(env, db, paypalOrder, services) {
  const inspected = inspectPaypalOrder(paypalOrder);
  return afterSettle(
    await settlePaypalOrder(db, {
      orderId: inspected.storeOrderId,
      paypalOrderId: inspected.paypalOrderId,
      status: inspected.status,
      amountValue: inspected.amountValue,
      currency: inspected.currency,
      shipping: inspected.shipping,
      captureId: inspected.captureId,
    }),
    services,
  );
}

async function captureAndSettle(env, storeOrder, paypalOrderId, services) {
  let paypalOrder = await retrievePaypalOrder(env, paypalOrderId);
  let inspected = inspectPaypalOrder(paypalOrder);

  if (inspected.status !== "COMPLETED") {
    if (!isUsableUsShipping(inspected.shipping)) {
      return { error: fail(400, "missing_shipping_address", "PayPal did not return a usable US shipping address."), inspected, order: storeOrder };
    }
    paypalOrder = await capturePaypalOrder(env, paypalOrderId, `${storeOrder.id}-capture`);
    inspected = inspectPaypalOrder(paypalOrder);
  }

  await settleFromPaypalSnapshot(env, env.DB, paypalOrder, services);
  const order = await getOrder(env.DB, storeOrder.id);
  return { order, inspected, paypalOrder };
}

async function handlePaypalCapture(request, env, services) {
  if (!storeReadiness(env).ready) {
    return fail(503, "store_not_ready", "Checkout isn't open yet. Please check back soon.");
  }
  const body = await readBody(request);
  const paypalOrderId = String(body.paypalOrderId ?? body.paypal_order_id ?? "").trim();
  const orderId = String(body.orderId ?? body.order_id ?? "").trim();
  if (!paypalOrderId && !orderId) return fail(400, "invalid_request", "Provide paypalOrderId or orderId.");
  if (orderId && !ORDER_ID_PATTERN.test(orderId)) return fail(404, "not_found", "Order not found.");

  const storeOrder = paypalOrderId
    ? await getOrderByPaypalOrderId(env.DB, paypalOrderId)
    : await getOrder(env.DB, orderId);
  if (!storeOrder) return fail(404, "not_found", "Order not found.");
  if (orderId && storeOrder.id !== orderId) return fail(400, "invalid_request", "PayPal order does not match this store order.");
  // Without a PayPal order id (the return URL), the checkout's newest PayPal order.
  const latestPaypal = (await checkoutPayments(env.DB, storeOrder)).find((p) => p.provider === "paypal");
  const paypalId = paypalOrderId || latestPaypal?.ref || "";
  if (!paypalId || !(await paymentBelongsTo(env.DB, "paypal", paypalId, storeOrder.id))) {
    return fail(400, "invalid_request", "PayPal order does not match this store order.");
  }
  const payment = await env.DB.prepare("SELECT status FROM checkout_payments WHERE provider = 'paypal' AND ref = ?").bind(paypalId).first();
  // Already paid with this PayPal order: report it (a return page reload, a double click).
  const paidByThis = storeOrder.payment_intent_id === paypalId
    && (payment?.status === "succeeded" || (!payment && ["paid", "review"].includes(storeOrder.status)));
  if (paidByThis) {
    return json({ orderId: storeOrder.id, status: storeOrder.status, paypal: { id: paypalId, status: "COMPLETED" }, eventIds: eventIdsFor(storeOrder.id) });
  }
  // Never capture for a checkout that is paid another way or expired, nor a PayPal order that was replaced: no second
  // charge to refund later (M3-13).
  if (storeOrder.status !== "pending") {
    return storeOrder.status === "expired"
      ? fail(409, "checkout_expired", "This checkout expired. Your cart is still here; please start the payment again.")
      : fail(409, "checkout_closed", "This order is already paid.");
  }
  if (payment?.status === "voided") return fail(409, "payment_replaced", "This PayPal payment was replaced by a newer one. Please choose PayPal again.");

  const result = await captureAndSettle(env, storeOrder, paypalId, services);
  if (result.error) return result.error;
  return json({
    orderId: result.order.id,
    status: result.order.status,
    paypal: { id: result.inspected.paypalOrderId, status: result.inspected.status },
    eventIds: eventIdsFor(result.order.id),
  });
}

// Stores the attribution for a new order. Returns it (for the PaymentIntent metadata) or null when Meta is off / on error.
async function captureAttribution(env, request, body, orderId, origin) {
  if (!metaEnabled(env)) return null;
  try {
    const attribution = readAttribution(body, request, { fallbackUrl: `${origin}/checkout?order=${orderId}` });
    await saveAttribution(env.DB, orderId, attribution);
    return attribution;
  } catch (error) {
    console.error("order_attribution_error", { orderId, reason: error?.name });
    return null;
  }
}

// Runs background work after the response when the runtime allows it (ctx.waitUntil), otherwise inline.
function deferred(services, work) {
  if (services?.ctx?.waitUntil) {
    services.ctx.waitUntil(work);
    return undefined;
  }
  return work;
}

// After a payment settled (worker/after-payment.js): notification, confirmation email, Purchase event and the
// cooling-off queue for a paid order; a team alert for one that needs review. After the response when possible.
function afterSettle(settled, { env, ctx, adminOrigin }) {
  if (!settled?.changed && !settled?.duplicate) return undefined;
  const work = settleFollowUps(settled, { env, adminOrigin });
  if (ctx?.waitUntil) {
    ctx.waitUntil(work);
    return undefined;
  }
  return work;
}

async function handleOrder(orderId, env, services) {
  if (!ORDER_ID_PATTERN.test(orderId)) return fail(404, "not_found", "Order not found.");
  let order = await getOrder(env.DB, orderId);
  if (!order) return fail(404, "not_found", "Order not found.");

  // Covers shoppers who land here before the webhook arrives (e.g. after a 3DS redirect).
  if (order.status === "pending" && order.payment_intent_id) {
    const payment = await getOrderPayment(env.DB, orderId);
    if (payment?.provider === "paypal") {
      try {
        const result = await captureAndSettle(env, order, order.payment_intent_id, services);
        if (!result.error && result.order) order = result.order;
        return json({ ...publicOrder(order), paymentStatus: result.inspected?.status || order.status, paymentFailure: await publicPaymentFailure(env.DB, order) });
      } catch (error) {
        if (!(error instanceof PaypalError)) throw error;
        console.error("paypal_retrieve_failed", { orderId, status: error.status, code: error.code });
      }
    } else {
      try {
        const intent = await retrievePaymentIntent(env, order.payment_intent_id);
        const settled = await settleIntent(env.DB, intent);
        await afterSettle(settled, services);
        if (settled.status && settled.status !== order.status) order = await getOrder(env.DB, orderId);
        return json({ ...publicOrder(order), paymentStatus: intent.status, paymentFailure: await publicPaymentFailure(env.DB, order) });
      } catch (error) {
        if (!(error instanceof AirwallexError)) throw error;
        // Fall back to the stored status; the webhook will settle it.
        console.error("airwallex_retrieve_failed", { orderId, status: error.status, code: error.code });
      }
    }
  }
  return json({ ...publicOrder(order), paymentFailure: await publicPaymentFailure(env.DB, order) });
}

async function handleWebhook(request, env, services) {
  const rawBody = await request.text();
  const signed = {
    secret: env.AIRWALLEX_WEBHOOK_SECRET,
    timestamp: request.headers.get("x-timestamp"),
    signature: request.headers.get("x-signature"),
    rawBody,
  };
  const fresh = await verifyWebhookSignature(signed);
  // A genuine but late delivery (Airwallex retries for ~3 days) is still useful, but
  // its age means the body can't be trusted as current state: use it only to find the
  // PaymentIntent and read the real state from the Retrieve API.
  const late = !fresh && (await verifyWebhookSignature({ ...signed, toleranceMs: Infinity }));
  if (!fresh && !late) return fail(400, "invalid_signature", "Webhook signature verification failed.");

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return fail(400, "invalid_payload", "Webhook body is not valid JSON.");
  }
  if (!event || typeof event !== "object" || !event.id || !event.name) {
    return fail(400, "invalid_payload", "Webhook body is not an Airwallex event.");
  }

  // settleIntent only moves orders out of "pending", so redeliveries are harmless.
  // The event is recorded after processing so a failed write is retried by
  // Airwallex instead of being skipped as a duplicate.
  const snapshot = event.data?.object;
  const refundMessage = await handleRefundEvent(env, event);
  await recordPaymentFailure(env.DB, event);
  if (String(event.name).startsWith("payment_intent.") && snapshot?.id && snapshot.merchant_order_id) {
    let intent = snapshot;
    if (late) {
      const checkoutId = await checkoutIdForPayment(env.DB, "airwallex", snapshot.id);
      intent = checkoutId ? await retrievePaymentIntent(env, snapshot.id) : null;
    }
    if (intent) await afterSettle(await settleIntent(env.DB, intent), services);
  }
  const firstDelivery = await recordWebhookEvent(env.DB, event);
  // A full refund before shipping cancels the order; any other refund holds it (worker/order-core.js).
  if (refundMessage?.order) await applyRefundsToOrder(env, refundMessage.order.id, { adminUrl: `${services.adminOrigin}/admin/` });
  if (refundMessage?.kind) {
    const kinds = refundMessage.kind.startsWith('refund:failed:')
      ? [refundMessage.kind,refundMessage.kind.replace('refund:failed:','refund:team-failed:')]
      : [refundMessage.kind];
    const work = Promise.all(kinds.map(kind => processMessageJob(env,refundMessage.order,kind)));
    if (services.ctx?.waitUntil) services.ctx.waitUntil(work);
    else await work;
  }
  return json({ received: true, duplicate: !firstDelivery });
}

const PAYPAL_SETTLE_EVENTS = new Set(["PAYMENT.CAPTURE.COMPLETED", "CHECKOUT.ORDER.COMPLETED"]);

async function handlePaypalWebhook(request, env, services) {
  const rawBody = await request.text();
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return fail(400, "invalid_payload", "Webhook body is not valid JSON.");
  }
  if (!event || typeof event !== "object" || !event.id || !event.event_type) {
    return fail(400, "invalid_payload", "Webhook body is not a PayPal event.");
  }

  const verified = await verifyPaypalWebhook(env, { headers: paypalWebhookHeaders(request), event });
  if (!verified) return fail(400, "invalid_signature", "Webhook signature verification failed.");

  if (PAYPAL_SETTLE_EVENTS.has(String(event.event_type))) {
    const paypalOrderId = paypalOrderIdFromWebhook(event);
    const customId = storeOrderIdFromWebhook(event);
    const storeOrder = paypalOrderId
      ? await getOrderByPaypalOrderId(env.DB, paypalOrderId)
      : customId && ORDER_ID_PATTERN.test(customId)
        ? await getOrder(env.DB, customId)
        : null;
    if (storeOrder?.payment_intent_id) {
      try {
        const paypalOrder = await retrievePaypalOrder(env, paypalOrderId || storeOrder.payment_intent_id);
        await settleFromPaypalSnapshot(env, env.DB, paypalOrder, services);
      } catch (error) {
        if (!(error instanceof PaypalError)) throw error;
        console.error("paypal_webhook_retrieve_failed", { orderId: storeOrder.id, status: error.status, code: error.code });
      }
    }
  }

  const firstDelivery = await recordWebhookEvent(env.DB, event);
  return json({ received: true, duplicate: !firstDelivery });
}

async function route(request, env, services) {
  const { pathname } = new URL(request.url);
  const { method } = request;

  const limited = await rateLimited(request, env);
  if (limited) return limited;
  if (pathname === "/api/health" && method === "GET") {
    const health = await cronHealth(env);
    return json(health, health.ok ? 200 : 503);
  }
  if (pathname === "/api/store/config" && method === "GET") return json(publicConfig(env));
  if (pathname === "/api/cart/quote" && method === "POST") return handleQuote(request, env);
  if (pathname === "/api/checkout/address" && method === "POST") return handleAddressCheck(request, env);
  if (pathname === "/api/contact" && method === "POST") return handleContact(request, env);
  if (pathname === "/api/checkout/session" && method === "POST") return handleCheckoutSession(request, env, services);
  if (pathname === "/api/checkout/paypal/order" && method === "POST") return handlePaypalCreate(request, env, services);
  if (pathname === "/api/checkout/paypal/capture" && method === "POST") return handlePaypalCapture(request, env, services);
  if (pathname === "/api/webhooks/airwallex" && method === "POST") return handleWebhook(request, env, services);
  if (pathname === "/api/webhooks/resend" && method === "POST") return handleResendWebhook(request, env);
  if (pathname === "/api/webhooks/paypal" && method === "POST") return handlePaypalWebhook(request, env, services);
  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && method === "GET") return handleOrder(decodeURIComponent(orderMatch[1]), env, services);
  return fail(404, "not_found", "Not found.");
}

async function handleRequest(request, env, ctx) {
  const split = hostSplit(request, env);
  if (split) return split;
  const response = await dispatch(request, env, ctx);
  return isAdminHost(request, env) ? withNoindex(response) : response;
}

async function dispatch(request, env, ctx) {
  const { pathname, origin } = new URL(request.url);
  if (isAdminPath(pathname)) return handleAdmin(request, env);
  if (pathname === APPLE_PAY_DOMAIN_PATH) return serveAppleDomainAssociation(request, env);
  if (!pathname.startsWith("/api/")) return siteRedirect(request) || env.ASSETS.fetch(request);
  try {
    // "New paid order" notifications link to the back-office hostname when one is configured.
    const adminOrigin = adminHost(env) ? `https://${adminHost(env)}` : origin;
    return await route(request, env, { env, ctx, origin, adminOrigin });
  } catch (error) {
    if (error instanceof QuoteError) {
      return json({ error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) } }, 400);
    }
    if (error instanceof PricingConfigError) {
      // A broken PRICING_JSON must never fall back to other numbers: refuse and say why in the log.
      console.error("pricing_config_invalid", { reason: error.message });
      return fail(503, "store_not_ready", "Checkout is temporarily unavailable. Please try again later.");
    }
    if (error instanceof AirwallexError) {
      console.error("airwallex_error", { status: error.status, code: error.code, source: error.source, message: error.message });
      return fail(502, "payment_provider_error", "We couldn't start the payment. Please try again.");
    }
    if (error instanceof PaypalError) {
      console.error("paypal_error", { status: error.status, code: error.code, message: error.message });
      return fail(502, "payment_provider_error", "We couldn't start the payment. Please try again.");
    }
    console.error("unhandled_error", error);
    return fail(500, "server_error", "Something went wrong. Please try again.");
  }
}

export default {
  // SITE_ENV=staging adds noindex headers, /robots.txt and the Basic-auth gate (worker/staging.js); otherwise a pass-through.
  fetch(request, env, ctx) {
    return withStaging(request, env, () => handleRequest(request, env, ctx));
  },
  // Cron (worker/cron.js). Three independent jobs, each a no-op unless enabled: Amazon MCF status sync (MCF_SYNC_CRON=true),
  // customer email retries (customer email configured) and the Meta CAPI re-send of failed events (META_DATASET_ID set).
  // One failing job never cancels the others; every run is recorded for GET /api/health and pings HEALTHCHECK_PING_URL.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },
};
