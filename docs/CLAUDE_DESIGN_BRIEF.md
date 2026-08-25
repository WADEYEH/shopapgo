# APGO US Amazon Referral Landing Page

## Standalone design and implementation brief for Claude

This document is intentionally self-contained. Use it to create an independent
design concept for APGO. Do not assume access to another design, conversation,
repository document, or implementation.

## 1. Assignment

Design and build a polished, responsive, one-page US landing experience for
APGO, a Taiwan-based car-care brand. The page introduces two products and sends
qualified visitors to the corresponding product detail page on Amazon.com.

This is **not** a direct-to-consumer store. Do not add prices, inventory,
ratings, reviews, a cart, checkout, account, search, newsletter, currency
selector, shipping promotion, or marketplace-like UI.

Deliver one complete concept in a single pass:

- a clear visual idea and rationale;
- framework-free HTML, CSS, and JavaScript;
- a 1440 px desktop full-page capture;
- a 390 px mobile full-page capture;
- an interaction-state capture showing D215 selected, one FAQ open, and the
  mobile sticky CTA;
- a concise list of real assets still required.

Place your independent implementation in `concept-claude/`. Do not overwrite
the Codex prototype or its assets.

## 2. Commercial goal and audience

The primary audience is a US DIY car owner who wants a clear finishing routine
without first learning specialist coating terminology.

The page has three jobs:

1. establish that APGO is a credible Taiwan-based car-care brand;
2. explain the factual application difference between D204 and D215;
3. help the visitor choose a routine and continue to the correct Amazon.com
   listing.

The primary success event is a qualified Amazon referral click. The experience
must never imply that an order can be placed on this page.

## 3. Product truth

Use only the following product facts unless APGO provides a separately approved
source.

### D204

- Display name: `APGO Atomic Colored Glaze`
- Model: `D204`
- Net contents: `300 mL / 10.1 fl oz`
- Starting surface: clean and fully dry automotive paint
- Routine: `Spray / Spread / Buff`
- Position in the wash routine: after the vehicle has been washed and fully
  dried
- Product accent: muted rose/pink

### D215

- Display name: `APGO Atomic Glaze Coating`
- Model: `D215`
- Net contents: `200 mL / 6.8 fl oz`
- Starting surface: clean automotive paint that is still wet after washing
- Routine: `Wash / Spray and Spread / Dry`
- Position in the wash routine: before the final drying step
- Product accent: green

D204 is the hero product, but the final choice must give D204 and D215 equal
visual weight. Do not describe either one as stronger, faster, easier, better,
flagship, professional-grade, more durable, or more protective.

## 4. Required message hierarchy

Primary message:

> PROFESSIONAL FINISH CARE. MADE SIMPLE.

Hero explanation:

> Choose D204 for use on clean, dry automotive paint. Choose D215 while the
> paint is still wet after washing.

The visitor should be able to understand the choice in under ten seconds:

- prefer a separate finishing step after drying → D204;
- prefer to apply before the final drying step → D215.

Use plain US English. Always spell `Colored`, never `Coloured`.

## 5. Required page modules

Design the following ten modules as one coherent page. You may interpret the
composition, art direction, typography, and rhythm independently, but may not
remove or reorder the commercial logic.

### 1. Header

- APGO logo.
- Anchor navigation: `Compare`, `How to Apply`, `Videos`, `FAQ`.
- A selected-product Amazon CTA on desktop.
- On mobile, use a menu button and the separate sticky CTA.
- No shopping utilities or promotional bar.

### 2. D204 hero

- Eyebrow: `APGO AUTO CARE · MADE IN TAIWAN` only if the final US package
  confirms the origin statement; otherwise use `APGO AUTO CARE`.
- H1: `PROFESSIONAL FINISH CARE. MADE SIMPLE.`
- Hero explanation from section 4.
- D204 official product packshot.
- Primary CTA: `Buy D204 on Amazon`.
- Secondary anchor: `Compare D204 & D215`.
- Supporting facts: `D204`, `Dry Application`, `300 mL / 10.1 fl oz`.

### 3. Routine selector

Question: `HOW DO YOU PREFER TO APPLY?`

Radio options:

- `After washing and fully drying` → D204
- `While paint is still wet after washing` → D215

Both product cards remain visible. Selection updates the header and mobile
sticky CTA, gives a visible selected state, and announces the choice to
assistive technology. It must not claim that the selected product is objectively
recommended.

### 4. Direct comparison

Compare only:

- product name;
- model;
- starting surface;
- routine;
- place in wash routine;
- net contents.

Do not use checkmarks, winners, rankings, performance metrics, or claims of
relative ease.

### 5. D204 spotlight

- Heading: `A DEDICATED FINISHING STEP AFTER DRYING.`
- Explain the separate wash, fully dry, spray, spread, and buff sequence.
- Show real/official product imagery and, when available, real application
  imagery.
- CTA: `Buy D204 on Amazon`.

### 6. D215 spotlight

- Heading: `APPLY BEFORE THE FINAL DRYING STEP.`
- Explain application while clean paint is still wet, followed by final drying.
- Show real/official product imagery and, when available, real application
  imagery.
- CTA: `Buy D215 on Amazon`.

### 7. How to apply

D204:

1. Wash the vehicle.
2. Fully dry the paint.
3. Work on cool paint in the shade.
4. Spray and spread one small section at a time.
5. Buff with a separate clean microfiber towel.

D215:

1. Wash the vehicle.
2. Keep the paint wet for application.
3. Spray and spread with a clean wet cloth.
4. Complete the final drying step with a clean towel.

Required safety line:

> Use only as directed. Read and follow the current product label before use.

Use numbered HTML steps when approved real application images are unavailable.
Never generate hands, application results, water behavior, or evidence.

### 8. Real application videos

- One 16:9 card for D204 and one for D215.
- Real footage only.
- Poster image first; load the video only after a deliberate click.
- Never autoplay.
- Pause one video when the other begins.
- Include English captions and a transcript.
- If a real, approved video is unavailable, show a clear non-clickable media
  placeholder without inventing footage.

### 9. Why APGO and FAQ

Brand message:

> APGO is a Taiwan-based car-care brand offering distinct dry- and
> wet-application products for different wash routines.

Do not add brand-age, unit-sales, factory, laboratory, award, leadership, or
international-superiority claims without approved evidence.

FAQ topics:

- factual D204/D215 difference;
- whether they share the same application method;
- how to choose by routine;
- material and surface caution;
- Amazon pricing, fulfillment, and returns;
- APGO product-use support.

### 10. Final Amazon choice and footer

Heading: `CHOOSE THE PRODUCT THAT FITS YOUR ROUTINE.`

Support line:

> Current pricing, availability, shipping, and order returns are shown and
> handled on Amazon.com.

Give both products equal CTA weight:

- `Buy D204 on Amazon`
- `Buy D215 on Amazon`

Footer: APGO logo, Privacy, Terms, Contact, verified support email, and legal
entity information. Do not insert a placeholder address or email on a public
page.

## 6. Art direction

Use the APGO master palette and product accents:

- APGO orange: `#F08417`
- near black: `#080A0C`
- carbon: `#111419`
- warm white: `#FBF8F4`
- D204 rose: `#E99495`
- D215 green: `#6EAC30`

Desired character: precise, modern automotive, calm confidence, and clear
product handling. Avoid generic marketplace cards, gaming aesthetics, neon
cyberpunk, excessive carbon-fiber texture, or luxury clichés.

Design principles:

- dark/light section alternation for rhythm;
- strong editorial scale and generous negative space;
- monospace or technical display type paired with a highly readable body face;
- orange for brand and primary actions;
- rose/green only as SKU identity, never the sole indicator of selection;
- restrained motion: small reveals, selected-state transitions, and arrow
  feedback only;
- no parallax, marquee, floating bottles, autoplay, or carousel.

You are expected to present your own considered composition, typographic system,
section rhythm, and image treatment rather than copying a Shopify template.

## 7. Responsive and accessibility requirements

Design targets:

- desktop: 1440 px viewport, content width near 1248 px;
- tablet: 768 and 1024 px;
- mobile: 390 px;
- minimum supported width: 320 px.

Requirements:

- no horizontal scrolling at any target width;
- meaningful source order with D204 before D215;
- comparison becomes vertical pairs on mobile, not a horizontally scrolling
  table;
- minimum 44 × 44 px touch targets;
- body text contrast of at least 4.5:1;
- keyboard-operable radios, links, menu, videos, and FAQ;
- visible focus styles;
- selection is communicated with border/icon/text in addition to color;
- `prefers-reduced-motion` support;
- semantic headings, landmarks, labels, and alt text;
- native `<details>/<summary>` is preferred for FAQ;
- pinch zoom must remain enabled.

Mobile sticky CTA rules:

- hidden while the hero is visible;
- shown after the visitor passes the hero;
- follows the selected product;
- hidden when the final Amazon-choice section enters the viewport;
- accounts for safe-area insets and never obscures page content.

## 8. Amazon and interaction rules

- D204 and D215 must link only to their own verified Amazon.com URLs.
- Open Amazon in a new tab and state `Opens Amazon.com`.
- Never create a placeholder Amazon URL.
- When a URL is unavailable, render a disabled/non-clickable state.
- Hero CTA is always D204.
- Product and final CTAs remain fixed to their product.
- Desktop header and mobile sticky CTAs follow the routine selection.
- Default selection is D204; `#d215` must load D215 selected.
- Selection updates the URL hash without navigating away.
- Do not display Amazon price, Prime, stars, inventory, ratings, or review count.

Required analytics events:

- `us_referral_landing_view`
- `fit_selector_answer`
- `amazon_referral_click`
- `video_start`
- `faq_expand`
- `scroll_depth` at 25/50/75/90 percent

## 9. Asset truth and prohibitions

Product bottles, boxes, labels, capacities, and the APGO logo must come from
official source files and must not be redrawn. AI/compositing may create only
claim-free automotive backgrounds and lighting around an unchanged official
packshot.

When a contextual image is missing, AI may generate only a studio, vehicle,
context, or brand-atmosphere **background**. Composite the official bottle,
box, label, and logo into that background mechanically, without repainting,
restyling, relabeling, or asking the image model to reproduce the product.

The Codex version may provide these generated-background references for
comparison:

- `prototype/assets/generated/hero-studio-bg.webp`
- `prototype/assets/generated/d204-context-bg.webp`
- `prototype/assets/generated/d215-context-bg.webp`

Generated backgrounds must contain no product packaging, readable or decorative
text, performance number, badge, before/after comparison, water-beading/result
evidence, or implied test result. They are atmosphere only and are never product
or performance evidence.

Application, water behavior, people, factories, laboratories, durability, test
evidence, and before/after results require real approved source material.

Never use files marked:

- `生成候選`
- `AI_candidate_NOT_USED`
- `USER CONFIRMATION PENDING`

Do not publish any of the following without SKU-specific approved evidence:

- angle, duration, wash-count, hardness, temperature, or percentage metrics;
- nano, ceramic, SiO2, graphene, 9H/10H, or molecular-barrier chemistry;
- UV, scratch, chemical, corrosion, all-surface, or durability claims;
- price, warranty, shipping speed, inventory, ratings, reviews, or sales volume;
- `extreme`, `maximum`, `best`, `flagship`, or comparative performance claims.

`Results may vary`, `designed to`, and similar qualifiers do not replace
evidence.

## 10. Technical constraints

- Framework-free HTML, CSS, and JavaScript.
- No React, Next.js, Astro, Shopify API, analytics SDK, or component dependency.
- Must run from a static server.
- Preview must include `noindex,nofollow`.
- Preserve these integration hooks:

```html
data-amazon-cta
data-selected-amazon-cta
data-sku="d204|d215"
data-placement="hero|header|selector|product|sticky|final"
data-product-card="d204|d215"
data-video-card="d204|d215"
```

Use this configuration shape; do not hardcode URLs in page markup:

```js
window.APGO_CONFIG = {
  preview: true,
  supportEmail: "",
  products: {
    d204: { amazonUrl: "", linkReady: false, videoReady: false },
    d215: { amazonUrl: "", linkReady: false, videoReady: false }
  }
};
```

## 11. Definition of done

Your concept is complete only when:

- all ten modules form one coherent page;
- desktop and mobile captures are supplied;
- selection, fixed/dynamic CTAs, hash, FAQ, videos, and sticky CTA work;
- every missing URL or asset fails safely;
- the page contains no prohibited marketplace/local-market UI or claims;
- 320, 390, 768, 1024, and 1440 px widths have no horizontal overflow;
- all visible product imagery is official/approved;
- your asset-needs list distinguishes required real assets from optional art
  direction.

Do not pause for section-by-section approval. Produce the complete alternative
concept for side-by-side review.
