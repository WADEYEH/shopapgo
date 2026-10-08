import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test(".dev.vars.example documents every secret with no real values", async () => {
  const source = await read(".dev.vars.example");
  const assigned = Object.fromEntries(
    source.split("\n").filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
  for (const name of [
    "AIRWALLEX_CLIENT_ID", "AIRWALLEX_API_KEY", "AIRWALLEX_WEBHOOK_SECRET", "ADMIN_LOGIN_EMAIL", "ADMIN_LOGIN_PASSWORD", "ADMIN_TOKEN",
    "ORDER_NOTIFY_WEBHOOK_URL", "ORDER_NOTIFY_WEBHOOK_SECRET", "RESEND_API_KEY", "ORDER_NOTIFY_EMAIL_TO", "ORDER_NOTIFY_EMAIL_FROM",
    "RESEND_WEBHOOK_SECRET", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "META_CAPI_ACCESS_TOKEN",
    "AMAZON_OUTBOUND_BASE_URL", "OUTBOUND_INTERNAL_TOKEN",
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
  const workerFirst = [...toml.matchAll(/^run_worker_first\s*=\s*(.+)$/gm)].map((match) => match[1]);
  assert.ok(workerFirst.length >= 3, "every environment configures run_worker_first");
  for (const value of workerFirst) assert.ok(value === "true" || value.includes('"/admin/*"'), `run_worker_first = ${value}`);
  for (const name of [
    "ADMIN_TOKEN", "ADMIN_LOGIN_EMAIL", "ADMIN_LOGIN_PASSWORD", "AIRWALLEX_API_KEY", "AIRWALLEX_CLIENT_ID", "AIRWALLEX_WEBHOOK_SECRET",
    "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "META_CAPI_ACCESS_TOKEN", "META_TEST_EVENT_CODE", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID",
    "STAGING_BASIC_AUTH_USER", "STAGING_BASIC_AUTH_PASSWORD", "OUTBOUND_INTERNAL_TOKEN",
  ]) {
    assert.ok(!new RegExp(`^\\s*${name}\\s*=\\s*"[^"]+"`, "m").test(toml), `${name} must be a secret, not a wrangler var`);
  }
});

test("the admin page is noindex, writes only through the known back-office endpoints and keeps no credentials in page code", async () => {
  const html = await read("../public/admin/index.html");
  const script = await read("../public/admin/admin.js");
  assert.ok(html.includes('content="noindex,nofollow"'));
  // Its own files are under /admin/ (behind the admin login); the logo is the only other file (worker/hosts.js).
  const local = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]).filter((url) => !url.startsWith("https://"));
  assert.deepEqual(local, ["./commerce.css", "./admin.css", "./admin.js", "./", "/us/assets/brand/apgo-logo.png"]);
  assert.ok(script.includes('from "./ui.js"'));
  assert.ok(!/localStorage|sessionStorage|ADMIN_TOKEN|Authorization/.test(script), "no credentials stored or sent by page code");
  assert.ok(!/method:\s*["'](PUT|PATCH|DELETE)/.test(script));
  const posts = script.match(/method:\s*["']POST["']/g) ?? [];
  assert.equal(posts.length, 6, "writes: mark-as-shipped, MCF submit/sync, email retry, refund sync, sandbox refund check, MCF sync-all");
  assert.ok(/\/ship`/.test(script));
  assert.ok(/\/mcf\/\$\{action\}`/.test(script) && script.includes('"/admin/api/mcf/sync"'));
  assert.ok(/\/emails\/\$\{encodeURIComponent\(mail\.kind\)\}\/retry`/.test(script));
  assert.ok(script.includes("/refunds/sync`") && script.includes("/refunds/sandbox-check`"));
});
