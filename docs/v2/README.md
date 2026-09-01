# APGO US finish-care V2 review package

Status: **content blueprint for owner review**

Branch: `codex/v2-content-blueprint`

Public page, Shopify theme, and Amazon links: **not changed**

## Decision

Rebuild the page around one shopper question:

> Which finish gives me the result and routine I want?

The current prototype gives selector, comparison, product spotlights, how-to,
video, FAQ, and final cards nearly equal weight. The same dry-versus-wet facts
therefore recur through most of the page. V2 turns that material into a six-part
story with one job per section:

1. Promise a better finish through two APGO routes.
2. Sell the shared benefits: gloss, hydrophobic behavior, and exterior care.
3. Compare D204’s flagship deep-finish route with D215’s dry-and-finish route.
4. Show the selected routine with real application footage.
5. Establish APGO with verifiable, product-centered trust.
6. Confirm only the selected product and hand off to Amazon.

The result is a conversion page, not a long product catalog. It gives both
products distinct reasons to buy, uses one deliberate comparison, and avoids
repeating the same dry/wet explanation through the rest of the page.

## Content mode

The visible copy is conversion-first. It uses the product benefits, performance
figures, application advantages, and brand story already being presented by
APGO and its current marketplace materials. Source/risk notes are kept in a
separate internal file; they do not appear in shopper copy or flatten the
products into generic “paint care.”

## Package contents

- `page-blueprint-en-us.md` — hierarchy, section jobs, layout, responsive flow,
  and what to remove from V1.
- `page-copy-en-us.md` — complete, benefit-led US-English visible copy.
- `claim-ledger.md` — internal source/risk traceability only; not the creative
  brief and not visible on the page.
- `cta-analytics-map.md` — CTA state model, Amazon Attribution structure,
  analytics events, and destination-link gates.
- `review-checklist.md` — separates the owner approval needed for a disabled,
  noindex local V2 build from the evidence required for public release.

## What this draft deliberately does not do

- It does not edit the existing prototype.
- It does not publish to Shopify or change the live domain.
- It does not push a branch or open a pull request.
- It does not enable either Amazon CTA.
- It does not invent new features or numbers that APGO has never claimed.

## Current release blockers

1. D204 ASIN `B0HFWM2W54` is currently unavailable on Amazon.com. Its live title
   and bullets also conflict with current D204 packaging and dry-use guidance.
2. D215 ASIN `B0HFW9CQ1R` could not be independently resolved in a signed-out
   public check. Its final US listing, package contents, and label are missing
   from the project evidence.
3. D204 and D215 final US package/label alignment has not been signed off.
4. D215 video reuse rights for US publication are not recorded.
5. A monitored US-facing support route is not approved.
6. Placement-specific Amazon Attribution URLs do not yet exist in the runtime
   configuration.

Until these gates pass, V2 remains reviewable copy and structure, not launch
content.
