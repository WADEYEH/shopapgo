// The policy and contact pages (D41 PR 三, M11). The policy pages are Next.js pages that show the drafts in
// docs/legal as they are; this checks the wiring, that the drafts agree with the store's own rules (M11: policy text and
// checkout must not disagree), and the contact page. Rendering and the form are in policy-pages.spec.mjs.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { SHIP_STATES } from "../prototype/js/commerce/address-rules.js";
import { DEFAULT_PRICING } from "../worker/pricing.js";

const root = new URL("../../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
const POLICIES = { privacy: "privacy-policy.md", terms: "terms-of-sale.md", returns: "returns-and-refunds.md", shipping: "shipping-policy.md" };

test("each policy page reads its draft in docs/legal, is not indexed, and the plain HTML pages and their generator are gone", () => {
  for (const [slug, file] of Object.entries(POLICIES)) {
    const page = read(`app/(us)/(shop)/${slug}/page.js`);
    assert.ok(page.includes(`loadPolicy("${file}")`), `${slug} reads ${file}`);
    assert.ok(page.includes("robots: { index: false, follow: false }"), `${slug} is noindex until launch`);
    assert.ok(page.includes(`canonical: "/${slug}"`), slug);
    assert.ok(existsSync(new URL(`docs/legal/${file}`, root)), file);
    assert.ok(read(`docs/legal/${file}`).startsWith("# "), `${file} starts with its title`);
  }
  for (const gone of ["commerce/prototype/privacy.html", "commerce/prototype/terms.html", "commerce/prototype/returns.html", "commerce/prototype/contact.html", "commerce/scripts/build-policy-pages.py"]) {
    assert.equal(existsSync(new URL(gone, root)), false, `${gone} is gone`);
  }
  const component = read("components/shop/PolicyPage.js");
  assert.ok(component.includes('data-policy-draft=""'), "the draft notice stays until counsel approves");
  assert.ok(component.includes('data-to-confirm="">{`[TO CONFIRM: ${node.text}]`}</mark>'), "open points are marked");
  assert.equal(component.includes("dangerouslySetInnerHTML"), false, "no HTML string from the drafts is injected");
});

test("the drafts agree with the store's rules: shipping cost, where we ship, delivery time, returns window", () => {
  const shipping = read("docs/legal/shipping-policy.md");
  const standard = DEFAULT_PRICING.shippingMethods[DEFAULT_PRICING.defaultShippingMethod];
  assert.equal(Object.keys(DEFAULT_PRICING.shippingMethods).length, 1, "one shipping option, as the policy says");
  assert.ok(shipping.includes(`**$${(standard.amountCents / 100).toFixed(2)} per order**`), "shipping cost");
  assert.match(standard.detail, /3–5 business days/);
  assert.ok(shipping.includes("**3–5 business days**"), "delivery time");
  assert.equal(Object.keys(SHIP_STATES).length, 49, "48 contiguous states and DC");
  assert.ok(!("AK" in SHIP_STATES) && !("HI" in SHIP_STATES) && "DC" in SHIP_STATES);
  assert.ok(shipping.includes("48 contiguous United States and the District of Columbia"));
  assert.ok(shipping.includes("Alaska, Hawaii") && shipping.includes("P.O. boxes") && shipping.includes("APO, FPO, DPO"));
  const returns = read("docs/legal/returns-and-refunds.md");
  assert.ok(returns.includes("**30 days of delivery**") && returns.includes("**one hour**"));
  assert.ok(returns.includes(`($${(standard.amountCents / 100).toFixed(2)})`), "the non-refundable shipping fee matches");
  for (const file of Object.values(POLICIES)) {
    const text = read(`docs/legal/${file}`);
    assert.doesNotMatch(text, /free (us )?shipping|express shipping/i, `${file}: no promise the checkout does not keep`);
  }
});

test("the contact page: the form, the support details from lib/us/company.js, the 2-business-day reply", () => {
  const page = read("app/(us)/(shop)/contact/page.js");
  assert.ok(page.includes("<ContactForm />"));
  assert.ok(page.includes("We reply within 2 business days."));
  for (const field of ["company.email", "company.phoneHref", "company.hours", "company.name", "company.businessId", "company.address"]) assert.ok(page.includes(field), field);
  const form = read("components/shop/ContactForm.js");
  assert.ok(form.includes('api("/api/contact"'), "posts to the Worker");
  assert.ok(form.includes("checkContactMessage"), "the shared field rules");
  assert.ok(form.includes('name="company" tabIndex={-1}'), "the field only robots fill");
  assert.ok(read("lib/shop/contact.js").includes("contact-rules.js"));
  assert.ok(read("commerce/worker/contact.js").includes('from "../prototype/js/commerce/contact-rules.js"'), "the Worker checks the same rules");
});

test("the site footer links every policy page and the contact page (single site)", () => {
  const footer = read("components/us/SiteFooter.js");
  for (const [label, key] of [["Privacy Policy", "privacy"], ["Terms of Sale", "terms"], ["Returns & Refunds", "returns"], ["Shipping", "shipping"], ["Contact", "contact"]]) {
    assert.ok(footer.includes(`{ label: "${label}", href: routes.${key} }`), label);
  }
});

test("v3 keeps its look: footer link group only, no price", () => {
  const html = read("commerce/prototype/v3.html");
  assert.match(html, /<nav class="v3-footer__links" aria-label="Legal and support">/);
  assert.doesNotMatch(html, /\$\s?\d/);
});
