import {expect,test} from '@playwright/test';
import {mockAdminApi,SAMPLE_ORDERS} from './helpers/admin-mock.mjs';
const ID=SAMPLE_ORDERS[0].id;
const data={records:[{id:'rfd_demo',amountCents:500,currency:'USD',status:'ACCEPTED',createdAt:'2026-10-03T12:00:00Z',updatedAt:'2026-10-03T12:01:00Z',failureCode:''}],refundedCents:500,pendingCents:0,hold:true,status:'partially_refunded'};
async function setup(page,{failed=false,shipped=false}={}) {
  await mockAdminApi(page);
  let refunds={records:[],refundedCents:0,pendingCents:0,hold:false,status:'none'};
  const view=()=>({...SAMPLE_ORDERS[0],refunds,audit:[],emails:[],mcf:{mode:'off',canSubmit:false},...(shipped?{fulfillment:{carrier:'TEST',trackingNumber:'TEST-ONLY',shippedAt:'2026-10-03T11:00:00Z',shippedBy:'mcf'}}:{})});
  await page.route(`**/admin/api/orders/${ID}`,route=>route.fulfill({json:view()}));
  const requests=[];
  await page.route(`**/admin/api/orders/${ID}/refunds/sync`,route=>{
    requests.push({method:route.request().method(),body:route.request().postDataJSON()});
    if(failed) {failed=false;return route.fulfill({status:502,json:{error:{message:'<img src=x onerror=alert(1)> Provider unavailable'}}});}
    refunds=structuredClone(data);return route.fulfill({json:{order:view()}});
  });
  await page.goto(`/admin/index.html#${ID}`);
  return requests;
}
test('refund sync displays partial totals, locks new shipping and performs no financial action',async({page})=>{
  const requests=await setup(page);
  await page.getByRole('button',{name:'Sync refunds',exact:true}).click();
  const refunds=page.getByRole('region',{name:'Refunds',exact:true});
  await expect(refunds).toContainText('Refunded: $5.00');
  await expect(refunds).toContainText('ACCEPTED');
  await expect(page.getByRole('region',{name:'Fulfilment',exact:true})).toContainText('Existing shipments are not cancelled automatically.');
  await expect(page.getByRole('button',{name:'Mark as shipped',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Amazon MCF',exact:true})).toContainText('new Amazon and manual fulfillment are on hold');
  await expect(page.getByRole('region',{name:'Amazon MCF',exact:true})).not.toContainText('ship this order manually');
  expect(requests).toEqual([{method:'POST',body:{}}]);
});
test('failed sync is safely rendered and can be retried; already shipped carrier facts remain visible',async({page})=>{
  await setup(page,{failed:true,shipped:true});
  await page.getByRole('button',{name:'Sync refunds',exact:true}).click();
  const refunds=page.getByRole('region',{name:'Refunds',exact:true});
  await expect(refunds).toContainText('Provider unavailable');
  await expect(refunds.locator('img')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Sync refunds',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Sync refunds',exact:true}).click();
  await expect(refunds).toContainText('Refunded: $5.00');
  await expect(page.getByRole('region',{name:'Fulfilment',exact:true})).toContainText('TEST-ONLY');
});
test('refund history and controls fit a mobile viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await setup(page);await page.getByRole('button',{name:'Sync refunds',exact:true}).click();
  await expect(page.getByRole('region',{name:'Refunds',exact:true})).toContainText('rfd_demo');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
