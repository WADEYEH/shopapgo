// Checkout payment-step screenshots with Apple Pay / Google Pay visible and with a
// device that has no wallet. /api and Airwallex.js are stubbed (tests/helpers/store-mock.mjs),
// so no Worker or secrets are needed. Output goes to review/.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, ensurePrototypeServer } from "./server-utils.mjs";
import { fillToPayment, mockStore, seedCart } from "../tests/helpers/store-mock.mjs";

const out = path.resolve("review");
await mkdir(out, { recursive: true });
const stopServer = await ensurePrototypeServer();
const browser = await chromium.launch({ headless: true });

try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    for (const [name, wallets] of [["wallets", true], ["no-wallets", false]]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", timezoneId: "America/Los_Angeles", reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.addInitScript((enabled) => {
        window.__awxWalletReady = enabled ? { applePayButton: true, googlePayButton: true } : {};
        if (enabled) window.ApplePaySession = { canMakePayments: () => true };
        else Object.defineProperty(window, "isSecureContext", { value: false });
        // Make the stub wallet buttons look like wallet buttons in the review shots.
        const style = document.createElement("style");
        style.textContent = "[data-stub-wallet]{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;height:48px;border-radius:4px;background:#fff;color:#000;font:600 16px system-ui;cursor:pointer}";
        document.addEventListener("DOMContentLoaded", () => document.head.append(style));
      }, wallets);
      await mockStore(page);
      await seedCart(page, [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 1 }]);
      await page.goto(`${BASE_URL}/checkout`, { waitUntil: "networkidle" });
      await fillToPayment(page);
      if (wallets) await page.locator('[data-wallet-slot="googlePay"].is-ready').waitFor();
      await page.evaluate(() => document.fonts?.ready);
      await page.screenshot({ path: path.join(out, `checkout-payment-${name}-${label}.png`), fullPage: true, animations: "disabled" });
      await context.close();
    }
  }
  console.log("Wrote review/checkout-payment-{wallets,no-wallets}-{desktop,mobile}.png");
} finally {
  await browser.close();
  await stopServer();
}
