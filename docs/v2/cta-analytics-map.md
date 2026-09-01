# V2 CTA and analytics map

Status: **proposed replacement contract; not implemented**

## Contract precedence

The existing prototype still implements the V1 contract. Until the owner
approves V2 and implementation begins, `IMPLEMENTATION_CONTRACT.md`,
`docs/analytics-seo.md`, `docs/shopify-handoff.md`, and `docs/qa-checklist.md`
describe the running V1 behavior.

V2 must not be implemented by changing only `config.js` or markup. One coherent
implementation change must replace the conflicting V1 requirements in all four
documents, update runtime code and tests, and mark the superseded V1 copy/DOM
rules as archived. This document defines the intended replacement.

## Principle

The page earns an Amazon click after it helps the visitor choose. It does not
default a new visitor to D204, and a disabled destination never becomes a link
or conversion event.

## Selection state

V2 introduces an explicit three-state model:

| `selectedSku` | Entry | Product cards/process | Mobile sticky | Final handoff |
| --- | --- | --- | --- | --- |
| `none` | normal load or “Change my finish” | both cards visible; no process open | hidden | in-page “Find my finish” only |
| `d204` | `#d204`, D204 card action, or process tab | D204 selected; D204 process | D204 if its sticky link is ready | D204 only |
| `d215` | `#d215`, D215 card action, or process tab | D215 selected; D215 process | D215 if its sticky link is ready | D215 only |

Implementation requirements:

- use `body[data-selected-sku="none|d204|d215"]` and update the fixed-hook
  contract to allow all three values;
- normal load sets `none`, leaves both product-card radios unchecked, keeps both
  cards visible, and opens no process tab;
- `#d204` and `#d215` may initialize a product without recording an explicit
  selector answer;
- choosing a product card’s in-page action or a process tab sets the product
  everywhere;
- “Change my finish” returns to `none`, clears the radio state, hides dynamic
  Amazon CTAs, and scrolls to the product cards;
- selected-product CTA code must do nothing in `none` state.

## Purchase contexts

| Placement | When shown | Ready state | Not-ready state |
| --- | --- | --- | --- |
| `choice` | fixed-SKU shortcut inside each product card | that card’s exact Amazon product | plain status text in preview; hidden in public |
| `sticky` | mobile, after selection, after hero, outside final | exact selected Amazon product | hidden |
| `final` | selected final handoff only | exact selected Amazon product | product-specific plain status text |

Header and hero always use an in-page `Find my finish` action. There are no
Amazon links in the value, process, brand, or “Before you apply” content.

CTA labels come from reviewed markup/data attributes (`Shop D204 on Amazon`,
`Shop D215 on Amazon`); runtime code must not overwrite them with a generic
“Buy” label.

## Runtime configuration migration

Use a state rather than a separate URL/boolean pair so readiness cannot
contradict itself:

```js
window.APGO_CONFIG = {
  preview: true,
  releaseApproved: false,
  support: { href: "", state: "unverified" },
  products: {
    d204: {
      expectedAsin: "",
      amazon: {
        choice: { url: "", state: "unverified" },
        sticky: { url: "", state: "unverified" },
        final: { url: "", state: "unverified" },
      },
      videoReady: false,
    },
    d215: {
      expectedAsin: "",
      amazon: {
        choice: { url: "", state: "unverified" },
        sticky: { url: "", state: "unverified" },
        final: { url: "", state: "unverified" },
      },
      videoReady: false,
    },
  },
};
```

Allowed Amazon link states:

- `unverified` — no public control; preview may show verification status;
- `ready` — runtime validation passed and release evidence is attached;
- `unavailable` — signed-out release check found the verified ASIN not
  purchasable; show status text but no link.

`support.href` accepts only an approved HTTPS support page or `mailto:` address;
`state:"ready"` additionally means the route is monitored and tested. Privacy
and Terms use separate approved Shopify settings, not this support field.

## Runtime link validation

For `state:"ready"`, runtime code must still reject the URL unless all of these
are true:

- HTTPS;
- hostname is exactly `amazon.com` or a subdomain ending in `.amazon.com`;
- path contains `/dp/{ASIN}` or `/gp/product/{ASIN}`;
- extracted ASIN exactly matches the product’s locked `expectedAsin`;
- placement exists in the allowlist `choice|sticky|final`.

Use one placement-aware resolver, for example
`getAmazonLink(sku, placement)`, for rendering and click analytics. Preserve all
Amazon Attribution query parameters.

Client JavaScript cannot reliably determine Amazon inventory, visible product
identity, or final cross-domain redirect state. Those remain signed-out release
checks; runtime URL validation must not claim otherwise.

Only Amazon referral links use
`rel="noopener noreferrer sponsored"`. External Privacy, Terms, or Support links
use the relationship appropriate to those destinations and must not be marked
`sponsored` merely because they leave the site.

## Sticky visibility

The mobile sticky is visible only when every condition is true:

```text
mobile viewport
AND selectedSku is d204 or d215
AND selected product sticky link state is ready and URL passes validation
AND hero is no longer visible
AND final handoff is not visible
```

Recalculate after selection, resize, intersection changes, and every
`apgo:config-updated` event. Tests must cover unselected, selected/not-ready,
selected/ready, and final-overlap states.

## Event dictionary

| Event | Trigger | Parameters |
| --- | --- | --- |
| `us_referral_landing_view` | once after initialization | `selected_sku` (`none`, `d204`, `d215`), `selection_source` (`none`, `hash`), `preview` |
| `routine_start` | header or hero “Find my finish” CTA | `placement` (`header`, `hero`) |
| `fit_selector_answer` | visitor chooses through a product card or process tab | `selected_sku`, `application_mode` (`dry`, `wet`), `selection_source` (`product_card`, `process_tab`) |
| `routine_reset` | “Change my finish” clears a selection | `previous_sku`, `placement` (`final`) |
| `amazon_referral_click` | enabled Amazon CTA click | `sku`, `placement` (`choice`, `sticky`, `final`) |
| `video_start` | first actual play per video | `sku` |
| `scroll_depth` | first crossing | `percent` (25, 50, 75, 90) |

Page-view `selection_source` can only be `none` or `hash`; a later visitor choice
belongs on `fit_selector_answer`. Do not send a JavaScript `null` for
`selected_sku`; use the explicit string `none` so GA4/GTM behavior is stable.

Do not fire `amazon_referral_click` for status text, an invalid URL, a product
choice, or programmatic navigation.

## Measurement interpretation

Primary on-page KPI:

> enabled Amazon referral clicks ÷ qualified landing sessions

For this metric, a qualified landing session is a production
`us_referral_landing_view` after excluding preview, internal/test traffic, and
known bot traffic through the approved analytics configuration.

Useful diagnostics:

- percentage of qualified sessions that choose a product;
- referral click-through rate after a choice;
- D204/D215 choice and click share;
- choice/sticky/final placement contribution;
- video-start rate before referral;
- mobile versus desktop difference.

GA4 measures on-page behavior and outbound referral intent. It must not label an
outbound click as a purchase. Amazon Attribution is the source for Amazon detail
page, add-to-cart, and purchase outcomes.

## Indexing authority

Local and prototype builds always render `noindex,nofollow`.

For production, Shopify/Liquid must render the robots directive in the initial
HTML response. Client JavaScript is never the release authority and must not
turn `noindex` into `index` after load.

Production may be indexable only when `releaseApproved` is true, all six Amazon
placement links are `ready`, both videos/media rights and support/legal routes
are approved, and every release gate is recorded. Keep `data-preview` and
`data-indexable` as separate states; do not derive one by negating the other.

## Automated versus release-time verification

Automated runtime/E2E tests cover:

- normal unselected product cards and valid hash initialization;
- missing URL, invalid scheme/host/path, unknown placement, and ASIN mismatch;
- no `href`, focus, or click event when a link is not ready;
- selection synchronization across product cards, process, sticky, and final;
- sticky visibility conditions;
- exact CTA labels and one analytics event per action;
- prototype `noindex,nofollow`.

Signed-out US release evidence covers:

- current buyability/inventory;
- visible product identity, capacity, directions, packshot, and package contents;
- final redirect and preserved Attribution parameters;
- desktop/mobile destination behavior.

## Launch-specific state on 2026-09-01

- D204: all placements are `unavailable`/not ready; ASIN `B0HFWM2W54` is
  unavailable and its live identity/instructions conflict with audited sources.
- D215: all placements are `unverified`; intended ASIN `B0HFW9CQ1R` has not
  passed a public signed-out check.
- `preview:true`, `releaseApproved:false`, and `noindex,nofollow` remain required.

These are point-in-time checks. Repeat them immediately before launch.
