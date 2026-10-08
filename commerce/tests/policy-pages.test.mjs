import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const pages = ["privacy", "terms", "returns", "contact"];
const storePages = ["v3", ...pages]; // the cart and checkout are Next.js pages with the site footer (D41)

test("policy pages exist, are noindex and show the operator and support contact", async () => {
  for (const slug of pages) {
    const html = await read(`prototype/${slug}.html`);
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/, slug);
    assert.match(html, /services@apgo\.com\.tw/, slug);
    assert.match(html, /<h1 /, slug);
  }
});

test("every store page footer links to Privacy, Terms, Returns and Contact", async () => {
  for (const slug of storePages) {
    const html = await read(`prototype/${slug}.html`);
    for (const href of ["privacy.html", "terms.html", "returns.html", "contact.html"]) {
      assert.ok(html.includes(`href="${href}"`), `${slug} is missing a footer link to ${href}`);
    }
  }
});

test("policy pages hold no price or tax figure and no payment secrets", async () => {
  for (const slug of pages) {
    const html = await read(`prototype/${slug}.html`);
    assert.doesNotMatch(html, /\$\s?\d/, `${slug} must not state a price`);
    assert.doesNotMatch(html, /api[_-]?key|secret|token/i, slug);
  }
});

test("policy pages are flagged as a draft until the owner approves them", async () => {
  for (const slug of pages) {
    assert.ok((await read(`prototype/${slug}.html`)).includes("data-policy-draft"), slug);
  }
});

test("the generator output matches the committed pages", async () => {
  const { execFileSync } = await import("node:child_process");
  const before = await Promise.all(pages.map((s) => read(`prototype/${s}.html`)));
  execFileSync("python3", ["scripts/build-policy-pages.py"], { cwd: new URL("..", import.meta.url) });
  const after = await Promise.all(pages.map((s) => read(`prototype/${s}.html`)));
  assert.deepEqual(after, before);
});

test("undecided business terms are visibly marked and no placeholder promise is left bare", async () => {
  for (const slug of ["terms", "returns"]) {
    const html = await read(`prototype/${slug}.html`);
    assert.ok(/<mark data-to-confirm>\[TO CONFIRM: /.test(html), `${slug} must carry TO CONFIRM markers`);
    assert.ok(html.includes("data-confirm-legend"), `${slug} explains the marker`);
    const bare = html.replace(/<mark data-to-confirm>.*?<\/mark>/gs, "");
    for (const pattern of [/\b30[- ]day/i, /5[–-]10 business days/i, /free shipping/i, /express shipping/i, /State of \[/i]) {
      assert.doesNotMatch(bare, pattern, `${slug}: undecided term outside a TO CONFIRM marker: ${pattern}`);
    }
  }
  const css = await read("prototype/css/commerce.css");
  assert.match(css, /mark\[data-to-confirm\]/);
});

test("v3 keeps its look: footer link group only, no price", async () => {
  const html = await read("prototype/v3.html");
  assert.match(html, /<nav class="v3-footer__links" aria-label="Legal and support">/);
  assert.doesNotMatch(html, /\$\s?\d/);
});
