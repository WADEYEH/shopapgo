// Operator-only negative API checks. No arbitrary amount/recipient, no production
// mode, no successful refund workflow and no financial retry queue.
import { apiBase, AirwallexError, retrievePaymentIntent, createSandboxRefundProbe } from './airwallex.js';
import { allowedEmailRecipient } from './email-delivery.js';
import { syncOrderRefunds } from './refunds.js';
import { recordAudit } from './fulfillment.js';

export const sandboxRefundChecksEnabled = env => env.SITE_ENV === 'staging' && env.AIRWALLEX_ENV === 'demo'
  && apiBase(env) === 'https://api.sandbox.airwallex.com';

export async function runSandboxRefundCheck(env,order,scenario) {
  if (!sandboxRefundChecksEnabled(env) || !allowedEmailRecipient(env,order.email)
    || order.status !== 'paid' || !order.payment_intent_id || !['above_limit','fully_refunded'].includes(scenario)) {
    return { outcome:'blocked',detail:'Only approved, paid sandbox test orders support these fixed negative checks.' };
  }
  const intent = await retrievePaymentIntent(env,order.payment_intent_id);
  if (intent.id !== order.payment_intent_id || intent.merchant_order_id !== order.id || intent.status !== 'SUCCEEDED'
    || intent.currency !== order.currency || Math.round(Number(intent.amount)*100) !== order.total_cents) {
    return { outcome:'blocked',detail:'Current payment identity, captured amount or status could not be verified.' };
  }
  if (scenario === 'fully_refunded') {
    const view = await syncOrderRefunds(env,order);
    if (view.refundedCents < order.total_cents || view.pendingCents) return {outcome:'blocked',detail:'This payment is not fully refunded at the provider.'};
  }
  const payload = {payment_intent_id:order.payment_intent_id,request_id:`check/${scenario}/${order.id}`,
    amount:scenario === 'above_limit' ? (order.total_cents+100)/100 : 1,reason:'Sandbox negative refund test only'};
  let result;
  try {
    await createSandboxRefundProbe(env,payload);
    result={outcome:'unexpected',detail:'Provider accepted an invalid refund request; stop and review Airwallex.',scenario};
  } catch (error) {
    if (!(error instanceof AirwallexError)) throw error;
    const code = /^[\w.-]{1,100}$/.test(error.code || '') ? error.code : 'unknown';
    const expected = scenario === 'above_limit' ? ['amount_above_limit'] : ['amount_above_limit','invalid_status_for_operation','operation_not_supported'];
    const passed = error.status === 400 && expected.includes(code);
    result={outcome:passed ? 'rejected' : 'unverified',scenario,httpStatus:error.status,code,
      detail:passed ? 'Airwallex rejected the fixed invalid request. No refund was created.' : 'The expected rejection was not proven; review provider access and response.'};
  }
  await recordAudit(env.DB,{orderId:order.id,actor:'admin',action:'staging.refund.check',detail:result});
  return result;
}
