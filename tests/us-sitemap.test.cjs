const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadBindings } = require("next/dist/build/swc");
const { ROOT, compile } = require("./fixture.cjs");

before(() => loadBindings());

const SITE = "https://www.shopapgo.com";

// Every page.js under app/, converted to the URL it is actually served at.
// Route groups are parenthesised, so they contribute nothing to the path.
function routesOnDisk(dir = path.join(ROOT, "app"), segments = []) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
      found.push(...routesOnDisk(path.join(dir, entry.name), isGroup ? segments : [...segments, entry.name]));
    } else if (entry.name === "page.js") {
      found.push("/" + segments.join("/"));
    }
  }
  return found;
}

function sitemapEntries() {
  const { default: sitemap } = compile("app/sitemap.js", {
    aliases: { "@/lib/us/routes": compile("lib/us/routes.js"), "@/lib/site": compile("lib/site.js") },
  });
  return sitemap();
}

// "/" is excluded from the sitemap only while next.config.mjs 308s it to the US home.
// Derived rather than hardcoded: after the US_BASE = "" migration the README anticipates,
// routes.home becomes "/" itself, the redirect goes away, and "/" must then be listed.
// Without this the whole suite would fail misleadingly on the day of that migration.
function redirectedRoot() {
  const { routes } = compile("lib/us/routes.js");
  return routes.home === "/" ? null : "/";
}

test("the sitemap lists every page on disk except the redirected root", () => {
  const redirected = redirectedRoot();
  const onDisk = new Set(routesOnDisk().filter((r) => r !== redirected));
  const inSitemap = new Set(sitemapEntries().map((e) => new URL(e.url).pathname));
  const missing = [...onDisk].filter((r) => !inSitemap.has(r));
  const extra = [...inSitemap].filter((r) => !onDisk.has(r));
  assert.deepEqual(missing, [], `page.js exists but is missing from app/sitemap.js: ${missing.join(", ")}`);
  assert.deepEqual(extra, [], `app/sitemap.js lists a URL with no page.js: ${extra.join(", ")}`);
});

test("a root that only redirects is never advertised", () => {
  const redirected = redirectedRoot();
  if (redirected === null) return; // "/" is a real page; nothing to exclude.
  for (const { url } of sitemapEntries()) assert.notEqual(new URL(url).pathname, redirected);
});

test("every entry is an absolute URL on the canonical origin with a valid lastModified", () => {
  const entries = sitemapEntries();
  assert.ok(entries.length > 0);
  for (const { url, lastModified } of entries) {
    assert.ok(url.startsWith(SITE + "/"), `not on the canonical origin: ${url}`);
    assert.equal(new URL(url).href, url, `not normalised: ${url}`);
    assert.doesNotMatch(new URL(url).pathname, /\/\//, `double slash: ${url}`);
    assert.match(lastModified, /^\d{4}-\d{2}-\d{2}$/, `lastModified is not a plain ISO date: ${lastModified}`);
    assert.ok(!Number.isNaN(Date.parse(lastModified)), `unparseable date: ${lastModified}`);
  }
});

test("changeFrequency and priority stay out", () => {
  for (const entry of sitemapEntries()) {
    assert.equal("changeFrequency" in entry, false);
    assert.equal("priority" in entry, false);
  }
});

test("robots.txt allows everything and points at the sitemap", () => {
  const site = compile("lib/site.js");
  const { default: robots } = compile("app/robots.js", { aliases: { "@/lib/site": site } });
  // Re-parsed through JSON: objects built inside the vm context come from a different
  // realm, so deepEqual would compare prototypes rather than values.
  const result = JSON.parse(JSON.stringify(robots()));
  assert.equal(result.sitemap, SITE + "/sitemap.xml");
  assert.deepEqual(result.rules, [{ userAgent: "*", allow: "/" }]);
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(), /disallow/);
});
