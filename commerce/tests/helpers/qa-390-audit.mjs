// Manual 390x844 QA audit (not part of the test suite): screenshots to review/qa-390-*.png,
// axe, tap targets, layout, focus order. Start `npm run serve` (the built site, npm run build:site) first,
// then `node tests/helpers/qa-390-audit.mjs`.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockStore, seedCart, fillToPayment } from "./store-mock.mjs";

const base = "http://127.0.0.1:4173";
const browser = await chromium.launch();

async function audit(name, setup, { tabs = 40 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: "en-US" });
  const page = await ctx.newPage();
  await setup(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `review/qa-390-${name}.png`, fullPage: true });
  const axe = await new AxeBuilder({ page }).analyze();
  const small = await page.evaluate(() => {
    const out = [];
    const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])';
    for (const n of document.querySelectorAll(sel)) {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || n.closest("[hidden],[inert]")) continue;
      if (n.closest(".visually-hidden,.v3-sr-only") || cs.position === "absolute" && r.width <= 1) continue;
      // inline text links in a paragraph are exempt (WCAG 2.5.8 inline exception)
      const inline = n.tagName === "A" && cs.display === "inline" && n.closest("p, li");
      if (r.width < 44 || r.height < 44) out.push({ el: n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.split(" ")[0] : ""), text: (n.getAttribute("aria-label") || n.textContent || n.id || "").trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), inline: Boolean(inline) });
    }
    return out;
  });
  const layout = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const over = [];
    for (const n of document.querySelectorAll("body *")) {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      if (r.width === 0 || cs.visibility === "hidden" || n.closest("[hidden],[inert]") || cs.position === "fixed" && false) continue;
      if (r.right > vw + 1 || r.left < -1) over.push(`${n.tagName.toLowerCase()}.${String(n.className).split(" ")[0]} [${Math.round(r.left)},${Math.round(r.right)}]`);
    }
    const clipped = [];
    for (const n of document.querySelectorAll("body *")) {
      if (n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0) {
        const cs = getComputedStyle(n);
        if (["hidden", "clip", "auto", "scroll"].includes(cs.overflowX) || cs.textOverflow === "ellipsis") clipped.push(`${n.tagName.toLowerCase()}.${String(n.className).split(" ")[0]} sw=${n.scrollWidth} cw=${n.clientWidth}`);
      }
    }
    return { docOverflow: document.documentElement.scrollWidth - vw, over: over.slice(0, 15), clipped: clipped.slice(0, 15) };
  });
  // focus order
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  const order = [];
  for (let i = 0; i < tabs; i++) {
    await page.keyboard.press("Tab");
    const d = await page.evaluate(() => {
      const a = document.activeElement; if (!a || a === document.body) return null;
      const r = a.getBoundingClientRect(); const cs = getComputedStyle(a);
      const ring = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== "none";
      return { t: (a.getAttribute("aria-label") || a.textContent || a.id || a.tagName).trim().replace(/\s+/g, " ").slice(0, 28), y: Math.round(r.top + scrollY), ring, vis: r.width > 0 };
    });
    if (d) order.push(d);
  }
  console.log(`\n===== ${name} =====`);
  console.log("axe violations:", axe.violations.map((v) => `${v.id}[${v.impact}] x${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`));
  console.log("tap <44:", JSON.stringify(small));
  console.log("layout:", JSON.stringify(layout));
  console.log("focus order:", order.map((o) => `${o.t}@${o.y}${o.ring ? "" : "(NO RING)"}`).join(" > "));
  await ctx.close();
}

const cartSetup = (items, flag) => async (p) => {
  await mockStore(p);
  await seedCart(p, items);
  await p.goto(base + "/cart");
};
await audit("cart", cartSetup([{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }]), { tabs: 20 });
await audit("cart-empty", cartSetup([]), { tabs: 12 });
await audit("checkout", async (p) => { await mockStore(p); await seedCart(p, [{ sku: "d204", qty: 1 }]); await p.goto(base + "/checkout"); }, { tabs: 20 });
await audit("checkout-payment", async (p) => { await mockStore(p); await seedCart(p, [{ sku: "d204", qty: 1 }]); await p.goto(base + "/checkout"); await fillToPayment(p); }, { tabs: 25 });
for (const s of ["privacy", "terms", "returns", "contact"]) await audit(s, async (p) => { await p.goto(base + `/${s}.html`); }, { tabs: 12 });
await browser.close();
