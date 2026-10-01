import assert from "node:assert/strict";
import test from "node:test";
import { siteLinks } from "../worker/site.js";

test("store links return to the brand site and its existing guide routes", () => {
  assert.deepEqual(siteLinks(), { home: "https://www.shopapgo.com/us", guides: "https://www.shopapgo.com/us/guides" });
  assert.equal(siteLinks({ SITE_HOME_URL: "http://127.0.0.1:3012/us/" }).guides, "http://127.0.0.1:3012/us/guides");
  for (const value of ["javascript:alert(1)", "https://user:password@example.com/us", "http://example.com/us", "https://example.com/?redirect=foo"]) {
    assert.equal(siteLinks({ SITE_HOME_URL: value }).home, "https://www.shopapgo.com/us");
  }
});
