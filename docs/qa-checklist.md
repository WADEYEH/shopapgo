# APGO US landing QA and release checklist

Use one concentrated review after integration. Record evidence in
`review/review-notes.md`; do not approve from a build pass or a single desktop
screenshot alone.

## 1. Content truth

- [ ] D204 is `APGO Atomic Colored Glaze`, 300 mL / 10.1 fl oz.
- [ ] D204 starts on clean, fully dry automotive paint.
- [ ] D204 sequence is Spray / Spread / Buff.
- [ ] D215 is `APGO Atomic Glaze Coating`, 200 mL / 6.8 fl oz.
- [ ] D215 starts on clean automotive paint still wet after washing.
- [ ] D215 sequence is Wash / Spray and Spread / Dry.
- [ ] `Colored` uses US spelling everywhere.
- [ ] Website, final US package, and Amazon listing agree.
- [ ] Made-in-Taiwan wording matches the actual US package before display.
- [ ] No capacity, label, bottle, box, or logo has been redrawn.

## 2. Claim and marketplace exclusions

- [ ] No angle, duration, wash-count, hardness, temperature, or percentage
      metric appears without approved SKU-specific evidence.
- [ ] No nano, ceramic, SiO2, graphene, 9H/10H, molecular-barrier, UV, scratch,
      chemical, corrosion, all-surface, or durability claim is present.
- [ ] Neither product is called stronger, faster, easier, better, flagship, or
      more durable.
- [ ] No price, Prime, rating, review count, inventory, shipping promise,
      warranty, sales volume, or unapproved award appears.
- [ ] No MYR, TWD, Malaysia shipping, local WhatsApp, cart, checkout, account,
      search, newsletter, gift app, or local promotion appears.
- [ ] Real application/result imagery is real and approved; generated candidate
      files are excluded.
- [ ] Any AI-generated studio/car/context/brand-atmosphere layer contains no
      packaging, logo, text, performance number, before/after state, water, or
      effect evidence.
- [ ] Official bottle, box, label, and logo are unchanged mechanical overlays on
      generated backgrounds, not AI reproductions or repaints.

## 3. Visual review

- [ ] Full-page desktop capture at 1440 × 900 reviewed.
- [ ] Full-page mobile capture at 390 × 844 reviewed.
- [ ] Interaction capture shows D215 selected, an open FAQ, and sticky CTA.
- [ ] 320, 390, 768, 1024, and 1440 px have no horizontal overflow.
- [ ] D204 appears before D215 in mobile source/visual order.
- [ ] Mobile comparison is vertical and does not scroll horizontally.
- [ ] Official product images retain label legibility, ratio, and full bottle/box.
- [ ] Rose/green is not the only selected-state signal.
- [ ] Sticky CTA does not cover FAQ, final choice, cookie UI, or footer.
- [ ] Layout remains readable at browser 200% zoom.
- [ ] Reduced-motion mode removes nonessential movement.

## 4. Interaction

- [ ] Initial state is D204.
- [ ] Loading `#d215` selects D215.
- [ ] Native radio controls work with pointer, keyboard, and touch.
- [ ] Selection updates `body[data-selected-sku]`, card state, live region,
      header CTA, and mobile sticky CTA.
- [ ] Hero CTA remains D204 after selecting D215.
- [ ] Product/selector/final CTAs remain mapped to their own SKU.
- [ ] Mobile sticky is hidden in hero, visible after hero, and hidden over the
      final choice.
- [ ] FAQ works with JavaScript disabled.
- [ ] Mobile menu closes on link selection and Escape.
- [ ] No missing URL creates a clickable placeholder.

## 5. Amazon links

- [ ] D204 and D215 Amazon detail pages are publicly buyable in a signed-out US
      session.
- [ ] Every URL is HTTPS on amazon.com or its subdomain.
- [ ] Every placement uses the correct SKU-specific Attribution URL.
- [ ] Query parameters survive the final redirect.
- [ ] Links open in a new tab and display `Opens Amazon.com`.
- [ ] Disabled state has no `href`, is not keyboard-focusable, and is announced
      as unavailable.

## 6. Video

- [ ] Each poster is a frame from approved real footage.
- [ ] No video media request occurs before deliberate activation.
- [ ] Video has no autoplay attribute and begins only after a user action.
- [ ] Starting one video pauses the other.
- [ ] English captions and transcript are available.
- [ ] Missing/unapproved video remains a non-clickable pending state.
- [ ] Video captions do not infer performance metrics from footage.

## 7. Accessibility

- [ ] Exactly one H1 and logical heading order.
- [ ] Header, main, sections, and footer use semantic landmarks.
- [ ] Skip link works.
- [ ] All informative images have accurate alt text; decorative images have
      empty alt.
- [ ] Every control has an accessible name and visible focus.
- [ ] Touch targets are at least 44 × 44 px.
- [ ] Body text contrast is at least 4.5:1.
- [ ] Routine selection is announced through a polite live region.
- [ ] Page supports keyboard-only use without traps.
- [ ] Pinch zoom is not disabled.
- [ ] Automated axe scan reports no serious or critical violations.

## 8. Performance

- [ ] Hero image has explicit dimensions and eager/high-priority loading.
- [ ] Below-fold images have explicit dimensions and lazy loading.
- [ ] Video initially loads poster only.
- [ ] Fonts do not block first rendering; fallbacks minimize layout shift.
- [ ] Representative mobile results: LCP <2.5 s, CLS <0.10, INP <200 ms.
- [ ] No unexpected third-party/app scripts load on the referral page.

## 9. Analytics and SEO

- [ ] One `us_referral_landing_view` fires per load.
- [ ] User selection fires `fit_selector_answer`; initial state does not.
- [ ] Enabled CTA fires one `amazon_referral_click` with correct SKU/placement.
- [ ] Disabled CTA fires no referral event.
- [ ] Video first play and FAQ open fire one correctly parameterized event.
- [ ] Scroll thresholds fire once at 25/50/75/90.
- [ ] Preview/local page is `noindex,nofollow`.
- [ ] Public title, description, canonical, and `en-US` are correct.
- [ ] No Product/Offer/AggregateRating schema is emitted.
- [ ] Consent rules prevent unauthorized analytics loading.

## 10. Release gates

Do not switch `preview` to false until every item is confirmed:

- [ ] Both ASIN pages are live and buyable.
- [ ] Both Amazon Attribution URL sets are verified.
- [ ] Neutral US-facing brand domain ownership and DNS are verified.
- [ ] Verified support email can receive and answer a test message.
- [ ] Final US packaging, included items, origin, and safety copy are confirmed.
- [ ] Every visible asset is official or explicitly approved.
- [ ] Privacy, Terms, Contact, legal entity, and order-support language are
      approved.
- [ ] Signed-out US QA shows no Malaysian/Taiwan commerce leakage.
- [ ] GA4/GTM and Amazon Attribution verification passed.
- [ ] Owner supplied a final consolidated `GO` after reviewing the complete
      desktop/mobile package.

## Release evidence

Record:

- review date and owner;
- tested commit SHA/tag;
- tested URLs and viewport matrix;
- final D204/D215 destination URL identifiers without credentials;
- screenshot paths;
- automated test output;
- known non-blocking limitations.
