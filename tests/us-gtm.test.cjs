const { before, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadBindings } = require("next/dist/build/swc");
const { compile } = require("./fixture.cjs");

before(() => loadBindings());

// next/script is stubbed with a marker component. The automatic JSX runtime does not
// call it, so the element's `type` is the stub itself and `props` are what was passed.
function ScriptStub() {
  return null;
}

function fixture(env = {}) {
  const config = compile("lib/us/config.js", { env });
  const { default: GtmScripts } = compile("components/us/GtmScripts.js", {
    env,
    aliases: {
      "@/lib/us/config": config,
      "next/script": { __esModule: true, default: ScriptStub },
    },
  });
  return { ...config, GtmScripts };
}

const VALID = "GTM-ABCD123";

test("the container stays off until both the flag and a valid ID are present", () => {
  for (const env of [
    {},
    { NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true" },
    { NEXT_PUBLIC_APGO_US_GTM_ID: VALID },
    { NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "false", NEXT_PUBLIC_APGO_US_GTM_ID: VALID },
    { NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "", NEXT_PUBLIC_APGO_US_GTM_ID: VALID },
  ]) {
    const f = fixture(env);
    assert.equal(f.gtmContainerId(), undefined, `gate opened for ${JSON.stringify(env)}`);
    assert.equal(f.GtmScripts(), null);
  }
});

test("malformed container IDs are rejected rather than interpolated", () => {
  for (const id of [
    "",
    " ",
    "gtm-abcd123",
    "GTM-abcd123",
    "G-ABCD123",
    "UA-12345-1",
    "GTM-AB",
    "GTM-ABCDEFGHIJKL",
    "GTM-ABCD123'+alert(1)+'",
    'GTM-ABCD123"+alert(1)+"',
    "GTM-ABCD123</script><script>x",
    "GTM-ABCD123&gtm_auth=x",
    "GTM-ABCD123?id=evil",
    "GTM-ABCD 123",
  ]) {
    const f = fixture({ NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true", NEXT_PUBLIC_APGO_US_GTM_ID: id });
    assert.equal(f.GtmScripts(), null, `accepted a bad container id: ${JSON.stringify(id)}`);
  }
});

test("surrounding whitespace on an otherwise valid ID is tolerated", () => {
  const f = fixture({ NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true", NEXT_PUBLIC_APGO_US_GTM_ID: `  ${VALID}\n` });
  assert.equal(f.gtmContainerId(), VALID);
});

test("a valid container renders one afterInteractive loader for that ID", () => {
  const f = fixture({ NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true", NEXT_PUBLIC_APGO_US_GTM_ID: VALID });
  const el = f.GtmScripts();
  assert.equal(el.type, ScriptStub, "the loader must be rendered through next/script");
  assert.equal(el.props.strategy, "afterInteractive");
  assert.equal(el.props.id, "gtm-loader");

  const html = el.props.dangerouslySetInnerHTML.__html;
  assert.match(html, /https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=/);
  assert.match(html, new RegExp(`"${VALID}"`));
  // gtm.start must be pushed before the loader runs, in one statement.
  assert.ok(html.indexOf("gtm.start") < html.indexOf("googletagmanager"));
  assert.match(html, /event:'gtm\.js'/);
  // Nothing that could terminate the surrounding <script> or open a tag.
  assert.doesNotMatch(html, /[<>]/);
});

test("no noscript iframe is emitted", () => {
  const f = fixture({ NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true", NEXT_PUBLIC_APGO_US_GTM_ID: VALID });
  assert.doesNotMatch(JSON.stringify(f.GtmScripts()), /noscript/i);
});
