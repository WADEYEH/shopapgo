import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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
  const files = (await readdir(new URL("../../public/admin/", import.meta.url))).filter((file) => file.endsWith(".js")).sort();
  const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await read(`../public/admin/${file}`)])));
  const script = Object.values(sources).join("\n");
  assert.ok(html.includes('content="noindex,nofollow"'));
  // Its own files are under /admin/ (behind the admin login); the logo is the only other file (worker/hosts.js).
  const local = [...new Set([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]).filter((url) => !url.startsWith("https://")))];
  assert.deepEqual(local, ["./admin.css", "./admin.js", "#main", "./#/", "/us/assets/brand/apgo-logo.png"]);
  assert.ok(sources["admin.js"].includes('from "./api.js"') && sources["admin.js"].includes('from "./ui.js"'));
  assert.ok(!/sessionStorage|ADMIN_TOKEN|Authorization/.test(script), "no credentials stored or sent by page code");
  // The browser keeps one thing: the language choice (D49), in i18n.js.
  for (const [file, source] of Object.entries(sources)) if (file !== "i18n.js") assert.ok(!/localStorage/.test(source), `${file} uses localStorage`);
  assert.deepEqual([...sources["i18n.js"].matchAll(/localStorage\.(\w+)\((\w+)/g)].map((m) => `${m[1]}:${m[2]}`), ["getItem:LANG_KEY", "setItem:LANG_KEY"]);
  assert.ok(!/method:\s*["'](PUT|PATCH|DELETE)/.test(script));
  const posts = script.match(/method:\s*["']POST["']/g) ?? [];
  assert.equal(posts.length, 21, "writes: team emails, MCF sync-all, Hold test order, refund sync, sandbox refund check, MCF submit/sync/cancel, cancel and refund, mark-as-shipped, email retry, notes, confirm/cancel/address, stop selling, members; PR 3-10: refund, customer notes, privacy request record/close, delete customer data; PR 3-12: product content (review and publish), restore a version, upload a photo");
  assert.ok(/\/ship`/.test(sources["order.js"]));
  assert.ok(/\/mcf\/\$\{action\}`/.test(sources["order.js"]) && sources["orders.js"].includes('"/admin/api/mcf/sync"'));
  assert.ok(/\/emails\/\$\{encodeURIComponent\(mail\.kind\)\}\/retry`/.test(sources["order.js"]));
  assert.ok(sources["order.js"].includes("/refunds/sync`") && sources["order.js"].includes("/refunds/sandbox-check`"));
  assert.ok(sources["order.js"].includes("/cancel-refund`") && sources["orders.js"].includes('"/admin/api/mcf/hold-test"'));
  assert.ok(sources["order.js"].includes("/notes`") && sources["products.js"].includes("/sale`"));
  assert.ok(sources["order.js"].includes("/refund`, {") && sources["customers.js"].includes("/notes`") && sources["customers.js"].includes("/erase`"));
  assert.ok(sources["customers.js"].includes("/privacy-requests`") && sources["customers.js"].includes("/close`"));
  // Text is set as text: no HTML parsing of data anywhere in the page code.
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(script), "no HTML parsing");
});
