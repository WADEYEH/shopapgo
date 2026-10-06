// Read-only payment lookups for the back office, for answering "why didn't my payment go through?":
//   GET /admin/api/airwallex/intents/:id   one Airwallex PaymentIntent and its latest attempt
//   GET /admin/api/paypal/orders/:id       one PayPal Orders v2 order and its captures
// The caller (worker/admin.js) checks admin auth first. Nothing is written, and only what support needs is returned:
// no card details, no payer name or email (only whether the payee email is set and the payer's country).
// First written on the landing deploy of 2026-10-05 without being committed; ported here with tests.
import { retrievePaymentIntent } from "./airwallex.js";
import { paypalConfigured, paypalEnvName, retrievePaypalOrder } from "./paypal.js";
import { fail, json } from "./http.js";

export const AIRWALLEX_INTENT_LOOKUP = /^\/admin\/api\/airwallex\/intents\/([A-Za-z0-9_]+)$/;
export const PAYPAL_ORDER_LOOKUP = /^\/admin\/api\/paypal\/orders\/([A-Z0-9]{5,40})$/;

const PROVIDER_MESSAGE_MAX = 400;

// Provider errors keep their status and code so support can tell "no such payment" from "provider down".
function providerFailure(provider, error, headers) {
  if (error?.status === 404) return fail(404, "not_found", `${provider} has no payment with this id.`, headers);
  return json({
    error: {
      code: "provider_error",
      message: `${provider} lookup failed.`,
      providerStatus: error?.status ?? null,
      providerCode: error?.code ?? null,
      providerMessage: String(error?.message || error).slice(0, PROVIDER_MESSAGE_MAX),
      details: error?.details ?? error?.source ?? null,
    },
  }, 502, headers);
}

export async function lookupAirwallexIntent(env, intentId, headers) {
  if (!(env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY)) return fail(503, "airwallex_not_configured", "Airwallex is not configured.", headers);
  try {
    const intent = await retrievePaymentIntent(env, intentId);
    const attempt = intent.latest_payment_attempt || null;
    return json({
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      merchant_order_id: intent.merchant_order_id,
      latest_payment_attempt: attempt ? {
        id: attempt.id,
        status: attempt.status,
        payment_method: attempt.payment_method?.type ?? null,
        failure_code: attempt.failure_code ?? null,
        failure_details: attempt.failure_details || null,
        provider_original_response_code: attempt.provider_original_response_code || null,
        provider_original_response_msg: String(attempt.provider_original_response_msg || "").slice(0, PROVIDER_MESSAGE_MAX),
      } : null,
      next_action: intent.next_action?.type ?? null,
      created_at: intent.created_at,
      updated_at: intent.updated_at,
    }, 200, headers);
  } catch (error) {
    return providerFailure("Airwallex", error, headers);
  }
}

export async function lookupPaypalOrder(env, paypalOrderId, headers) {
  if (!paypalConfigured(env)) return fail(503, "paypal_not_configured", "PayPal is not configured.", headers);
  try {
    const order = await retrievePaypalOrder(env, paypalOrderId);
    const source = order.payment_source?.paypal;
    return json({
      env: paypalEnvName(env),
      id: order.id,
      status: order.status,
      intent: order.intent,
      create_time: order.create_time,
      update_time: order.update_time,
      purchase_units: (order.purchase_units || []).map((unit) => ({
        reference_id: unit.reference_id,
        amount: unit.amount,
        payee: unit.payee ? { merchant_id: unit.payee.merchant_id, email_set: Boolean(unit.payee.email_address) } : null,
        shipping_country: unit.shipping?.address?.country_code ?? null,
        shipping_type: unit.shipping?.type ?? null,
        captures: (unit.payments?.captures || []).map((capture) => ({ status: capture.status, status_details: capture.status_details })),
      })),
      payer_country: order.payer?.address?.country_code ?? source?.address?.country_code ?? null,
      payment_source_keys: Object.keys(order.payment_source || {}),
      experience: source?.experience_context ?? null,
      links: (order.links || []).map((link) => link.rel),
    }, 200, headers);
  } catch (error) {
    return providerFailure("PayPal", error, headers);
  }
}
