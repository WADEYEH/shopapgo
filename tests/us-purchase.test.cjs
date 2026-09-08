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
    vm.runInNewContext(code, {
      exports, process: { env }, window,
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
    const f = fixture({ ...ready, NEXT_PUBLIC_APGO_US_D204_AMAZON_URL: url });
    assert.equal(f.amazonUrlFor("d204"), undefined);
    assert.equal(f.amazonUrlFor("missing"), undefined);
    assert.equal(f.amazonUrlFor("d215"), ready.NEXT_PUBLIC_APGO_US_D215_AMAZON_URL);
  }
});
