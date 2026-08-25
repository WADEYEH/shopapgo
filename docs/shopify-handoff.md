# Shopify engineering handoff

## Objective

Move the approved static prototype into one US-facing Shopify page without
turning it into a Shopify checkout surface. The page is a brand/selection layer
whose product CTAs leave the site for verified Amazon.com listings.

Do not begin migration until the static prototype, official asset map, and
desktop/mobile captures have been approved together.

## Recommended architecture

Create a dedicated JSON page template named `page.us-amazon-referral` with one
purpose-built section for each major module. Do not base the page on a Shopify
product template and do not load product-form/cart code.

Suggested section order:

1. `us-referral-header`
2. `us-referral-hero`
3. `us-referral-selector`
4. `us-referral-comparison`
5. `us-referral-product-spotlight` configured for D204
6. `us-referral-product-spotlight` configured for D215
7. `us-referral-application`
8. `us-referral-videos`
9. `us-referral-brand`
10. `us-referral-faq`
11. `us-referral-final-choice`
12. `us-referral-footer`

Shared assets:

- `us-referral.css`
- `us-referral.js`
- approved files copied from `prototype/assets/`

Generated studio/context backgrounds may be migrated only when the official
product packshot and logo remain separate, unchanged layers. Do not flatten or
reuse a generated image that contains AI-rendered packaging, labels, text,
before/after results, water/effect evidence, or performance numbers.

The final filenames may follow the destination theme convention. Preserve the
behavior and DOM hooks rather than prototype class names.

## Public DOM contract

The interaction script relies on:

```html
<body data-selected-sku="d204">

<a data-amazon-cta data-sku="d204" data-placement="hero">…</a>
<a data-selected-amazon-cta data-placement="header">…</a>

<input
  type="radio"
  name="application-routine"
  value="d204"
  data-routine-option
>
<article data-product-card="d204">…</article>

<article
  data-video-card="d204"
  data-video-src="/cdn/shop/videos/d204-application.mp4"
>
  <button data-video-trigger>…</button>
  <div data-video-mount></div>
</article>
```

Required hooks:

- `[data-amazon-cta][data-sku="d204|d215"]` — fixed product CTA.
- `[data-selected-amazon-cta]` — follows selected routine.
- `[data-placement="hero|header|selector|product|sticky|final"]` — analytics.
- `[data-product-card="d204|d215"]` — selection state.
- `[data-video-card="d204|d215"]` — video state.
- `[data-mobile-purchase]`, `#top`, `#shop` — current prototype sticky/hero/final
  hooks. The JS also accepts `[data-mobile-sticky]`, `[data-hero]`, and
  `[data-final-cta]` aliases.
- `[data-support-email]` — verified email insertion; missing values are hidden.
- `[data-support-answer]` — complete verified-email FAQ answer.
- `[data-selection-live]` — optional live region; JS creates one if omitted.
- `.faq-list details` — current FAQ analytics hook; optional
  `data-question-id` supplies a stable reporting ID.

Recommended nested hooks:

- `[data-selected-cta-label]` — current dynamic CTA label; JS also accepts
  `[data-cta-label]`.
- `[data-cta-status]` — `Opens Amazon.com` / pending status.
- `[data-selected-indicator]` — visual selected badge.
- `[data-video-trigger]`, `[data-video-mount]` — lazy video hydration.
- `[data-nav-toggle]`, `[data-site-nav]` — current mobile navigation hooks; JS
  toggles `.is-open` and `data-open` without hiding the desktop navigation.

## Theme editor data model

Keep unverified runtime values centralized. Do not repeat Amazon URLs or support
email across sections.

Global/page-level settings:

- `preview_mode` (checkbox, defaults true)
- `support_email` (text; blank until verified)
- `d204_amazon_url` (URL)
- `d204_link_ready` (checkbox, defaults false)
- `d215_amazon_url` (URL)
- `d215_link_ready` (checkbox, defaults false)
- `d204_video` (Shopify-hosted video)
- `d204_video_ready` (checkbox, defaults false)
- `d215_video` (Shopify-hosted video)
- `d215_video_ready` (checkbox, defaults false)

Render one config block before `us-referral.js`:

```liquid
<script>
  window.APGO_CONFIG = {
    preview: {{ section.settings.preview_mode | json }},
    supportEmail: {{ section.settings.support_email | strip | json }},
    products: {
      d204: {
        amazonUrl: {{ section.settings.d204_amazon_url | json }},
        linkReady: {{ section.settings.d204_link_ready | json }},
        videoReady: {{ section.settings.d204_video_ready | json }}
      },
      d215: {
        amazonUrl: {{ section.settings.d215_amazon_url | json }},
        linkReady: {{ section.settings.d215_link_ready | json }},
        videoReady: {{ section.settings.d215_video_ready | json }}
      }
    }
  };
</script>
```

For security, Liquid still renders CTA `href` values only after confirming the
ready checkbox; JavaScript performs an additional Amazon.com URL check. The
theme editor must not make claim-sensitive product facts freely editable.

## Content fields

Editable presentation fields may include:

- section eyebrow, heading, and approved body copy;
- official image picker and approved alt text;
- approved real video/poster/caption/transcript;
- Privacy, Terms, and Contact page references.

Lock or validate these content-truth fields:

- product display names and SKU mapping;
- 300 mL / 10.1 fl oz for D204;
- 200 mL / 6.8 fl oz for D215;
- dry/wet starting surface and sequence;
- all prohibited-claim exclusions.

## Market isolation

The US referral page must not inherit:

- MYR/TWD selectors or prices;
- Malaysian/Taiwan shipping or promotion bars;
- Shopify product recommendations;
- product forms, cart drawer, cart icon, account, or search;
- local WhatsApp, address, return, or guarantee claims;
- newsletter popups or local gift apps.

Use a neutral, verified brand domain and `lang="en-US"`. Do not allow the same
page to be indexed under both `.my` and the neutral domain. Configure one
canonical URL and Shopify Markets hreflang only after the domain/market setup is
confirmed.

If the destination theme cannot isolate the referral template from Malaysian
commerce/UI behavior, implement this approved prototype as a small static page
on the neutral domain instead. Do not invent US shipping rates to force-enable
a Market.

## SEO

- Title: `APGO Car Paint Care | D204 Dry & D215 Wet Application`
- Meta description: `Compare APGO D204 for clean, dry paint with D215 for
  wet-surface application, then shop each product on Amazon.com.`
- Preview: always `noindex,nofollow`.
- Public index state requires both verified product links and all release gates.
- Schema: `WebPage` and verified `Organization` only.
- Do not output `Product`, `Offer`, `AggregateRating`, price, inventory, or
  internal checkout schema.

## Analytics

The JS pushes events to `window.dataLayer` and dispatches an
`apgo:analytics` CustomEvent. Map the dataLayer to GA4 in GTM; do not add another
click listener that causes duplicates.

Each CTA needs a placement-specific Amazon Attribution URL. Preserve URL query
parameters through any Shopify redirect or market routing.

## Performance

- Hero image: responsive Shopify image URL, explicit dimensions, eager/high
  priority.
- Below-fold images: explicit dimensions and lazy loading.
- Video: real poster only; no media request before deliberate click.
- Preserve the English VTT caption track. D215 may play in the local prototype,
  but do not publish it in the US template until reuse rights are documented.
- Load one minified CSS and one deferred JS file for this page.
- Avoid theme app blocks on the referral template.
- Mobile targets: LCP <2.5 s, CLS <0.10, INP <200 ms under representative US
  mobile conditions.

## Migration verification

1. Compare Shopify captures with approved 1440 and 390 prototype captures.
2. Run the same 320/390/768/1024/1440 overflow checks.
3. Verify D204 and D215 URLs independently and confirm Attribution query values.
4. Exercise D204/D215 radio, hash, dynamic/fixed CTA, sticky CTA, videos, FAQ,
   keyboard, and reduced motion.
5. Inspect rendered DOM and schema for commerce/local-market leakage.
6. Test from a signed-out US-facing browser session.
7. Keep `noindex,nofollow` until the complete release checklist is signed off.
