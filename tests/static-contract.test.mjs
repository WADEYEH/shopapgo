import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("config defaults fail closed", async () => {
  const source = await read("prototype/js/config.js");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const config = sandbox.window.APGO_CONFIG;

  assert.equal(config.preview, true);
  assert.equal(config.supportEmail, "");
  for (const sku of ["d204", "d215"]) {
    assert.equal(config.products[sku].amazonUrl, "");
    assert.equal(config.products[sku].linkReady, false);
    assert.equal(config.products[sku].videoReady, false);
  }
});

test("interaction runtime preserves the required hooks and events", async () => {
  const source = await read("prototype/js/app.js");
  const requiredTokens = [
    "data-selected-amazon-cta",
    "data-amazon-cta",
    "data-product-card",
    "data-video-card",
    "data-mobile-sticky",
    "fit_selector_answer",
    "amazon_referral_click",
    "video_start",
    "faq_expand",
    "scroll_depth",
    "us_referral_landing_view",
    "noindex,nofollow",
  ];

  for (const token of requiredTokens) {
    assert.ok(source.includes(token), `Missing runtime contract token: ${token}`);
  }
});

test("Claude brief is standalone and locks the AI background policy", async () => {
  const source = await read("docs/CLAUDE_DESIGN_BRIEF.md");
  const requiredTokens = [
    "APGO Atomic Colored Glaze",
    "APGO Atomic Glaze Coating",
    "concept-claude/",
    "hero-studio-bg.webp",
    "d204-context-bg.webp",
    "d215-context-bg.webp",
    "mechanically",
    "before/after",
    "1440 px",
    "390 px",
  ];

  for (const token of requiredTokens) {
    assert.ok(source.includes(token), `Claude brief is missing: ${token}`);
  }
});
