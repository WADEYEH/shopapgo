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
    assert.equal(config.products[sku].videoReady, true);
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

test("V3 style board keeps the approved naming and value hierarchy", async () => {
  const html = await read("prototype/v3-style.html");
  const css = await read("prototype/css/v3-style.css");
  const script = await read("prototype/js/v3-style.js");
  const combined = `${html}\n${css}\n${script}`;

  const requiredTokens = [
    "APGO Paint Protection Coatings",
    "Professional paint protection, made simple to apply.",
    "Two coatings, designed around the way you wash",
    "8–10 full-car applications",
    "APGO Atomic Colored Glaze",
    "Apply on dry paint.",
    "180 days",
    "30+ washes",
    "APGO Atomic Glaze Coating",
    "Apply on wet paint.",
    "120 days",
    "20+ washes",
    "Engineered and made in Taiwan",
    "noindex,nofollow",
    "data-v3-selected",
  ];

  for (const token of requiredTokens) {
    assert.ok(combined.includes(token), `V3 style board is missing: ${token}`);
  }

  assert.ok(!combined.includes("6–8"), "V3 must not regress to 6–8 applications");
  assert.ok(!combined.toLowerCase().includes("ritual"), "V3 must not reuse the old ritual language");
  assert.ok(!combined.toLowerCase().includes("ceramic coating"), "V3 visible naming must remain category-specific");
});

test("V3 interactive page locks the six-part story and approved product claims", async () => {
  const html = await read("prototype/v3.html");
  const css = await read("prototype/css/v3.css");
  const script = await read("prototype/js/v3.js");
  const combined = `${html}\n${css}\n${script}`;

  const requiredTokens = [
    "APGO Paint Protection Coatings",
    "Professional paint protection, made simple to apply.",
    "8–10 full-car applications",
    "APGO Atomic Colored Glaze",
    "180 days",
    "30+ washes",
    "APGO Atomic Glaze Coating",
    "120 days",
    "20+ washes",
    "Hydrophobic",
    "precision-manufacturing discipline",
    'data-placement="selected"',
    'data-placement="sticky"',
    'data-placement="final"',
    'selection_source: "selector_card"',
    'new CustomEvent("apgo:analytics"',
    "noindex,nofollow",
  ];

  for (const token of requiredTokens) {
    assert.ok(combined.includes(token), `V3 interactive page is missing: ${token}`);
  }

  assert.equal((html.match(/data-faq-item/g) || []).length, 4, "V3 must contain exactly four FAQs");
  assert.ok(!html.includes("6–8"), "V3 visible copy must not regress to 6–8 applications");
  assert.ok(!html.toLowerCase().includes("ritual"), "V3 must not reuse the old ritual language");
  assert.ok(!html.toLowerCase().includes("ceramic coating"), "V3 visible naming must remain category-specific");
  assert.ok(!html.match(/\$\s?\d/), "V3 must not expose a floating price");
});

test("V3 offers Add to cart first and keeps every Amazon link as the secondary option", async () => {
  const html = await read("prototype/v3.html");
  for (const sku of ["d204", "d215"]) {
    for (const placement of ["selected", "final", "sticky"]) {
      assert.ok(
        new RegExp(`data-add-to-cart="${sku}"[^>]*data-placement="${placement}"`).test(html),
        `missing Add to cart for ${sku}/${placement}`,
      );
      assert.ok(
        html.includes(`data-amazon-cta data-sku="${sku}" data-placement="${placement}"`) ||
          new RegExp(`data-amazon-cta\\s+data-sku="${sku}"\\s+data-placement="${placement}"`).test(html),
        `Amazon link for ${sku}/${placement} must stay`,
      );
    }
  }
  assert.ok(html.includes('data-cart-link'), "header cart link");
  assert.ok(html.includes("js/commerce/landing-cart.js"));
  assert.ok(!html.match(/\$\s?\d/), "no price on the landing page");
});

test(".dev.vars.example documents every secret with no real values", async () => {
  const source = await read(".dev.vars.example");
  const assigned = Object.fromEntries(
    source.split("\n").filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
  for (const name of [
    "AIRWALLEX_CLIENT_ID", "AIRWALLEX_API_KEY", "AIRWALLEX_WEBHOOK_SECRET", "ADMIN_LOGIN_EMAIL", "ADMIN_LOGIN_PASSWORD", "ADMIN_TOKEN",
    "ORDER_NOTIFY_WEBHOOK_URL", "ORDER_NOTIFY_WEBHOOK_SECRET", "RESEND_API_KEY", "ORDER_NOTIFY_EMAIL_TO", "ORDER_NOTIFY_EMAIL_FROM",
  ]) {
    assert.ok(name in assigned, `${name} missing from .dev.vars.example`);
    assert.equal(assigned[name].trim(), "", `${name} must be empty in the tracked example`);
  }
  const gitignore = await read(".gitignore");
  assert.ok(gitignore.split("\n").includes(".dev.vars"));
  assert.ok(gitignore.includes("!.dev.vars.example"));
});

test("wrangler serves /admin through the Worker first and commits no secret values", async () => {
  const toml = await read("wrangler.toml");
  assert.match(toml, /run_worker_first\s*=\s*\[[^\]]*"\/admin\/\*"/);
  for (const name of ["ADMIN_TOKEN", "ADMIN_LOGIN_EMAIL", "ADMIN_LOGIN_PASSWORD", "AIRWALLEX_API_KEY", "AIRWALLEX_CLIENT_ID", "AIRWALLEX_WEBHOOK_SECRET", "RESEND_API_KEY", "META_CAPI_ACCESS_TOKEN", "META_TEST_EVENT_CODE"]) {
    assert.ok(!new RegExp(`^\\s*${name}\\s*=\\s*"[^"]+"`, "m").test(toml), `${name} must be a secret, not a wrangler var`);
  }
});

test("the admin page is noindex, writes only via the ship endpoint and keeps no credentials in page code", async () => {
  const html = await read("prototype/admin/index.html");
  const script = await read("prototype/js/admin.js");
  assert.ok(html.includes('content="noindex,nofollow"'));
  assert.ok(!/localStorage|sessionStorage|ADMIN_TOKEN|Authorization/.test(script), "auth is handled by the browser's Basic prompt only");
  assert.ok(!/method:\s*["'](PUT|PATCH|DELETE)/.test(script));
  const posts = script.match(/method:\s*["']POST["']/g) ?? [];
  assert.equal(posts.length, 3, "writes: mark-as-shipped, per-order MCF submit/sync, sync-all MCF (all POST)");
  assert.ok(/\/ship`/.test(script));
  assert.ok(/\/mcf\/\$\{action\}`/.test(script) && script.includes('"/admin/api/mcf/sync"'));
});
