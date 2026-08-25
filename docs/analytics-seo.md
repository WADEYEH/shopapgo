# Analytics, Amazon referral, and SEO specification

## Measurement model

The site measures on-page intent and outbound referral clicks. Amazon
Attribution is the source of truth for Amazon detail-page, add-to-cart, and
purchase outcomes. GA4 must not present an outbound click as a purchase.

## Event transport

`prototype/js/app.js` emits each event in two forms:

```js
window.dataLayer.push({ event: "event_name", ...parameters });
window.dispatchEvent(new CustomEvent("apgo:analytics", {
  detail: { event: "event_name", ...parameters }
}));
```

Use the dataLayer path for GTM/GA4. The CustomEvent exists for local verification
and future adapters. Bind only one production transport to avoid duplicate
events.

## Event dictionary

| Event | Trigger | Parameters |
| --- | --- | --- |
| `us_referral_landing_view` | One time after page initialization | `selected_sku`, `preview` |
| `fit_selector_answer` | Visitor changes D204/D215 selection | `selected_sku`, `application_mode` (`dry`/`wet`) |
| `amazon_referral_click` | Enabled Amazon CTA click | `sku`, `placement` |
| `video_start` | First actual play per video element | `sku` |
| `faq_expand` | FAQ item changes from closed to open | `question_id` |
| `scroll_depth` | First crossing of each threshold | `percent` (25/50/75/90) |

Valid `placement` values:

- `hero`
- `header`
- `selector`
- `product`
- `sticky`
- `final`

No event fires for a disabled/missing Amazon link. Programmatic initialization
does not fire `fit_selector_answer`; only a visitor choice does.

## GA4/GTM setup

1. Create one GA4 Event tag per dataLayer custom event or one lookup-based event
   tag.
2. Register `selected_sku`, `application_mode`, `sku`, `placement`, and
   `question_id` as event-scoped custom dimensions when reporting needs them.
3. Mark no event as a conversion until the owner chooses the KPI definition.
4. If using a GA4 referral-click key event, name/report it as a referral, not a
   sale.
5. Exclude internal/local preview traffic with a hostname/environment rule.
6. Verify exactly one event in GTM Preview and GA4 DebugView for each action.

Primary KPI:

> enabled Amazon CTA clicks / qualified landing sessions

Supporting views:

- referral click-through rate after selector use;
- D204/D215 click share;
- placement contribution;
- mobile/desktop difference;
- Amazon Attribution detail-page, add-to-cart, and purchase outcomes.

## Amazon URL governance

- Store URLs only in `prototype/js/config.js` for the prototype and one
  centralized Shopify setting for production.
- Each product and placement receives its own Amazon Attribution URL.
- D204 links never use D215 Attribution tags and vice versa.
- Accept only HTTPS `amazon.com` or its subdomains.
- Open in a new tab with `rel="noopener noreferrer sponsored"`.
- Preserve all Attribution query parameters; test the final redirected URL.
- Never use an Amazon homepage or storefront as a placeholder for a missing
  product detail page.
- Never expose price, inventory, Prime, stars, ratings, or reviews on this page.

Suggested tracking matrix:

| Product code | Hero | Header | Selector | Product | Sticky | Final |
| --- | --- | --- | --- | --- | --- | --- |
| D204 | yes | dynamic | yes | yes | dynamic | yes |
| D215 | no | dynamic | yes | yes | dynamic | yes |

## Consent and privacy

- Do not load GA4/GTM until the production privacy/consent configuration permits
  it for the visitor.
- Local prototype analytics remain in-memory dataLayer events only.
- Do not collect email, identity, vehicle, or order data on this page.
- Privacy and Terms links must point to approved US-facing policies before
  launch.

## SEO fields

```html
<html lang="en-US">
<title>APGO Car Paint Care | D204 Dry & D215 Wet Application</title>
<meta
  name="description"
  content="Compare APGO D204 for clean, dry paint with D215 for wet-surface application, then shop each product on Amazon.com."
>
```

Preview requirement:

```html
<meta name="robots" content="noindex,nofollow">
```

The runtime permits `index,follow` only when `preview:false` and both verified
Amazon URLs are marked ready. That is a technical safeguard, not the entire
release approval: domain, email, packaging, policy, content, tracking, and
market-isolation gates must also pass.

## Canonical and internationalization

- One canonical URL on a verified neutral brand domain.
- Do not index an equivalent `.my` copy.
- Use `en-US` language metadata.
- Configure hreflang only when each alternate has a real localized URL and
  owner-approved content.
- Do not redirect US visitors to `.my` based only on browser language.

## Structured data

Allowed after validation:

- `WebPage`
- `Organization` with verified legal/name/logo/contact properties

Excluded:

- `Product`
- `Offer`
- `AggregateRating`
- price, availability, shipping, or internal checkout actions

FAQ copy may remain semantic HTML. Add `FAQPage` only after confirming current
search-engine policy and ensuring the structured content exactly matches visible
copy; it is not required for version one.

## Social preview

- 1200 × 630 px.
- Official unchanged D204 and D215 packshots.
- APGO mark and claim-free title only.
- No performance numbers, stars, awards, price, water behavior, or AI result
  imagery.
- Provide explicit width/height and meaningful image alt/description where the
  platform supports it.

## Verification

- Validate title, description, one canonical, `en-US`, and robots state in the
  rendered DOM.
- Confirm preview/local host is never indexable.
- Inspect network requests before consent and before video click.
- Click every CTA placement and compare the D204/D215 product code plus
  Attribution parameters.
- Confirm no click event for unavailable links.
- Confirm one page-view event and one event per action.
- Search rendered source for MYR, TWD, Malaysian shipping, cart, price, rating,
  inventory, and prohibited claims.
