# V2 owner review and implementation gates

Status: **decision checklist**

## A. Approve the content direction

- [ ] Approve “One wash. Two ways to finish.” as the page’s central story.
- [ ] Approve the neutral first load with no default product.
- [ ] Approve the six-section architecture and removal of V1’s standalone
      comparison/product-spotlight/how-to duplicates.
- [ ] Approve D204 as dry-only and D215 as still-wet-before-final-drying for this
      US page.
- [ ] Approve D204’s 110°, up to 180 days/30+ washes, and 6–8 vehicle feature
      strip.
- [ ] Approve D215’s dry-and-finish positioning, up to 120 days/20-wash
      durability, and water-based pH-neutral feature strip.
- [ ] Approve the 2014 development / 2017 APGO launch brand story.
- [ ] Approve the complete visible copy in `page-copy-en-us.md`.

## B. Align the official US product story

- [ ] Choose and standardize the D204 US consumer name: current packaging says
      “Atomic Colored Glaze”; current Amazon title says “Crystal Glaze.”
- [ ] Make the approved D204 timing and feature set consistent across the
      landing page, Amazon title/bullets/images, and final US package.
- [ ] Supply D215 final US label, directions, package contents, and listing copy.
- [ ] Make the approved D215 timing and feature set consistent across the
      landing page, Amazon listing, and final US package.
- [ ] Confirm D204/D215 final US packshots and sellable units match the audited
      Taiwan-origin shipment.
- [ ] Resolve SDS safety-language and support-email inconsistencies before using
      them for public support and label guidance.

## C. Resolve media and support

- [ ] Record US website reuse rights for the D204 source video.
- [ ] Record US website reuse rights for the APGO Malaysia D215 video.
- [ ] Approve final edits, posters, English captions, transcripts, and reduced-
      motion/non-video fallbacks.
- [ ] Designate one monitored US-facing product-support destination.
- [ ] Approve US-facing Privacy and Terms destinations.
- [ ] Decide which verified legal entity belongs in the footer and Organization
      structured data; do not infer it from conflicting brand/export records.

## D. Make Amazon destinations genuinely ready

- [ ] D204 ASIN is purchasable in a signed-out US session.
- [ ] D204 visible Amazon name, capacity, application timing, imagery, and package
      contents match the approved landing page.
- [ ] D215 exact ASIN is confirmed and purchasable in a signed-out US session.
- [ ] D215 visible Amazon identity and package match the approved landing page.
- [ ] Create unique Amazon Attribution URLs for `choice`, `sticky`, and `final`
      for each product.
- [ ] Verify all six final redirects and query parameters on desktop and mobile.

## E. Local prototype build gate

The owner may authorize a V2 local-preview build after section A is approved.
Sections B–D may remain open during prototype work only if every Amazon link is
disabled, conditional copy is visibly tracked in review documentation, and the
prototype stays `noindex,nofollow`.

- [ ] replace the V1 structure and copy in the prototype;
- [ ] update or supersede the conflicting V1 rules in
      `IMPLEMENTATION_CONTRACT.md`, `docs/analytics-seo.md`,
      `docs/shopify-handoff.md`, `docs/qa-checklist.md`, and `README.md` in the
      same implementation change;
- [ ] migrate configuration to placement-specific Amazon links;
- [ ] implement the explicit `none|d204|d215` state model, with no selected
      product card, process tab, or sticky CTA on normal load;
- [ ] update DOM hooks, automated tests, accessibility labels, analytics tests,
      and review captures together;
- [ ] verify 320/390/768/1024/1440 layouts and keyboard/screen-reader behavior;
- [ ] automate missing URL, invalid host/path, expected-ASIN mismatch, disabled
      focus/click, and sticky-visibility states;
- [ ] keep Amazon inventory, visible identity, and cross-domain redirect checks
      in the signed-out release evidence rather than claiming client detection;
- [ ] verify Shopify/Liquid—not client JavaScript—owns the initial robots state;
- [ ] run the full static/E2E/accessibility suite and inspect generated evidence;
- [ ] obtain a consolidated visual/content GO before Shopify integration.

## F. Production release

- [ ] complete sections B–D with attached evidence and receive a final public-
      release approval;
- [ ] confirm the real Shopify template is rendering, not an orphaned app
      placeholder or blank theme section;
- [ ] confirm `lang="en-US"`, canonical, metadata, consent, and US policies;
- [ ] keep `noindex,nofollow` until all six product-placement routes and every
      non-link release gate pass;
- [ ] verify the signed-out public URL after publishing;
- [ ] verify one analytics event per action and Amazon Attribution reception;
- [ ] record the release evidence, timestamp, commit, theme, and rollback path.

Checking a box records review progress; it is not itself proof. Attach the
corresponding URL, file, screenshot, log, or test result before treating a gate
as complete.
