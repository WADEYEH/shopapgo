# APGO US Amazon landing — concentrated review notes

Review package generated: 2026-08-25 (Asia/Taipei)

Status: **local design review ready**. This prototype has not been deployed, connected to a Shopify store, pushed to GitHub, or made indexable.

## What to review once

- `desktop-1440-full.png`: full page at a 1440 x 900 viewport.
- `mobile-390-full.png`: full page at a 390 x 844 viewport; the fixed CTA is hidden only for the stitched long-page capture so it does not repeat as a screenshot artifact.
- `interaction-states.png`: D215 selected, D215 mobile sticky CTA visible, and the first FAQ opened.
- `interaction-walkthrough.webm`: 29.96-second mobile walkthrough at 390 x 844.

The prototype is available locally while the static server is running:

```bash
python3 -m http.server 4173 -d prototype
```

Then open `http://127.0.0.1:4173/`.

## Verification evidence

`npm test` passed on the integrated commit:

- 3/3 static contract tests.
- 18/18 browser tests.
- No horizontal overflow at 320, 390, 768, 1024, or 1440 px.
- D204 default and `#d215` deep-link state verified.
- Keyboard/radio selector, fixed CTA mapping, selected CTA mapping, mobile menu, sticky CTA, support email population, native FAQ, click-to-load videos, English caption tracks, and analytics events verified.
- Missing or invalid Amazon URLs never become clickable links.
- Videos do not autoplay or request media before a user click.
- Preview remains `noindex,nofollow`.
- No serious or critical axe accessibility findings.
- Rendered copy excludes local-market UI, currencies, cart/checkout, and the prohibited unverified claims in the QA contract.

## Visual source decisions

- APGO logo, D204 packshot, and D215 packshot come from official APGO-controlled source files. Product labels and packaging were not regenerated.
- D204 application steps and video use real APGO footage.
- D215 application steps, poster, and local video use real APGO-hosted footage. The local edit contains only hood/body-paint footage; the side-glass segment and unsupported final claim card were removed. The paint-focused D215 edit is silent.
- Three AI-generated images are used only as non-evidentiary studio/car-context backgrounds. The product bottle, box, label, capacity, and logo remain separate official pixels. Exact prompts and prohibited uses are recorded in `docs/ai-image-prompts.md`.

## Intentionally incomplete in preview

- Amazon CTAs retain their final labels but are deliberately non-clickable because no verified Amazon Attribution URLs are configured.
- The US support email is hidden because no final address is configured.
- Preview is deliberately non-indexable.
- Amazon price, availability, Prime, ratings, reviews, stock, delivery promises, and return details are intentionally not mirrored on the page.

## Publication blockers — one consolidated input list

1. Final D204 Amazon.com ASIN and Amazon Attribution URL.
2. Final D215 Amazon.com ASIN and Amazon Attribution URL.
3. Confirmation that both products are simultaneously purchasable before the page becomes indexable.
4. Neutral US-facing domain and canonical URL.
5. US product-support email address.
6. Confirmation of the right to republish the local D204 footage for the US page.
7. Confirmation of the right to republish the APGO Malaysia-hosted D215 visual footage for the US page. The prototype edit contains no audio.
8. Confirmation that US retail boxes and labels are pixel-identical to the source packshots, or replacement US packshots.
9. Final review response: `GO` or one consolidated visual/content correction list.

After `GO`, the planned handoff step is to create the private repository `WADEYEH/apgo-us-amazon-landing`, push `main`, and create tag `v1.0.0-design-handoff`. Until then, the complete commit history remains local.
