import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const pages = ["privacy", "terms", "returns", "contact"];
const storePages = ["cart", "checkout", ...pages];

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
