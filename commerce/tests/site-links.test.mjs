import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { siteLinks } from "../worker/site.js";

test("store links go to the brand home (/) and its guides (/us/guides) on the configured site", () => {
  assert.deepEqual(siteLinks(), { home: "https://www.shopapgo.com/", guides: "https://www.shopapgo.com/us/guides" });
  // Only the origin counts, so the older ".../us" form keeps working.
  assert.deepEqual(siteLinks({ SITE_HOME_URL: "https://www.shopapgo.com/us" }), siteLinks());
  assert.deepEqual(siteLinks({ SITE_HOME_URL: "https://staging.shopapgo.com" }), { home: "https://staging.shopapgo.com/", guides: "https://staging.shopapgo.com/us/guides" });
  assert.equal(siteLinks({ SITE_HOME_URL: "http://127.0.0.1:3012/us/" }).guides, "http://127.0.0.1:3012/us/guides");
  for (const value of ["javascript:alert(1)", "https://user:password@example.com/us", "http://example.com/us", "https://example.com/?redirect=foo"]) {
    assert.equal(siteLinks({ SITE_HOME_URL: value }).home, "https://www.shopapgo.com/");
  }
});

test("every store page's built-in fallback links point at the current brand home and guides", async () => {
  const dir = new URL("../prototype/", import.meta.url);
  const pages = (await readdir(dir)).filter((name) => name.endsWith(".html"));
  let checked = 0;
  for (const page of pages) {
    const html = await readFile(new URL(page, dir), "utf8");
    for (const [attribute, href] of [["data-site-home", "https://www.shopapgo.com/"], ["data-site-guides", "https://www.shopapgo.com/us/guides"]]) {
      for (const match of html.matchAll(new RegExp(`<a [^>]*${attribute}[^>]*>`, "g"))) {
        assert.match(match[0], new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"`), `${page}: ${match[0]}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 10, `checked ${checked} links`); // the policy pages and v3 (the cart and checkout are Next.js pages)
});
