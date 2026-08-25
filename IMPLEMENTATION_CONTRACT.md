# APGO US landing implementation contract

This repository contains a framework-free, local-only HTML/CSS/JavaScript prototype for engineering handoff to Shopify.

## Runtime

- Entry point: `prototype/index.html`
- Styles: `prototype/css/app.css`
- External configuration: `prototype/js/config.js`
- Interaction code: `prototype/js/app.js`
- Local server: `python3 -m http.server 4173 -d prototype`
- Preview pages must remain `noindex,nofollow`.

## Fixed DOM hooks

- `[data-amazon-cta][data-sku="d204|d215"]`: fixed product CTA.
- `[data-selected-amazon-cta]`: CTA that follows the routine selector.
- `[data-product-card="d204|d215"]`: selectable product card.
- `[data-video-card="d204|d215"]`: application video card.
- `[data-placement="hero|header|selector|product|sticky|final"]`: analytics placement.
- `body[data-selected-sku="d204|d215"]`: global selected SKU state.

## Content truth

- D204: APGO Atomic Colored Glaze, 300 mL / 10.1 fl oz, clean and fully dry paint, Spray / Spread / Buff.
- D215: APGO Atomic Glaze Coating, 200 mL / 6.8 fl oz, clean paint that is still wet after washing, Wash / Spray and Spread / Dry.
- D204 is the hero product. Neither product may be described as stronger, faster, easier, better, flagship, or more durable.
- Do not publish unverified performance numbers, chemistry claims, prices, ratings, inventory, shipping promises, or review counts.
- Do not include MYR, TWD, Malaysia shipping, Shopify cart, account, search, or newsletter UI.

## Asset policy

- Product bottles, boxes, labels, capacities, and APGO logo must come from official source files and must not be redrawn.
- AI or compositing may only provide claim-free automotive backgrounds and lighting.
- Application, water behavior, people, factories, laboratories, durability, and test evidence must use real source material.
- Files marked `生成候選`, `AI_candidate_NOT_USED`, or `USER CONFIRMATION PENDING` are not approved product truth.

## Parallel file ownership

- Visual lane: `prototype/index.html`, `prototype/css/app.css`.
- Asset lane: `prototype/assets/**`, `docs/asset-map.md`.
- Interaction/docs lane: `prototype/js/**`, all other `docs/**`, `tests/**`, `scripts/**`, `README.md`, `package.json`.
- Only the root integrator edits this contract and performs final integration.

