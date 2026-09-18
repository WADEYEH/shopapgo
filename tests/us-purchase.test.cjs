const { before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadBindings, transformSync } = require("next/dist/build/swc");
const { renderToStaticMarkup } = require("react-dom/server");

before(() => loadBindings());

// Execute the actual config, analytics and CTA modules with isolated public env values.
function fixture(env = {}) {
  const events = [];
  const window = { dataLayer: [], dispatchEvent: (event) => events.push(event) };
  function compile(file, aliases = {}) {
    const filename = path.resolve(__dirname, "..", file);
    const { code } = transformSync(fs.readFileSync(filename, "utf8"), {
      filename,
      jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2020", transform: { react: { runtime: "automatic" } } },
      module: { type: "commonjs" },
    });
    const exports = {};
    // URL/URLSearchParams are Node globals, not V8 globals, so a fresh vm context has
    // neither. lib/us/config.js needs both to build attribution URLs.
    vm.runInNewContext(code, {
      exports, process: { env }, window, URL, URLSearchParams,
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
      require: (name) => aliases[name] || require(name),
    }, { filename });
    return exports;
  }
  const config = compile("lib/us/config.js");
  const analytics = compile("lib/us/analytics.js");
  const { default: AmazonCta } = compile("components/us/landing/AmazonCta.js", {
    "@/lib/us/config": config, "@/lib/us/analytics": analytics,
  });
  return { ...config, AmazonCta, window, events };
}

const ready = {
  NEXT_PUBLIC_APGO_US_LINKS_READY: "true",
  NEXT_PUBLIC_APGO_US_D204_LINK_READY: "true",
  NEXT_PUBLIC_APGO_US_D215_LINK_READY: "true",
  NEXT_PUBLIC_APGO_US_D204_AMAZON_URL: "https://www.amazon.com/dp/TESTD204",
  NEXT_PUBLIC_APGO_US_D215_AMAZON_URL: "https://www.amazon.com/dp/TESTD215",
};

const attribution = { NEXT_PUBLIC_APGO_US_AMAZON_ATTRIBUTION: "maas=maas_adg_test_123&ref_=aa_maas" };

test("default, master and per-product gates prevent outbound navigation and analytics", () => {
  for (const env of [{}, { ...ready, NEXT_PUBLIC_APGO_US_LINKS_READY: "false" }, { ...ready, NEXT_PUBLIC_APGO_US_D204_LINK_READY: "false" }]) {
    const f = fixture(env);
    const button = f.AmazonCta({ sku: "d204", placement: "sticky", children: "Buy on Amazon" });
    assert.equal(button.props.href, undefined);
    assert.equal(button.props["aria-disabled"], "true");
    let prevented = false;
    button.props.onClick({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(f.window.dataLayer.length, 0);
    assert.equal(f.events.length, 0);
    assert.doesNotMatch(renderToStaticMarkup(button), /href=/);
  }
});

test("each enabled product renders its own URL and reports the clicked SKU/placement", () => {
  const f = fixture(ready);
  for (const sku of ["d204", "d215"]) {
    for (const placement of ["product", "sticky"]) {
      const button = f.AmazonCta({ sku, placement, children: "Buy on Amazon" });
      assert.equal(button.props.href, ready[`NEXT_PUBLIC_APGO_US_${sku.toUpperCase()}_AMAZON_URL`]);
      assert.equal(button.props["aria-disabled"], "false");
      assert.match(renderToStaticMarkup(button), /href="https:\/\/www.amazon.com\/dp\/TESTD2/);
      button.props.onClick({ preventDefault: () => assert.fail("Enabled CTA was prevented") });
      const event = f.window.dataLayer.at(-1);
      assert.equal(event.event, "amazon_referral_click");
      assert.equal(event.sku, sku);
      assert.equal(event.placement, placement);
      assert.equal(f.events.at(-1).type, "apgo:analytics");
    }
  }
});

test("invalid destinations and unknown SKUs stay disabled", () => {
  for (const url of ["", "http://amazon.com/dp/TEST", "https://amazon.com.evil.example/dp/TEST", "https://evil.example/amazon.com/", "javascript:alert(1)"]) {
    const f = fixture({ ...ready, ...attribution, NEXT_PUBLIC_APGO_US_D204_AMAZON_URL: url });
    assert.equal(f.amazonUrlFor("d204"), undefined);
    assert.equal(f.amazonUrlFor("missing"), undefined);
    // The healthy product is unaffected by its sibling's bad URL. Attribution is
    // configured here too, so compare the destination rather than the whole string.
    const d215 = new URL(f.amazonUrlFor("d215"));
    assert.equal(d215.origin + d215.pathname, ready.NEXT_PUBLIC_APGO_US_D215_AMAZON_URL);
  }
});

test("attribution params are appended without disturbing the destination", () => {
  const f = fixture({ ...ready, ...attribution });
  assert.equal(f.amazonUrlFor("d204"), "https://www.amazon.com/dp/TESTD204?maas=maas_adg_test_123&ref_=aa_maas");
  assert.equal(f.amazonUrlFor("d215"), "https://www.amazon.com/dp/TESTD215?maas=maas_adg_test_123&ref_=aa_maas");
});

test("attribution merges into an existing query string and keeps the fragment", () => {
  const f = fixture({
    ...ready, ...attribution,
    NEXT_PUBLIC_APGO_US_D204_AMAZON_URL: "https://www.amazon.com/dp/TESTD204?th=1#customerReviews",
  });
  const href = f.amazonUrlFor("d204");
  const url = new URL(href);
  assert.equal(url.searchParams.get("th"), "1");
  assert.equal(url.searchParams.get("maas"), "maas_adg_test_123");
  assert.equal(url.hash, "#customerReviews");
  assert.match(href, f.AMAZON_URL_RE);
});

test("attribution can never change host or scheme, or smuggle in an extra param", () => {
  const hostile = [
    "tag=evil%26maas%3Dhijack",
    "tag=x#@evil.example/",
    "@evil.example/?tag=x",
    "://",
    "%%%",
    "&&&",
    "bad key=1",
    "tag=" + "a".repeat(5000),
    "javascript=alert(1)",
  ];
  for (const params of hostile) {
    const f = fixture({ ...ready, NEXT_PUBLIC_APGO_US_AMAZON_ATTRIBUTION: params });
    const href = f.amazonUrlFor("d204");
    const url = new URL(href);
    assert.match(href, f.AMAZON_URL_RE, `escaped the allowlist with ${params}`);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "www.amazon.com");
    assert.equal(url.pathname, "/dp/TESTD204");
    assert.equal(url.searchParams.get("maas"), null);
  }
});

test("keys that fail the allowlist are dropped without taking valid ones with them", () => {
  const f = fixture({ ...ready, NEXT_PUBLIC_APGO_US_AMAZON_ATTRIBUTION: "bad key=1&ok=2" });
  const url = new URL(f.amazonUrlFor("d204"));
  assert.equal(url.searchParams.has("bad key"), false);
  assert.equal(url.searchParams.get("ok"), "2");
});

test("a per-product attribution value overrides the shared one", () => {
  const f = fixture({ ...ready, ...attribution, NEXT_PUBLIC_APGO_US_D204_AMAZON_ATTRIBUTION: "tag=apgo-d204-20" });
  const d204 = new URL(f.amazonUrlFor("d204"));
  assert.equal(d204.searchParams.get("tag"), "apgo-d204-20");
  assert.equal(d204.searchParams.has("maas"), false);
  assert.equal(new URL(f.amazonUrlFor("d215")).searchParams.get("maas"), "maas_adg_test_123");
});

test("sku and placement tokens resolve per CTA", () => {
  const f = fixture({ ...ready, NEXT_PUBLIC_APGO_US_AMAZON_ATTRIBUTION: "ascsubtag=us-{sku}-{placement}" });
  assert.equal(new URL(f.amazonUrlFor("d204", "hero")).searchParams.get("ascsubtag"), "us-d204-hero");
  assert.equal(
    f.AmazonCta({ sku: "d215", placement: "sticky", children: "x" }).props.href,
    "https://www.amazon.com/dp/TESTD215?ascsubtag=us-d215-sticky"
  );
});

test("attribution never resurrects a gated or invalid CTA", () => {
  for (const env of [
    { ...ready, ...attribution, NEXT_PUBLIC_APGO_US_LINKS_READY: "false" },
    { ...ready, ...attribution, NEXT_PUBLIC_APGO_US_D204_LINK_READY: "false" },
    { ...ready, ...attribution, NEXT_PUBLIC_APGO_US_D204_AMAZON_URL: "javascript:alert(1)" },
    { ...ready, ...attribution, NEXT_PUBLIC_APGO_US_D204_AMAZON_URL: "https://amazon.com.evil.example/dp/TEST" },
    { ...ready, ...attribution, NEXT_PUBLIC_APGO_US_D204_AMAZON_URL: "" },
  ]) {
    const f = fixture(env);
    assert.equal(f.amazonUrlFor("d204", "hero"), undefined);
    const button = f.AmazonCta({ sku: "d204", placement: "hero", children: "Buy on Amazon" });
    assert.equal(button.props.href, undefined);
    assert.equal(button.props["aria-disabled"], "true");
    let prevented = false;
    button.props.onClick({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(f.window.dataLayer.length, 0);
    assert.doesNotMatch(renderToStaticMarkup(button), /href=/);
  }
});
