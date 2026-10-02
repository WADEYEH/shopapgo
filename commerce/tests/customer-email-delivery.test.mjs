import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { createD1, sqliteAvailable } from './helpers/d1.mjs';
import { sendCustomerEmail, retryCustomerEmail, scheduledCustomerEmailRetry } from '../worker/customer-email.js';
import { getDelivery, handleResendWebhook, verifyResendSignature } from '../worker/email-delivery.js';
import { getOrder, getOrderEmails } from '../worker/orders.js';
import worker from '../worker/index.js';

const skip = !(await sqliteAvailable());
const ID = 'APGO-US-0123456789AB';
const SECRET = `whsec_${Buffer.from('test-only-webhook-key').toString('base64')}`;
async function setup(extra = {}) {
  const db = await createD1();
  await db.prepare('INSERT INTO orders(id,status,email,shipping_json,shipping_method,lines_json,currency,subtotal_cents,shipping_cents,tax_cents,total_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(ID, 'paid', 'buyer@example.com', JSON.stringify({firstName:'Test',lastName:'Buyer',street:'123 Test',city:'Seattle',state:'WA',zip:'98109'}), 'standard', JSON.stringify([{name:'Test product',sku:'D215',qty:1,lineCents:2490}]), 'USD',2490,0,0,2490,new Date().toISOString(),new Date().toISOString()).run();
  return { db, order: await getOrder(db, ID), env: {DB:db,RESEND_API_KEY:'test-key',CUSTOMER_EMAIL_FROM:'APGO <orders@apgo.tw>',RESEND_WEBHOOK_SECRET:SECRET, ...extra} };
}
function signed(type, providerId='mail_test', overrides={}) {
  const raw = JSON.stringify({type,created_at:new Date().toISOString(),data:{email_id:providerId,to:['private@example.com'],...overrides.data}});
  const id = overrides.id || `msg_${crypto.randomUUID()}`;
  const ts = overrides.timestamp || String(Math.floor(Date.now()/1000));
  const signature = createHmac('sha256', Buffer.from(SECRET.slice(6),'base64')).update(`${id}.${ts}.${raw}`).digest('base64');
  return new Request('https://store.example/api/webhooks/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':ts,'svix-signature':`v1,${signature}`,...overrides.headers},body:overrides.raw || raw});
}
const accepted = async () => Response.json({id:'mail_test'});

test('transport records provider ID and API acceptance separately from delivery; repeated sends are harmless', {skip}, async()=>{
  const {db,env,order}=await setup(); let calls=0;
  const result=await sendCustomerEmail(env,order,'confirmation',{fetchImpl:async(_url,init)=>{calls++;assert.equal(init.headers['Idempotency-Key'],`apgo/${ID}/confirmation`);return accepted();}});
  assert.equal(result.status,'sent');
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'accepted');
  assert.equal((await getOrderEmails(db,ID))[0].providerId,'mail_test');
  assert.equal((await sendCustomerEmail(env,order,'confirmation',{fetchImpl:()=>assert.fail('duplicate')})).status,'duplicate');
  assert.equal((await retryCustomerEmail(env,order,'confirmation',{fetchImpl:()=>assert.fail('already accepted')})).status,'blocked');
  assert.equal(calls,1);
});

test('concurrent sends take one DB lease and make one provider request', {skip}, async()=>{
  const {env,order}=await setup();let calls=0;let finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  const fetchImpl=async()=>{calls++;await pending;return accepted();};
  const work=[sendCustomerEmail(env,order,'confirmation',{fetchImpl}),sendCustomerEmail(env,order,'confirmation',{fetchImpl})];
  await new Promise(resolve=>setTimeout(resolve,20));finish();
  const results=await Promise.all(work);
  assert.equal(calls,1);assert.deepEqual(results.map(r=>r.status).sort(),['duplicate','sent']);
});

test('timeout retries use exactly the same body/key; honor backoff and stop outside safe idempotency window', {skip}, async()=>{
  const {db,env,order}=await setup();const t=Date.now();const requests=[];
  const failed=async(_url,init)=>{requests.push({key:init.headers['Idempotency-Key'],body:init.body});throw new Error('secret-key private@example.com');};
  await sendCustomerEmail(env,order,'confirmation',{nowMs:t,fetchImpl:failed});
  const row=await getDelivery(db,ID,'confirmation');assert.equal(row.status,'retry');assert.ok(!row.detail.includes('secret-key'));
  assert.equal((await retryCustomerEmail(env,order,'confirmation',{nowMs:t+1,fetchImpl:()=>assert.fail('too early')})).status,'duplicate');
  await retryCustomerEmail({...env,CUSTOMER_EMAIL_FROM:'Changed <new@example.com>'},order,'confirmation',{nowMs:t+60_001,fetchImpl:failed});
  assert.deepEqual(requests[0],requests[1]);
  assert.equal((await retryCustomerEmail(env,order,'confirmation',{nowMs:t+23*60*60_000,fetchImpl:()=>assert.fail('expired')})).status,'blocked');
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'review');
});

test('429 Retry-After, permanent 401, invalid success response and exhausted retry budget', {skip}, async()=>{
  const {db,env,order}=await setup();let t=Date.now();
  await sendCustomerEmail(env,order,'confirmation',{nowMs:t,fetchImpl:async()=>new Response('{}',{status:429,headers:{'Retry-After':'600'}})});
  assert.equal(Date.parse((await getDelivery(db,ID,'confirmation')).next_attempt_at),t+600_000);
  await retryCustomerEmail(env,order,'confirmation',{nowMs:t+600_001,fetchImpl:async()=>new Response('{}',{status:401})});
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'failed');
  // Manual repair of credentials may retry inside the safe window. Cron never retries permanent 4xx.
  await retryCustomerEmail(env,order,'confirmation',{nowMs:t+600_002,fetchImpl:async()=>Response.json({})});
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'retry');
  for(let i=0;i<3;i++){t=Date.parse((await getDelivery(db,ID,'confirmation')).next_attempt_at)+1;await retryCustomerEmail(env,order,'confirmation',{nowMs:t,fetchImpl:async()=>new Response('{}',{status:503})});}
  assert.equal((await getDelivery(db,ID,'confirmation')).attempts,6);
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'failed');
  await retryCustomerEmail(env,order,'confirmation',{nowMs:t+60_000,fetchImpl:()=>assert.fail('exhausted')});
});

test('staging recipient allowlist fails closed; skipped emails can be explicitly retried after configuration', {skip}, async()=>{
  const {db,env,order}=await setup({SITE_ENV:'staging'});
  assert.equal((await sendCustomerEmail(env,order,'confirmation',{fetchImpl:()=>assert.fail('not allowed')})).status,'skipped');
  assert.equal(await getDelivery(db,ID,'confirmation'),null);
  assert.equal((await retryCustomerEmail({...env,CUSTOMER_EMAIL_TEST_RECIPIENTS:'buyer@example.com'},order,'confirmation',{fetchImpl:accepted})).status,'sent');
  assert.equal((await sendCustomerEmail(env,{...order,status:'pending'},'confirmation',{fetchImpl:()=>assert.fail('unpaid')})).status,'blocked');
  assert.equal((await retryCustomerEmail(env,order,'shipment')).status,'blocked');
});

test('signed delivered/bounced/complaint events are idempotent, resist reordering and suppress future sends', {skip}, async()=>{
  const {db,env,order}=await setup();await sendCustomerEmail(env,order,'confirmation',{fetchImpl:accepted});
  const delivered=signed('email.delivered');const copy=delivered.clone();
  assert.equal((await handleResendWebhook(delivered,env)).status,200);
  assert.equal((await (await handleResendWebhook(copy,env)).json()).duplicate,true);
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'delivered');
  await Promise.all([handleResendWebhook(signed('email.bounced'),env),handleResendWebhook(signed('email.sent'),env)]);
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'bounced');
  await handleResendWebhook(signed('email.complained'),env);
  await handleResendWebhook(signed('email.delivered'),env);
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'complained');
  assert.equal((await sendCustomerEmail(env,order,'shipment',{shipment:{carrier:'Test',trackingNumber:'T1'},fetchImpl:()=>assert.fail('suppressed')})).status,'blocked');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM customer_email_suppressions').get().n,1);
  assert.ok(!JSON.stringify(db.raw.prepare('SELECT * FROM customer_email_events').all()).includes('private@example.com'));
});

test('provider event arriving before send response is retained and reconciled', {skip}, async()=>{
  const {db,env,order}=await setup();
  await sendCustomerEmail(env,order,'confirmation',{fetchImpl:async()=>{await handleResendWebhook(signed('email.delivered'),env);return accepted();}});
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'delivered');
});

test('webhook verification uses official Svix vector, rejects tampering/stale/future/missing signatures and oversized data', {skip}, async()=>{
  const vector=new Request('https://x.example',{headers:{'svix-id':'msg_loFOjxBNrRLzqYUf','svix-timestamp':'1731705121','svix-signature':'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0='}});
  assert.equal(await verifyResendSignature(vector,'whsec_plJ3nmyCDGBKInavdOK15jsl','{"event_type":"ping","data":{"success":true}}',1731705121000),true);
  const {env}=await setup();
  for(const req of [signed('email.delivered','mail_test',{raw:'{}'}),signed('email.delivered','mail_test',{timestamp:String(Math.floor(Date.now()/1000)-600)}),signed('email.delivered','mail_test',{timestamp:String(Math.floor(Date.now()/1000)+600)}),new Request('https://x.example',{method:'POST',body:'{}'})])assert.equal((await handleResendWebhook(req,env)).status,400);
  assert.equal((await handleResendWebhook(new Request('https://x.example',{method:'POST',body:'x'.repeat(65*1024)}),env)).status,413);
});

test('retry API requires admin and CSRF guards; staging webhook reaches signature verification without Basic login', {skip}, async()=>{
  const {env}=await setup({ADMIN_TOKEN:'test-admin-secret-long-enough'});const url=`https://store.example/admin/api/orders/${ID}/emails/confirmation/retry`;
  assert.equal((await worker.fetch(new Request(url,{method:'POST'}),env)).status,401);
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json',Origin:'https://evil.example'},body:'{}'}),env)).status,403);
  const result=await worker.fetch(new Request(url,{method:'POST',headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'},body:'{}'}),{...env,CUSTOMER_EMAIL_ENABLED:'false'});
  assert.equal(result.status,200);assert.equal((await result.json()).email.status,'skipped');
  const hook=await worker.fetch(new Request('https://store.example/api/webhooks/resend',{method:'POST',body:'{}'}),{...env,SITE_ENV:'staging'});
  assert.equal(hook.status,400);assert.equal((await hook.json()).error.code,'invalid_signature');
});

test('cron disabled does not send; enabled recovers a stale lease without sending legacy skipped rows', {skip}, async()=>{
  const {db,env,order}=await setup();await sendCustomerEmail(env,order,'confirmation',{fetchImpl:async()=>new Response('{}',{status:503})});
  await db.prepare("UPDATE order_email_delivery SET status = 'sending', lease_until = ?, next_attempt_at = NULL WHERE order_id = ?").bind(new Date(Date.now()-1000).toISOString(),ID).run();
  const original=globalThis.fetch;let calls=0;
  try{globalThis.fetch=async()=>{calls++;return accepted();};await scheduledCustomerEmailRetry(env);assert.equal(calls,0);await scheduledCustomerEmailRetry({...env,CUSTOMER_EMAIL_RETRY_CRON:'true'});assert.equal(calls,1);}finally{globalThis.fetch=original;}
  assert.equal((await getDelivery(db,ID,'confirmation')).status,'accepted');
});
