# APGO US Amazon referral landing page

A framework-free, local-first prototype for an APGO US brand and product-choice
page. It introduces D204 and D215, explains their different application points,
and sends visitors to the matching Amazon.com listing. It does not sell products
through Shopify or this prototype.

## Current state

- Local review only; no deployment is configured.
- `preview: true` and `noindex,nofollow` are the safe defaults.
- Amazon URLs and support email are intentionally blank/not ready. Local
  D204/D215 application videos are enabled for prototype review.
- Missing external values produce disabled controls rather than placeholder
  links or invented media.
- Product imagery must follow `docs/asset-map.md` after the asset lane completes
  it.

## Run locally

Requirements:

- Python 3 for the static server;
- Node.js 20+ and npm for tests/capture.

Start the prototype exactly as the handoff runtime expects:

```bash
python3 -m http.server 4173 -d prototype
```

Then open <http://127.0.0.1:4173/>. Do not open `index.html` through `file://`;
video, module, and browser-security behavior must be reviewed through HTTP.

Convenience commands after `npm install`:

```bash
npm run serve
npm run test:static
npm run test:e2e
npm run test
npm run capture
npm run record
```

`npm run capture` writes the required full-page and interaction screenshots to
`review/`. `npm run record` writes a short browser walkthrough there. These are
generated review artifacts and are not source assets.

## Configuration

All unresolved external values live in `prototype/js/config.js`:

```js
window.APGO_CONFIG = {
  preview: true,
  supportEmail: "",
  products: {
    d204: {
      amazonUrl: "",
      linkReady: false,
      videoReady: true,
    },
    d215: {
      amazonUrl: "",
      linkReady: false,
      videoReady: true,
    },
  },
};
```

Rules:

- Amazon URLs must be HTTPS on `amazon.com` or one of its subdomains.
- Mark `linkReady:true` only after the exact product and its Attribution URL have
  been verified in a signed-out US session.
- Put video paths on the matching `[data-video-card]` as `data-video-src`; mark
  `videoReady:true` only after the footage/poster/captions are approved. The
  prototype falls back to `assets/video/{product-code}-application.mp4` and
  `assets/video/{product-code}-captions-en.vtt`.
- D215 local playback does not itself approve US publication rights; record
  evidence of those reuse rights before public handoff.
- Supply only a real monitored support email.
- Keep `preview:true` through visual, content, market, policy, analytics, and
  destination-link QA. Both product links are additionally required before the
  runtime permits an indexable robots state.

After editing config while the page is already open, dispatch
`window.dispatchEvent(new Event("apgo:config-updated"))` to refresh links,
email, video availability, and robots state without reloading.

## Interaction contract

- Initial selection: D204.
- `#d204` and `#d215` deep-link the selected routine.
- Hero/product/final CTAs remain fixed to their declared product.
- Header/mobile sticky CTAs follow the selected product.
- An unavailable URL has no `href` and no click analytics.
- Mobile sticky appears only after the hero and hides over the final choice.
- The sticky JavaScript breakpoint is 719 px, matching the prototype CSS.
- Videos are hydrated only by a deliberate click, never autoplay on page load,
  and pause the other video on play.
- FAQ uses native `<details>/<summary>` and works without JavaScript.
- Events are pushed to `window.dataLayer` and dispatched as `apgo:analytics`.

The fixed hooks are documented in `IMPLEMENTATION_CONTRACT.md` and
`docs/shopify-handoff.md`.

## Project map

```text
prototype/
  index.html                 page structure
  css/app.css                responsive visual system
  js/config.js               only external runtime values
  js/app.js                  framework-free interactions and analytics hooks
  assets/                    approved/fallback media organized by asset lane
docs/
  CLAUDE_DESIGN_BRIEF.md     standalone brief for an independent Claude concept
  page-content-en-us.md      approved implementation copy and FAQ
  design-system.md           tokens, components, responsive/accessibility rules
  asset-map.md               source/approval/usage ledger (asset lane)
  shopify-handoff.md         Shopify template and DOM/data integration contract
  analytics-seo.md           events, Amazon Attribution, SEO and privacy
  qa-checklist.md            concentrated acceptance and release gates
tests/                       static contract and Playwright end-to-end checks
scripts/                     screenshot and review-recording utilities
review/                      generated review evidence
```

## Testing

Install pinned development dependencies:

```bash
npm install
npx playwright install chromium
```

Static tests verify the config/app contract and prohibited-token guardrails.
Playwright tests serve `prototype/` on port 4173 and cover:

- 320/390/768/1024/1440 overflow;
- default selection and `#d215` state;
- radio, live-region, fixed/dynamic CTA mapping, and missing-link safety;
- FAQ without JavaScript;
- video no-autoplay/no-initial-media behavior;
- prohibited copy/UI tokens;
- serious/critical axe violations;
- desktop/mobile/interaction full-page capture readiness.

Run the full suite from a clean checkout before handing off:

```bash
npm test
```

## Review workflow

1. Run `npm test`, `npm run capture`, and `npm run record`.
2. Review desktop, mobile, D215-selected/FAQ/sticky evidence as one package.
3. Record blockers and unresolved external values in
   `review/review-notes.md`.
4. Apply one consolidated correction round and rerun the full checks.
5. Create the private repository/tag only after the user gives a consolidated
   visual `GO` and every handoff gate passes.

The implementation does not deploy, modify Shopify, create a GitHub repository,
or publish a URL by itself.

## Key documents

- Send `docs/CLAUDE_DESIGN_BRIEF.md` directly to Claude for the independent
  comparison concept.
- Use `docs/page-content-en-us.md` as the English copy source of truth.
- Use `docs/shopify-handoff.md` for the eventual Liquid/JSON template migration.
- Use `docs/qa-checklist.md` for final GO/NO-GO evidence.
