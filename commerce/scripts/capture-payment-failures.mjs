// Local fixtures only: no requests to Airwallex or real customer records.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, ensurePrototypeServer } from "./server-utils.mjs";
import { mockAdminApi } from "../tests/helpers/admin-mock.mjs";
import { mockStore, seedCart, fillToPayment, fillCard } from "../tests/helpers/store-mock.mjs";

const out = path.resolve("review");
await mkdir(out, { recursive: true });
const stopServer = await ensurePrototypeServer();
const browser = await chromium.launch({ headless: true });
try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    await mockAdminApi(page, { paymentFailures: { "APGO-US-7K3M9Q2W4XZ8": [{
      attemptId: "att_sample_declined", event: "payment_attempt.authorization_failed", code: "authorization_failed",
      providerCode: "issuer_declined", message: "The card issuer declined this payment attempt.", traceId: "trace_sample_001", occurredAt: "2026-10-02T01:00:00Z",
    }] } });
    await page.goto(`${BASE_URL}/admin/index.html#APGO-US-7K3M9Q2W4XZ8`, { waitUntil: "networkidle" });
    await page.locator("[data-payment-failures]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `payment-failure-admin-${label}.jpg`), fullPage: false });
    await page.close();
    const checkout = await browser.newPage({ viewport });
    await mockStore(checkout, { orderStatus: "pending", paymentFailure: { message: "Card verification wasn't completed. Try again or use another payment method." } });
    await seedCart(checkout, [{ sku: "d204", qty: 1 }]);
    await checkout.goto(`${BASE_URL}/checkout`);
    await fillToPayment(checkout);
    await fillCard(checkout);
    await checkout.locator("[data-place-order]").click();
    await checkout.getByText("Card verification wasn't completed.", { exact: false }).waitFor();
    await checkout.screenshot({ path: path.join(out, `payment-failure-checkout-${label}.jpg`), fullPage: true });
    await checkout.close();
  }
  console.log("Captured desktop/mobile payment failure fixtures in review/.");
} finally {
  await browser.close();
  await stopServer();
}
