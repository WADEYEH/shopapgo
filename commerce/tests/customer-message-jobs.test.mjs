import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1 } from './helpers/d1.mjs';
import { getOrder, getOrderEmails } from '../worker/orders.js';
import { markShipped } from '../worker/fulfillment.js';
import { saveRefund } from '../worker/refunds.js';
import { processMessageJob, scheduledCustomerEmailRetry, retryCustomerEmail, sendCustomerEmail } from '../worker/customer-email.js';
import { getDelivery } from '../worker/email-delivery.js';

const ID='APGO-US-0123456789AB';
const at='2026-10-03T12:00:00.000Z';
const shipment={carrier:'TEST ONLY',trackingNumber:'NO-PARCEL',trackingUrl:null};
const refund=(patch={})=>({id:'rfd_first',payment_intent_id:'int_test',amount:1,currency:'USD',status:'ACCEPTED',created_at:at,updated_at:at,...patch});
async function setup(extra={}) {
  const db=await createD1();
  await db.prepare('INSERT INTO orders(id,status,email,shipping_json,shipping_method,lines_json,currency,subtotal_cents,shipping_cents,tax_cents,total_cents,payment_intent_id,created_at,updated_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(ID,'paid','buyer@example.com',JSON.stringify({firstName:'Test <script>',lastName:'Buyer',street:'private street',city:'Seattle',state:'WA',zip:'98109'}),'standard',JSON.stringify([{sku:'D215',qty:1,name:'Test',lineCents:2490}]),'USD',2490,0,0,2490,'int_test',at,at,at).run();
  return {db,order:await getOrder(db,ID),env:{DB:db,RESEND_API_KEY:'test-key',CUSTOMER_EMAIL_FROM:'APGO <orders@apgo.tw>',CUSTOMER_EMAIL_REPLY_TO:'services@apgo.com.tw',...extra}};
}
const count=(db,table)=>db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const job=(db,kind)=>db.raw.prepare('SELECT * FROM order_message_jobs WHERE order_id=? AND kind=?').get(ID,kind);
const accepted=id=>async()=>Response.json({id});

test('shipment and its instruction roll back together on either write failure; concurrent shipping creates one task',async()=>{
  for (const table of ['order_message_jobs','order_fulfillments']) {
    const {db}=await setup();
    db.raw.exec(`CREATE TRIGGER reject_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'simulated failure'); END`);
    await assert.rejects(markShipped(db,ID,shipment));
    assert.equal(count(db,'order_fulfillments'),0);assert.equal(count(db,'order_message_jobs'),0);
  }
  const {db}=await setup();
  const results=await Promise.allSettled([markShipped(db,ID,shipment),markShipped(db,ID,shipment)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(count(db,'order_fulfillments'),1);assert.equal(count(db,'order_message_jobs'),1);
  assert.equal((await getOrderEmails(db,ID))[0].status,'pending');
});

test('fresh scheduled Worker recovers shipment without waitUntil; replay, later cron and legacy shipments do not duplicate',async()=>{
  const {db,order,env}=await setup({CUSTOMER_EMAIL_RETRY_CRON:'true'});
  await markShipped(db,ID,shipment);let calls=0;const original=globalThis.fetch;
  globalThis.fetch=async(_url,init)=>{calls++;assert.equal(init.headers['Idempotency-Key'],`apgo/${ID}/shipment`);assert.match(JSON.parse(init.body).text,/NO-PARCEL/);return Response.json({id:'mail_ship'});};
  try {
    const fresh=await import(`../worker/customer-email.js?restarted=${crypto.randomUUID()}`);
    await fresh.scheduledCustomerEmailRetry(env);await fresh.scheduledCustomerEmailRetry(env);
    assert.equal((await processMessageJob(env,order,'shipment')).status,'duplicate');
  } finally {globalThis.fetch=original;}
  assert.equal(calls,1);assert.equal(job(db,'shipment').status,'handed_off');
  const old=await setup();await markShipped(old.db,ID,shipment);old.db.raw.exec('DELETE FROM order_message_jobs');
  await assert.rejects(markShipped(old.db,ID,shipment));assert.equal(count(old.db,'order_message_jobs'),0);
});

test('shipment handoff can resume a crash after legacy claim; old ambiguous claims remain protected',async()=>{
  const {db,env,order}=await setup();await markShipped(db,ID,shipment);
  db.raw.exec("CREATE TRIGGER reject_outbox BEFORE INSERT ON order_email_delivery BEGIN SELECT RAISE(ABORT,'simulated interruption'); END");
  await processMessageJob(env,order,'shipment',{fetchImpl:()=>assert.fail('transport before durable outbox')});
  assert.equal(job(db,'shipment').status,'pending');assert.equal((await getOrderEmails(db,ID))[0].status,'pending');
  db.raw.exec('DROP TRIGGER reject_outbox');
  assert.equal((await processMessageJob(env,order,'shipment',{fetchImpl:accepted('mail_ship')})).status,'sent');
  const old=await setup();
  await old.db.prepare("INSERT INTO order_emails(order_id,kind,status,created_at,updated_at) VALUES (?,'shipment','pending',?,?)").bind(ID,at,at).run();
  assert.equal((await sendCustomerEmail(old.env,old.order,'shipment',{shipment,resumeInitialJob:true,fetchImpl:()=>assert.fail('legacy duplicate')})).status,'duplicate');
});

test('interrupted shipment handoff after accepted or permanent rejection preserves the transport outcome',async()=>{
  for (const providerStatus of [200,403]) {
    const {db,env,order}=await setup({CUSTOMER_EMAIL_RETRY_CRON:'true'});await markShipped(db,ID,shipment);
    db.raw.exec("CREATE TRIGGER reject_handoff BEFORE UPDATE ON order_message_jobs WHEN NEW.status='handed_off' BEGIN SELECT RAISE(ABORT,'interrupted handoff'); END");
    let calls=0;
    await processMessageJob(env,order,'shipment',{fetchImpl:async()=>{calls++;return Response.json(providerStatus===200 ? {id:'mail_ship'} : {},{status:providerStatus});}});
    assert.equal(job(db,'shipment').status,'pending');db.raw.exec('DROP TRIGGER reject_handoff');
    const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('transport outcome must not auto resend');
    try {await scheduledCustomerEmailRetry(env);}finally{globalThis.fetch=original;}
    assert.equal(job(db,'shipment').status,'handed_off');assert.equal(calls,1);
    assert.equal((await getDelivery(db,ID,'shipment')).status,providerStatus===200 ? 'accepted' : 'failed');
  }
});

test('each accepted partial refund freezes its own summary; accepted->settled/replay cannot duplicate or rewrite it',async()=>{
  const {db,env,order}=await setup();
  const first=await saveRefund(db,order,refund());
  const second=await saveRefund(db,order,refund({id:'rfd_second',amount:23.9,created_at:'2026-10-03T12:01:00Z',updated_at:'2026-10-03T12:01:00Z'}));
  assert.equal(JSON.parse(job(db,first).payload_json).refundedCents,100);
  assert.equal(JSON.parse(job(db,second).payload_json).refundedCents,2490);
  await saveRefund(db,order,refund({status:'SETTLED',updated_at:'2026-10-03T12:02:00Z'}));
  await saveRefund(db,order,refund());assert.equal(count(db,'order_message_jobs'),2);
  const requests=[];
  for (const kind of [first,second]) {
    const result=await processMessageJob(env,order,kind,{fetchImpl:async(_url,init)=>{requests.push({key:init.headers['Idempotency-Key'],body:JSON.parse(init.body)});return Response.json({id:`mail_${requests.length}`});}});
    assert.equal(result.status,'sent');
    assert.equal((await processMessageJob(env,order,kind,{fetchImpl:()=>assert.fail('duplicate')})).status,'duplicate');
  }
  assert.notEqual(requests[0].key,requests[1].key);
  assert.match(requests[0].body.subject,/partial/);assert.match(requests[1].body.subject,/full/);
  assert.match(requests[0].body.text,/Total refunds accepted: \$1\.00/);
  assert.match(requests[1].body.text,/Total refunds accepted: \$24\.90/);
  assert.ok(!requests[0].body.html.includes('<script>'));assert.ok(!requests[0].body.text.includes('private street'));
  assert.match(requests[0].body.text,/depends on your bank/);assert.equal(requests[0].body.reply_to,'services@apgo.com.tw');
});

test('refund observation and initial notice commit atomically; received/failed/older and historic accepted refunds create no notice',async()=>{
  for (const table of ['order_refunds','order_message_jobs']) {
    const {db,order}=await setup();db.raw.exec(`CREATE TRIGGER reject_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'simulated failure'); END`);
    await assert.rejects(saveRefund(db,order,refund()));assert.equal(count(db,'order_refunds'),0);assert.equal(count(db,'order_message_jobs'),0);
  }
  const {db,order}=await setup();
  await saveRefund(db,order,refund({status:'RECEIVED'}));await saveRefund(db,order,refund({status:'FAILED',updated_at:'2026-10-03T12:02:00Z'}));
  await saveRefund(db,order,refund({updated_at:'2026-10-03T12:01:00Z'}));assert.equal(count(db,'order_message_jobs'),0);
  await saveRefund(db,order,refund({updated_at:'2026-10-03T12:03:00Z'}));assert.equal(count(db,'order_message_jobs'),1);
  db.raw.exec('DELETE FROM order_message_jobs');await saveRefund(db,order,refund({status:'SETTLED',updated_at:'2026-10-03T12:04:00Z'}));
  assert.equal(count(db,'order_message_jobs'),0);
});

test('concurrent acceptance creates one refund instruction; a failed refund before handoff never sends success',async()=>{
  const {db,env,order}=await setup();await Promise.all([saveRefund(db,order,refund()),saveRefund(db,order,refund())]);
  assert.equal(count(db,'order_message_jobs'),1);
  await saveRefund(db,order,refund({status:'FAILED',updated_at:'2026-10-03T12:01:00Z'}));
  assert.equal((await processMessageJob(env,order,'refund:rfd_first',{fetchImpl:()=>assert.fail('failed success notice')})).status,'blocked');
  assert.equal(job(db,'refund:rfd_first').status,'skipped');assert.equal(count(db,'order_email_delivery'),0);
  assert.equal((await getOrderEmails(db,ID))[0].canRetry,false);
  assert.equal((await retryCustomerEmail(env,order,'refund:rfd_first',{fetchImpl:()=>assert.fail('failed manual retry')})).status,'blocked');
});

test('refund retries use the frozen body/key; cron cannot retry permanent rejection; staging and opt-out remain enforced',async()=>{
  const {db,env,order}=await setup();const kind=await saveRefund(db,order,refund());const now=Date.now();const requests=[];
  const transport=async(_url,init)=>{requests.push([init.headers['Idempotency-Key'],init.body]);return requests.length===1 ? new Response('{}',{status:503}) : Response.json({id:'mail_retry'});};
  await processMessageJob(env,order,kind,{nowMs:now,fetchImpl:transport});
  await saveRefund(db,order,refund({id:'rfd_later',amount:23.9}));
  await retryCustomerEmail({...env,CUSTOMER_EMAIL_FROM:'Changed <changed@example.com>'},order,kind,{nowMs:now+60_001,fetchImpl:transport});
  assert.deepEqual(requests[0],requests[1]);
  const rejected=await setup({CUSTOMER_EMAIL_RETRY_CRON:'true'});const rejectedKind=await saveRefund(rejected.db,rejected.order,refund());
  await processMessageJob(rejected.env,rejected.order,rejectedKind,{fetchImpl:async()=>new Response('{}',{status:403})});
  const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('permanent rejection auto retry');
  try {await scheduledCustomerEmailRetry(rejected.env);}finally{globalThis.fetch=original;}
  assert.equal((await getDelivery(rejected.db,ID,rejectedKind)).status,'failed');
  const blocked=await setup({SITE_ENV:'staging'});const blockedKind=await saveRefund(blocked.db,blocked.order,refund());
  assert.equal((await processMessageJob(blocked.env,blocked.order,blockedKind,{fetchImpl:()=>assert.fail('recipient blocked')})).status,'skipped');
  assert.equal((await processMessageJob({...blocked.env,CUSTOMER_EMAIL_TEST_RECIPIENTS:'buyer@example.com'},blocked.order,blockedKind,{fetchImpl:()=>assert.fail('historic skip retained')})).status,'duplicate');
});

test('fresh cron repairs interrupted refund preparation; subsequent provider failure stops ambiguous retries for review',async()=>{
  const {db,env,order}=await setup({CUSTOMER_EMAIL_RETRY_CRON:'true'});const kind=await saveRefund(db,order,refund());
  db.raw.exec("CREATE TRIGGER reject_outbox BEFORE INSERT ON order_email_delivery BEGIN SELECT RAISE(ABORT,'interrupted'); END");
  await processMessageJob(env,order,kind);assert.equal(job(db,kind).status,'pending');db.raw.exec('DROP TRIGGER reject_outbox');
  db.raw.exec("UPDATE order_message_jobs SET next_attempt_at=NULL");
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:503});
  try {await scheduledCustomerEmailRetry(env);}finally{globalThis.fetch=original;}
  assert.equal((await getDelivery(db,ID,kind)).status,'retry');
  await saveRefund(db,order,refund({status:'FAILED',updated_at:'2026-10-03T12:01:00Z'}));
  const result=await retryCustomerEmail(env,order,kind,{nowMs:Date.now()+120_000,fetchImpl:()=>assert.fail('failed refund retry')});
  assert.equal(result.status,'blocked');assert.equal((await getDelivery(db,ID,kind)).status,'review');
});
