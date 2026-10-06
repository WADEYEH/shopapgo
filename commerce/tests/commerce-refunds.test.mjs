import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';
import {createD1,sqliteAvailable} from './helpers/d1.mjs';
import {getOrder,listOrders,fulfillmentCounts} from '../worker/orders.js';
import {saveRefund,refundView,refundHold,syncOrderRefunds} from '../worker/refunds.js';
import {markShipped} from '../worker/fulfillment.js';
import {resetAirwallexTokenCache} from '../worker/airwallex.js';
import {submitOrderToMcf} from '../worker/mcf.js';
import {FAKE_AMAZON_ENV} from './helpers/fake-amazon-mcf.mjs';
import worker from '../worker/index.js';
import {handleAdminApi} from '../worker/admin.js';
import {runSandboxRefundCheck} from '../worker/sandbox-refund-checks.js';

const skip=!(await sqliteAvailable());
const ID='APGO-US-0123456789AB';
const SECRET='test-refund-webhook-secret';
const TOKEN='test-admin-token-for-refunds';
const at='2026-10-03T12:00:00.000Z';
const refund=(patch={})=>({id:'rfd_test',payment_intent_id:'int_test',amount:5,currency:'USD',status:'ACCEPTED',created_at:at,updated_at:at,...patch});
async function setup() {
  const db=await createD1();
  await db.prepare('INSERT INTO orders(id,status,email,shipping_json,shipping_method,lines_json,currency,subtotal_cents,shipping_cents,tax_cents,total_cents,payment_intent_id,created_at,updated_at,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(ID,'paid','test@example.com',JSON.stringify({firstName:'Test',lastName:'Buyer',street:'1 Test St',city:'Seattle',state:'WA',zip:'98109'}),'standard',JSON.stringify([{sku:'D215',qty:1,name:'Test',lineCents:2490,unitCents:2490}]),'USD',2490,0,0,2490,'int_test',at,at,at).run();
  return {db,order:await getOrder(db,ID),env:{DB:db,ADMIN_TOKEN:TOKEN,AIRWALLEX_ENV:'demo',AIRWALLEX_CLIENT_ID:'cid',AIRWALLEX_API_KEY:'test-key',AIRWALLEX_WEBHOOK_SECRET:SECRET,AIRWALLEX_RETRY_DELAY_MS:'0'}};
}
async function mocked(handler,run) {
  const original=globalThis.fetch;resetAirwallexTokenCache();
  globalThis.fetch=async(url,init)=>String(url).endsWith('/authentication/login')
    ? Response.json({token:'test-token',expires_at:'2099-01-01T00:00:00Z'}) : handler(String(url),init);
  try{return await run();}finally{globalThis.fetch=original;resetAirwallexTokenCache();}
}
function hook(object,patch={}) {
  const event={id:'evt_refund',name:'refund.accepted',data:{object},...patch};
  const body=JSON.stringify(event);const timestamp=String(Date.now());
  return new Request('https://store.example/api/webhooks/airwallex',{method:'POST',headers:{'x-timestamp':timestamp,'x-signature':createHmac('sha256',SECRET).update(timestamp+body).digest('hex')},body});
}
const request=(path,body={},headers={})=>new Request(`https://store.example/admin/api/orders/${ID}/${path}`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('sandbox rejection probes enforce production, auth, CSRF, fixed input and approved test recipient boundaries',{skip},async()=>{
  const {env,order}=await setup();const path=`/admin/api/orders/${ID}/refunds/sandbox-check`;
  assert.equal((await handleAdminApi(request('refunds/sandbox-check',{scenario:'above_limit'}),env,path)).status,404);
  const staging={...env,SITE_ENV:'staging',CUSTOMER_EMAIL_TEST_RECIPIENTS:'test@example.com'};
  assert.equal((await handleAdminApi(new Request(request('refunds/sandbox-check'),{headers:{}}),staging,path)).status,401);
  assert.equal((await handleAdminApi(request('refunds/sandbox-check',{scenario:'above_limit'},{Origin:'https://evil.example'}),staging,path)).status,403);
  assert.equal((await handleAdminApi(request('refunds/sandbox-check',{scenario:'above_limit',amount:1}),staging,path)).status,400);
  assert.equal((await handleAdminApi(request('refunds/sandbox-check',{scenario:'anything'}),staging,path)).status,400);
  assert.equal((await handleAdminApi(request('refunds/sandbox-check',{scenario:'above_limit'}),{...staging,AIRWALLEX_ENV:'prod'},path)).status,404);
  assert.equal((await handleAdminApi(request('refunds/sandbox-check',{scenario:'above_limit'}),{...staging,AIRWALLEX_API_BASE:'https://evil.example'},path)).status,404);
  await mocked(()=>assert.fail('not an approved test order'),async()=>assert.equal((await runSandboxRefundCheck({...staging,CUSTOMER_EMAIL_TEST_RECIPIENTS:''},order,'above_limit')).outcome,'blocked'));
});

test('refund probes read current payment identity; fixed over-limit POST is not retried and retains only safe API rejection details',{skip},async()=>{
  const {db,env,order}=await setup();const staging={...env,SITE_ENV:'staging',CUSTOMER_EMAIL_TEST_RECIPIENTS:'test@example.com'};
  let posts=0;
  await mocked((url,init)=>{
    if (init.method==='GET') return Response.json({id:'int_test',merchant_order_id:ID,status:'SUCCEEDED',amount:24.9,currency:'USD'});
    posts++;const body=JSON.parse(init.body);assert.equal(body.amount,25.9);assert.equal(body.payment_intent_id,'int_test');assert.ok(body.request_id.length<=64);
    return Response.json({code:'amount_above_limit',message:'private provider details must not be persisted'},{status:400});
  },async()=>assert.equal((await runSandboxRefundCheck(staging,order,'above_limit')).outcome,'rejected'));
  assert.equal(posts,1);assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM order_refunds').get().n,0);
  assert.ok(!JSON.stringify(db.raw.prepare('SELECT * FROM order_audit').all()).includes('private provider details'));
  await mocked((url,init)=>{assert.equal(init.method,'GET');return Response.json({id:'int_test',merchant_order_id:'other',status:'SUCCEEDED',amount:24.9,currency:'USD'});},async()=>assert.equal((await runSandboxRefundCheck(staging,order,'above_limit')).outcome,'blocked'));
  posts=0;
  await mocked((url,init)=>{if (init.method==='GET') return Response.json({id:'int_test',merchant_order_id:ID,status:'SUCCEEDED',amount:24.9,currency:'USD'});posts++;return Response.json({code:'internal_error'},{status:500});},async()=>assert.equal((await runSandboxRefundCheck(staging,order,'above_limit')).outcome,'unverified'));
  assert.equal(posts,1);
});

test('already-refunded probe requires complete current provider data; missing refunds and auth errors cannot pass the negative check',{skip},async()=>{
  const {env,order}=await setup();const staging={...env,SITE_ENV:'staging',CUSTOMER_EMAIL_TEST_RECIPIENTS:'test@example.com'};
  let posts=0;
  const intent={id:'int_test',merchant_order_id:ID,status:'SUCCEEDED',amount:24.9,currency:'USD'};
  await mocked((url,init)=>{assert.equal(init.method,'GET');return Response.json(url.includes('/payment_intents/') ? intent : {items:[],has_more:false});},async()=>assert.equal((await runSandboxRefundCheck(staging,order,'fully_refunded')).outcome,'blocked'));
  await mocked((url,init)=>{
    if (init.method==='GET') return Response.json(url.includes('/payment_intents/') ? intent : {items:[refund({amount:24.9})],has_more:false});
    posts++;assert.equal(JSON.parse(init.body).amount,1);return Response.json({code:'invalid_status_for_operation'},{status:400});
  },async()=>assert.equal((await runSandboxRefundCheck(staging,order,'fully_refunded')).outcome,'rejected'));
  assert.equal(posts,1);
});

test('partial/full/pending/failed refund totals remain separate from the original payment and hold the shipping queue',{skip},async()=>{
  const {db,order}=await setup();
  await saveRefund(db,order,refund());
  assert.equal((await refundView(db,order)).status,'partially_refunded');
  assert.equal((await listOrders(db)).orders[0].refundHold,true);
  assert.equal((await listOrders(db,{fulfillment:'unfulfilled'})).orders.length,0);
  assert.equal((await fulfillmentCounts(db)).unfulfilled,0);
  await saveRefund(db,order,refund({id:'rfd_remaining',amount:19.9,status:'RECEIVED'}));
  assert.equal((await refundView(db,order)).status,'refund_pending');
  await saveRefund(db,order,refund({id:'rfd_remaining',amount:19.9,status:'SETTLED',updated_at:'2026-10-03T12:01:00Z'}));
  assert.equal((await refundView(db,order)).status,'fully_refunded');
  assert.equal((await refundView(db,order)).refundedCents,2490);
  assert.equal((await getOrder(db,ID)).status,'paid');
  const failed=await setup();await saveRefund(failed.db,failed.order,refund({status:'FAILED',failure_details:{code:'insufficient_balance',details:{card:'never stored'}}}));
  assert.equal(await refundHold(failed.db,ID),false);
  assert.equal((await refundView(failed.db,failed.order)).records[0].failureCode,'insufficient_balance');
  assert.ok(!JSON.stringify(failed.db.raw.prepare('SELECT * FROM order_refunds').all()).includes('never stored'));
});

test('duplicates and older snapshots cannot downgrade settled refunds; invalid and conflicting identities are rejected',{skip},async()=>{
  const {db,order}=await setup();
  const settled=refund({status:'SETTLED',updated_at:'2026-10-03T12:02:00Z'});
  await saveRefund(db,order,settled);await saveRefund(db,order,settled);
  await saveRefund(db,order,refund({status:'RECEIVED'}));
  assert.equal((await refundView(db,order)).records[0].status,'SETTLED');
  assert.equal((await refundView(db,order)).records.length,1);
  for(const patch of [{currency:'EUR'},{amount:25},{amount:0},{amount:0.001},{amount:NaN},{amount:'abc'},{payment_intent_id:'int_other'},{updated_at:'invalid'},{status:'UNKNOWN'},{id:'../unsafe'},{amount:4}]) {
    await assert.rejects(saveRefund(db,order,refund(patch)));
  }
});

test('signed refund events retrieve current state; duplicate and late delivery cannot regress it or trigger any financial POST',{skip},async()=>{
  const {db,env,order}=await setup();let reads=0;
  await mocked((url,init)=>{reads++;assert.equal(init.method,'GET');assert.ok(url.endsWith('/refunds/rfd_test'));return Response.json(refund({status:'SETTLED'}));},async()=>{
    const event=hook(refund({status:'RECEIVED'}));
    assert.equal((await worker.fetch(event.clone(),env)).status,200);
    assert.equal((await (await worker.fetch(event,env)).json()).duplicate,true);
  });
  assert.equal(reads,2);assert.equal((await refundView(db,order)).records[0].status,'SETTLED');
  assert.equal((await getOrder(db,ID)).status,'paid');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM order_mcf').get().n,0);
});

test('signed failed refund creates two durable messages; replay and late acceptance use current failure and never repeat mail',{skip},async()=>{
  const {db,env}=await setup();let sends=0;let reads=0;
  const mailEnv={...env,RESEND_API_KEY:'email-test-key',CUSTOMER_EMAIL_FROM:'APGO <orders@apgo.tw>',REFUND_ALERT_EMAIL_TO:'team@example.com'};
  const current=refund({status:'FAILED',failure_details:{code:'provider_declined'}});
  await mocked((url,init)=>{
    if(url==='https://api.resend.com/emails') {
      assert.equal(init.method,'POST');const body=JSON.parse(init.body);
      assert.match(body.subject,/could not be completed|refund failed/);return Response.json({id:`mail_failed_${++sends}`});
    }
    reads++;assert.equal(init.method,'GET');assert.ok(url.endsWith('/refunds/rfd_test'));return Response.json(current);
  },async()=>{
    assert.equal((await worker.fetch(hook(current,{name:'refund.failed'}),mailEnv)).status,200);
    assert.equal((await (await worker.fetch(hook(current,{name:'refund.failed'}),mailEnv)).json()).duplicate,true);
    assert.equal((await worker.fetch(hook(refund(),{id:'evt_old_acceptance'}),mailEnv)).status,200);
  });
  assert.equal(sends,2);assert.equal(reads,3);
  assert.equal((await refundView(db,await getOrder(db,ID))).records[0].status,'FAILED');
  assert.deepEqual(db.raw.prepare('SELECT kind,status FROM order_message_jobs ORDER BY kind').all().map(row=>({...row})),[
    {kind:'refund:failed:rfd_test',status:'handed_off'},{kind:'refund:team-failed:rfd_test',status:'handed_off'},
  ]);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM order_mcf').get().n,0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM order_fulfillments').get().n,0);
});

test('provider or database failure does not acknowledge a refund event; retry repairs it, and foreign events are not imported',{skip},async()=>{
  const {db,env}=await setup();
  await mocked(()=>new Response('{}',{status:503}),async()=>assert.equal((await worker.fetch(hook(refund()),env)).status,502));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM webhook_events').get().n,0);
  db.raw.exec("CREATE TRIGGER reject_refund BEFORE INSERT ON order_refunds BEGIN SELECT RAISE(ABORT,'test refund DB failure'); END");
  await mocked(()=>Response.json(refund()),async()=>assert.equal((await worker.fetch(hook(refund()),env)).status,500));
  db.raw.exec('DROP TRIGGER reject_refund');
  await mocked(()=>Response.json(refund()),async()=>assert.equal((await worker.fetch(hook(refund()),env)).status,200));
  await mocked(()=>assert.fail('foreign refund must not be retrieved'),async()=>assert.equal((await worker.fetch(hook(refund({payment_intent_id:'int_other',id:'rfd_other'}),{id:'evt_foreign'}),env)).status,200));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM order_refunds').get().n,1);
  assert.equal((await worker.fetch(new Request('https://store.example/api/webhooks/airwallex',{method:'POST',body:'{}'}),env)).status,400);
});

test('admin refund sync requires auth/CSRF and only performs a scoped GET; incomplete or invalid lists cannot be treated as verified',{skip},async()=>{
  const {db,env,order}=await setup();
  assert.equal((await worker.fetch(new Request(request('refunds/sync'),{headers:{}}),env)).status,401);
  assert.equal((await worker.fetch(request('refunds/sync',{}, {Origin:'https://evil.example'}),env)).status,403);
  await mocked((url,init)=>{assert.equal(init.method,'GET');const query=new URL(url).searchParams;assert.equal(query.get('payment_intent_id'),'int_test');return Response.json({items:[refund()],has_more:false});},async()=>{
    const response=await worker.fetch(request('refunds/sync'),env);assert.equal(response.status,200);
    assert.equal((await response.json()).order.refunds.status,'partially_refunded');
  });
  for(const page of [{items:[refund({id:'rfd_extra'})],has_more:true},{items:[refund({id:'rfd_extra',currency:'EUR'})],has_more:false}]) {
    await mocked(()=>Response.json(page),async()=>await assert.rejects(syncOrderRefunds(env,order)));
  }
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM order_refunds').get().n,1);
});

test('refund hold blocks manual shipping and new Amazon submissions; actual existing shipment can still be recorded',{skip},async()=>{
  const {db,env,order}=await setup();await saveRefund(db,order,refund());
  const shipment={carrier:'TEST',trackingNumber:'TEST-ONLY',trackingUrl:null};
  assert.equal((await worker.fetch(request('ship',shipment),env)).status,409);
  await assert.rejects(markShipped(db,ID,shipment),error=>error.code==='refund_hold');
  const ready={...env,...FAKE_AMAZON_ENV};
  await mocked(()=>assert.fail('no Amazon request'),async()=>{
    const result=await submitOrderToMcf(ready,order);
    assert.equal(result.outcome,'skipped');
    assert.match(result.reason,/Refund registered/);
  });
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM order_mcf').get().n,0);
  await markShipped(db,ID,shipment,{actor:'mcf'}); // Existing carrier facts must not be erased by a refund.
  assert.equal((await getOrder(db,ID)).status,'paid');
});
