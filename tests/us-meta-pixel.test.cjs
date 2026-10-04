const { before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadBindings } = require("next/dist/build/swc");
const { ROOT, compile } = require("./fixture.cjs");

before(() => loadBindings());

// next/script is stubbed with a marker component (see us-gtm.test.cjs).
function ScriptStub() {
  return null;
}

function fixture(env = {}) {
  const config = compile("lib/us/config.js", { env });
  const { default: MetaPixel } = compile("components/us/MetaPixel.js", {
    env,
    aliases: {
      "@/lib/us/config": config,
      "next/script": { __esModule: true, default: ScriptStub },
    },
  });
  return { ...config, MetaPixel };
}

const ID = "2606879866471418";
const ON = { NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true", NEXT_PUBLIC_APGO_US_META_PIXEL_ID: ID };

test("the pixel stays off until both the analytics flag and a valid ID are present", () => {
  for (const env of [
    {},
    { NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true" },
    { NEXT_PUBLIC_APGO_US_META_PIXEL_ID: ID },
    { NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "false", NEXT_PUBLIC_APGO_US_META_PIXEL_ID: ID },
    { NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "", NEXT_PUBLIC_APGO_US_META_PIXEL_ID: ID },
    // GTM being ready is not enough: the Meta ID has to be set too.
    { NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true", NEXT_PUBLIC_APGO_US_GTM_ID: "GTM-ABCD123" },
  ]) {
    const f = fixture(env);
    assert.equal(f.metaPixelId(), undefined, `gate opened for ${JSON.stringify(env)}`);
    assert.equal(f.MetaPixel(), null);
  }
});

test("malformed pixel IDs are rejected rather than interpolated", () => {
  for (const id of [
    "",
    " ",
    "1234567", // too short
    "123456789012345678901", // too long
    "abc12345678",
    "2606879866471418a",
    "2606879866471418'+alert(1)+'",
    '2606879866471418"+alert(1)+"',
    "2606879866471418</script><script>x",
    "2606879866 471418",
    "-2606879866471418",
    "2606879866471418.5",
  ]) {
    const f = fixture({ ...ON, NEXT_PUBLIC_APGO_US_META_PIXEL_ID: id });
    assert.equal(f.MetaPixel(), null, `accepted a bad pixel id: ${JSON.stringify(id)}`);
  }
});

test("surrounding whitespace on an otherwise valid ID is tolerated", () => {
  const f = fixture({ ...ON, NEXT_PUBLIC_APGO_US_META_PIXEL_ID: `  ${ID}\n` });
  assert.equal(f.metaPixelId(), ID);
});

test("a valid pixel renders one afterInteractive loader that inits and sends PageView", () => {
  const el = fixture(ON).MetaPixel();
  assert.equal(el.type, ScriptStub, "the loader must be rendered through next/script");
  assert.equal(el.props.strategy, "afterInteractive");
  assert.equal(el.props.id, "meta-pixel-loader");
  const html = el.props.dangerouslySetInnerHTML.__html;
  assert.match(html, /https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.match(html, new RegExp(`fbq\\('init',"${ID}"\\)`));
  assert.match(html, /fbq\('track','PageView'\)/);
  assert.match(html, /if\(f\.fbq\)return/);
  assert.doesNotMatch(html, /[<>]/);
  assert.doesNotMatch(JSON.stringify(el), /noscript/i);
});

// Runs the real loader snippet in a bare context with a minimal DOM.
function runLoader(preset) {
  const inserted = [];
  const window = preset ? { fbq: preset } : {};
  const document = {
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: (node) => inserted.push(node) } }],
  };
  window.window = window;
  vm.runInNewContext(fixture(ON).MetaPixel().props.dangerouslySetInnerHTML.__html, { window, document });
  return { window, inserted };
}

test("the loader queues init + PageView and injects fbevents.js once", () => {
  const { window, inserted } = runLoader();
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].src, "https://connect.facebook.net/en_US/fbevents.js");
  assert.equal(inserted[0].async, true);
  assert.deepEqual(Array.from(window.fbq.queue, (args) => Array.from(args)), [["init", ID], ["track", "PageView"]]);
});

test("an existing window.fbq is left alone: no second init, no second script", () => {
  const existing = Object.assign(() => {}, { queue: [] });
  const { window, inserted } = runLoader(existing);
  assert.equal(window.fbq, existing);
  assert.equal(existing.queue.length, 0);
  assert.equal(inserted.length, 0);
});

test("the US layout mounts MetaPixel next to GtmScripts, and nothing else loads Meta", () => {
  const layout = fs.readFileSync(path.join(ROOT, "app/(us)/layout.js"), "utf8");
  assert.match(layout, /<GtmScripts \/>\s*<MetaPixel \/>/);
  const env = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(env, /^NEXT_PUBLIC_APGO_US_META_PIXEL_ID=$/m);
  assert.doesNotMatch(env, new RegExp(ID), "the real ID is not baked into .env.example");
});

function analyticsFixture(fbq) {
  const events = [];
  const window = {
    dataLayer: undefined,
    dispatchEvent: (event) => events.push(event.detail),
  };
  if (fbq) window.fbq = fbq;
  const { track } = compile("lib/us/analytics.js", {
    globals: { window, CustomEvent: class { constructor(name, init) { this.name = name; this.detail = init.detail; } } },
  });
  return { track, window, events };
}

test("amazon_referral_click is mirrored to Meta as AmazonClick; other events are not", () => {
  const calls = [];
  const { track, window, events } = analyticsFixture((...args) => calls.push(args));
  track("amazon_referral_click", { sku: "d204", placement: "hero" });
  track("faq_expand", { question: "q1" });
  track("scroll_depth", { percent: 25 });
  // JSON round trip: the objects were built inside a vm context.
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["trackCustom", "AmazonClick", { sku: "d204", placement: "hero" }]]);
  // The dataLayer / DOM event contract is untouched.
  assert.deepEqual(Array.from(window.dataLayer, (e) => e.event), ["amazon_referral_click", "faq_expand", "scroll_depth"]);
  assert.equal(events.length, 3);
});

test("without the pixel, or if fbq throws, the click still tracks normally", () => {
  const without = analyticsFixture();
  without.track("amazon_referral_click", { sku: "d215", placement: "final" });
  assert.equal(without.window.dataLayer.length, 1);

  const throwing = analyticsFixture(() => { throw new Error("blocked"); });
  assert.doesNotThrow(() => throwing.track("amazon_referral_click", { sku: "d215", placement: "final" }));
  assert.equal(throwing.window.dataLayer.length, 1);
});
