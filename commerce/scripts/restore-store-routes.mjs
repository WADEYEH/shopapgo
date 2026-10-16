// Cutover rollback, step 2 (C11, docs/ops/runbook.md section 24): gives www back to Cloudflare Pages by putting the
// production Worker's routes back to the 24 store paths it had before the cutover, and removing the two whole-host
// routes the cutover deploy added. Step 1 (the Worker version) is `npx wrangler rollback <version> --env production`;
// routes are not part of a version, so this script is the other half.
//
//   node scripts/restore-store-routes.mjs           shows the routes now and what would change (changes nothing)
//   node scripts/restore-store-routes.mjs --apply   makes the change: adds the store paths first, then removes the
//                                                   whole-host routes, so the shop never answers from Pages
//
// Credentials: CLOUDFLARE_API_TOKEN if set (the M5 token can edit routes), otherwise the local `wrangler login`
// (`wrangler auth token`). The token is never printed. Custom domains (store., admin.) are not routes and stay.
import { execSync } from "node:child_process";

const ZONE = "shopapgo.com";
const SCRIPT = "apgo-us-store";
const PATHS = ["/products*", "/cart*", "/checkout*", "/api/*", "/terms*", "/privacy*", "/returns*", "/contact*", "/css/*", "/js/*", "/assets/*", "/.well-known/*"];
// The list in commerce/wrangler.toml at commit 0d60b41 (copied from the dashboard on 2026-10-06).
const STORE_ROUTES = ["www.shopapgo.com", "shopapgo.com"].flatMap((host) => PATHS.map((path) => `${host}${path}`));
const SITE_ROUTES = ["www.shopapgo.com/*", "shopapgo.com/*"];

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN.trim();
  const out = execSync("npx wrangler auth token", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const found = out.split(/\s+/).reverse().find((word) => /^[\w.-]{30,}$/.test(word));
  if (!found) throw new Error("No Cloudflare token: run `npx wrangler login` or set CLOUDFLARE_API_TOKEN.");
  return found;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const auth = { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" };
  const cf = async (path, init = {}) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: auth });
    const body = await res.json();
    if (!body.success) throw new Error(`${init.method ?? "GET"} ${path}: ${JSON.stringify(body.errors)}`);
    return body.result;
  };
  const [zone] = await cf(`/zones?name=${ZONE}`);
  if (!zone) throw new Error(`zone ${ZONE} not found`);
  const routes = await cf(`/zones/${zone.id}/workers/routes`);
  console.log(`Routes now on ${ZONE}:`);
  for (const route of routes) console.log(`  ${route.pattern} -> ${route.script ?? "(none)"}`);

  const have = new Set(routes.map((route) => route.pattern));
  const add = STORE_ROUTES.filter((pattern) => !have.has(pattern));
  const remove = routes.filter((route) => SITE_ROUTES.includes(route.pattern) && route.script === SCRIPT);
  console.log(`\nTo add (${add.length}): ${add.join(", ") || "none"}`);
  console.log(`To remove (${remove.length}): ${remove.map((route) => route.pattern).join(", ") || "none"}`);
  if (!apply) {
    console.log("\nNothing changed. Run again with --apply to make the change.");
    return;
  }
  for (const pattern of add) await cf(`/zones/${zone.id}/workers/routes`, { method: "POST", body: JSON.stringify({ pattern, script: SCRIPT }) });
  for (const route of remove) await cf(`/zones/${zone.id}/workers/routes/${route.id}`, { method: "DELETE" });
  const after = await cf(`/zones/${zone.id}/workers/routes`);
  console.log(`\nDone. Routes now (${after.length}):`);
  for (const route of after) console.log(`  ${route.pattern} -> ${route.script ?? "(none)"}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
