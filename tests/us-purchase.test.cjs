const { before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadBindings, transformSync } = require("next/dist/build/swc");
const { renderToStaticMarkup } = require("react-dom/server");
const { ROOT } = require("./fixture.cjs");

before(() => loadBindings());

// Execute the actual routes, analytics and CTA modules with isolated public env values.
function fixture() {
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
      exports, process: { env: {} }, window,
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
      require: (name) => aliases[name] || require(name),
    }, { filename });
    return exports;
  }
  const routes = compile("lib/us/routes.js");
  const analytics = compile("lib/us/analytics.js");
  const { default: ProductCta } = compile("components/us/landing/ProductCta.js", {
    "@/lib/us/routes": routes, "@/lib/us/analytics": analytics,
  });
  return { ...routes, ProductCta, window, events };
}

test("each known SKU maps to its same-host product path", () => {
  const f = fixture();
  assert.equal(f.productPathFor("d204"), "/products/d204");
  assert.equal(f.productPathFor("d215"), "/products/d215");
  assert.equal(f.store.d204, "/products/d204");
  assert.equal(f.store.d215, "/products/d215");
});

test("each enabled product CTA navigates on-site and reports the clicked SKU/placement", () => {
  const f = fixture();
  for (const sku of ["d204", "d215"]) {
    for (const placement of ["hero", "product", "sticky", "final"]) {
      const button = f.ProductCta({ sku, placement, children: `Shop ${sku.toUpperCase()}` });
      assert.equal(button.props.href, `/products/${sku}`);
      assert.equal(button.props["aria-disabled"], "false");
      assert.equal(button.props.target, undefined);
      assert.doesNotMatch(renderToStaticMarkup(button), /amazon/i);
      assert.match(renderToStaticMarkup(button), new RegExp(`href="/products/${sku}"`));
      button.props.onClick({ preventDefault: () => assert.fail("Enabled CTA was prevented") });
      const event = f.window.dataLayer.at(-1);
      assert.equal(event.event, "amazon_referral_click");
      assert.equal(event.sku, sku);
      assert.equal(event.placement, placement);
      assert.equal(f.events.at(-1).type, "apgo:analytics");
    }
  }
});

test("unknown SKUs stay disabled and do not navigate or track", () => {
  const f = fixture();
  assert.equal(f.productPathFor("missing"), undefined);
  const button = f.ProductCta({ sku: "missing", placement: "hero", children: "Shop" });
  assert.equal(button.props.href, undefined);
  assert.equal(button.props["aria-disabled"], "true");
  let prevented = false;
  button.props.onClick({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(f.window.dataLayer.length, 0);
  assert.equal(f.events.length, 0);
  assert.doesNotMatch(renderToStaticMarkup(button), /href=/);
});

test("landing shopper CTAs and price copy no longer send buyers to Amazon", () => {
  const files = [
    "components/us/landing/Hero.js",
    "components/us/landing/Landing.js",
    "components/us/landing/RoutineSection.js",
    "components/us/landing/FinalSection.js",
    "components/us/landing/ProductCta.js",
    "lib/us/faq.js",
    "app/(us)/page.js",
    "app/(us)/layout.js",
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.doesNotMatch(src, /Buy on Amazon/);
    assert.doesNotMatch(src, /Buy Dry on Amazon/);
    assert.doesNotMatch(src, /Buy Wet on Amazon/);
    assert.doesNotMatch(src, /Available on Amazon/);
    assert.doesNotMatch(src, /Opens Amazon\.com/);
    assert.doesNotMatch(src, /amazon\.com\/dp/i);
    assert.doesNotMatch(src, /handled on Amazon\.com/);
    assert.doesNotMatch(src, /AmazonCta/);
  }
  const faq = fs.readFileSync(path.join(ROOT, "lib/us/faq.js"), "utf8");
  assert.match(faq, /handled at checkout on this site/);
});
