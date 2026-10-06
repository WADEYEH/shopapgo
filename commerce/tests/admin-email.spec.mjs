import { expect, test } from '@playwright/test';
import { mockAdminApi, SAMPLE_ORDERS } from './helpers/admin-mock.mjs';

const ID=SAMPLE_ORDERS[0].id;
test('email retry shows provider acceptance separately from delivery, and disables a second send', async({page})=>{
  await mockAdminApi(page);
  let email={kind:'confirmation',status:'failed',deliveryStatus:'retry',attempts:1,canRetry:true,detail:'Email service returned HTTP 503.',updatedAt:new Date().toISOString()};
  await page.route(`**/admin/api/orders/${ID}`,route=>route.fulfill({json:{...SAMPLE_ORDERS[0],emails:[email],audit:[],mcf:{mode:'off'}}}));
  const writes=[];
  await page.route(`**/admin/api/orders/${ID}/emails/confirmation/retry`,route=>{
    writes.push({method:route.request().method(),body:route.request().postDataJSON()});
    email={...email,status:'sent',deliveryStatus:'accepted',canRetry:false,providerId:'mail_demo',attempts:2,detail:'Accepted by email service; delivery not confirmed.'};
    return route.fulfill({json:{email:{status:'sent'},order:{...SAMPLE_ORDERS[0],emails:[email],audit:[],mcf:{mode:'off'}}}});
  });
  await page.goto(`/admin/index.html#${ID}`);
  await page.getByRole('button',{name:'Retry Order confirmation',exact:true}).click();
  const history=page.getByRole('region',{name:'History'});
  await expect(history).toContainText('Accepted by email service (delivery not confirmed)');
  await expect(history).toContainText('Message ID: mail_demo');
  await expect(page.getByRole('button',{name:'Retry Order confirmation',exact:true})).toHaveCount(0);
  expect(writes).toEqual([{method:'POST',body:{}}]);
});

test('bounce/complaint records have no retry button; safely rendered server errors allow retry',async({page})=>{
  await mockAdminApi(page);
  await page.route(`**/admin/api/orders/${ID}`,route=>route.fulfill({json:{...SAMPLE_ORDERS[0],emails:[
    {kind:'confirmation',status:'failed',deliveryStatus:'bounced',canRetry:false,updatedAt:new Date().toISOString()},
    {kind:'shipment',status:'skipped',canRetry:true,updatedAt:new Date().toISOString()},
  ],audit:[],mcf:{mode:'off'}}}));
  await page.route(`**/admin/api/orders/${ID}/emails/shipment/retry`,route=>route.fulfill({status:409,json:{error:{message:'<img src=x onerror=alert(1)> retry window expired'}}}));
  await page.goto(`/admin/index.html#${ID}`);
  await expect(page.getByRole('button',{name:'Retry Order confirmation',exact:true})).toHaveCount(0);
  const button=page.getByRole('button',{name:'Retry Shipment notice',exact:true});await button.click();
  await expect(page.getByRole('region',{name:'History'})).toContainText('retry window expired');
  await expect(page.getByRole('region',{name:'History'}).locator('img')).toHaveCount(0);
  await expect(button).toBeEnabled();
});
