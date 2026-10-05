# MCF shipping review — October 4, 2026

Read-only research for the APGO website launch. Owner decisions are recorded in [launch-decisions-2026-10-04.md](launch-decisions-2026-10-04.md). These are observations and proposals, not approved customer shipping terms or production configuration.

## Method and limits

- Inspected the authenticated Master APGO / United States Seller Central inventory and MCF quote form.
- Used the synthetic recipient `APGO Quote Preview` and public landmark addresses only. No customer contact details, phone, email or order ID were entered.
- Read the automatic previews. Did **not** click Create order or Create hold order; neither shipping nor inventory reservation was requested.
- Checked official Amazon pricing, the October 2026 peak rate card, FAQ and Seller Central help.
- These previews demonstrate quoted availability for the sampled items/addresses at the observation time. They do not establish universal eligibility, reserve inventory, lock final charges or prove completed fulfillment. The owner's refusal of a real shipment test remains in force.

## Products

| Product | Amazon seller SKU | ASIN | Observed Amazon price | Available inventory | Quoted single-unit shipping weight |
| --- | --- | --- | ---: | ---: | ---: |
| Colored Glaze, 300 mL | D204 | B0HFWM2W54 | USD 59.99 | 75 | 0.80 lb |
| Glaze Coating, 200 mL | D215 | B0HFW9CQ1R | USD 29.99 | 69 | 0.60 lb |

D204 also showed 21 reserved units; D215 showed 200 inbound units. Inbound stock is not currently available stock. The catalog decision covers single-bottle products, not a restriction to one bottle per cart. Cloth kits and virtual bundles are outside the initial catalog.

## Account-specific preview results

All amounts are **Amazon's estimated fulfillment charge to APGO**, in USD, for the entire sample order. They are not customer shipping charges, product prices, Amazon listing FBA fees, storage charges or return fees.

| Address | Cart | Standard | Expedited | Standard estimated arrival | Expedited estimated arrival |
| --- | --- | ---: | ---: | --- | --- |
| 400 Broad St, Seattle, WA 98109 | D204 × 1 | 9.24 | 13.58 | Oct 7 | Oct 5 |
| 400 Broad St, Seattle, WA 98109 | D215 × 1 | 8.91 | 12.22 | Oct 7 | Oct 5 |
| 350 Fifth Avenue, New York, NY 10118 | D204 × 1 | 9.24 | 13.58 | Oct 7 | Oct 5 |
| 350 Fifth Avenue, New York, NY 10118 | D215 × 1 | 8.91 | 12.22 | Oct 7 | Oct 5 |
| 350 Fifth Avenue, New York, NY 10118 | D215 × 2 | 12.42 | 14.30 | Oct 7 | Oct 6 |
| 350 Fifth Avenue, New York, NY 10118 | D204 × 1 + D215 × 1 | 12.69 | 14.91 | Oct 7 | Oct 5 |

Dates refer to 2026 and are time-specific previews, not standing delivery promises. Single-unit prices matched between these two samples; this does not prove every US ZIP has identical pricing. Multi-unit pricing is not the single-unit price multiplied by quantity.

Saved screenshots:

- [D204, Seattle](../review/mcf-d204-seattle-oct4.png)
- [D215, Seattle](../review/mcf-d215-seattle-oct4.png)
- [D204, New York](../review/mcf-d204-new-york-oct4.png)
- [D215, New York](../review/mcf-d215-new-york-oct4.png)
- [Mixed two-bottle order, New York](../review/mcf-mixed-two-new-york-oct4.png)
- [Official peak Standard rate table](../review/mcf-peak-standard-oct4.png)

The D215 × 2 result was visibly verified in the accessibility state; no separate screenshot file was saved for that cart.

The quote form displayed plain packaging without Amazon branding enabled (disabled control), Amazon Logistics blocking off, and packing-slip/overbox options off. These form defaults are not proof that the integration's eventual shipment will use identical options.

## Region, delivery and seasonal costs

Official references:

- [Amazon MCF pricing](https://supplychain.amazon.com/mcf/pricing)
- [2026 peak rate card](https://supplychain.amazon.com/docs/2026-peak-card)
- [MCF FAQ](https://supplychain.amazon.com/mcf/faqs)
- [Seller Central MCF help](https://sellercentral.amazon.com/help/hub/reference/G200332450)

Pricing depends on size/weight, units and speed. Outside the 48 contiguous states plus DC, listed standard-size surcharges are 100%, and oversized surcharges 200%, including destinations such as Alaska, Hawaii and US territories. The 2026 peak period is October 15, 2026–January 14, 2027; Amazon also lists a 3.5% fuel/logistics surcharge. Do not add that percentage again to a live preview without verifying whether it is already included. Storage, returns and other charges are separate.

Seller Central describes eligible Standard delivery as 3 business days and Expedited as 2, subject to inventory, item and destination conditions. Non-contiguous destinations have longer targets (Standard 5–10 / Expedited 3–6 business days). Preview dates should inform checkout wording; today's one-day estimates must not become a universal next-day promise. PO-box and military-address eligibility for these products was not verified.

Recommendation, pending owner approval: initially serve the 48 contiguous states plus DC with validated street addresses. Exclude Alaska/Hawaii/territories and leave PO/military addresses unavailable until separately verified. No such exclusions were implemented by this research.

## Returns and exceptions

The current Seller Central help documents US return transport/drop-off options, including QR codes where available, evaluation and eligible restocking. Return methods depend on the address; RMA-only requires separately arranged postage. APGO still defines its customer return policy and handles Airwallex refunds. Lost/damaged reimbursement is conditional, and requesting cancellation does not guarantee it succeeds. An accepted MCF order's address/items cannot be edited.

Do not advertise guaranteed free returns or guaranteed compensation from Amazon. Return window, opened-bottle rules, freight payer and the person handling exceptions remain pending. No return or reimbursement request was submitted.

## Recommended customer shipping model — pending approval

**Superseded direction:** After reading the initial review, the owner clarified that customer shipping rules should match the existing Amazon store, including its customer fees. The pass-through proposal below is retained as research history, not selected for implementation. Use the later addendum before planning checkout changes.

Charge the customer the server-side Amazon preview fulfillment amount for their cart, validated address and chosen speed, with no unapproved free-shipping subsidy or markup. Show the amount and estimated delivery window before payment. Explain that Amazon may revise its final charge; APGO absorbs any difference after the customer's confirmed payment rather than silently charging again.

This is a proposed pass-through policy, not an existing feature. It may produce relatively high shipping charges for a USD 29.99 bottle; free/discounted shipping can be considered later when product cost, payment fees and margins are known.

Alternative: owner-approved fixed customer fees, with APGO explicitly absorbing differences. A flat USD 9.99 Standard charge would cover the observed single-unit previews but not the USD 12.42/12.69 two-unit previews. Sample-based fixed fees do not guarantee coverage during peak periods or across all destinations.

## Code implications and next steps

Existing `commerce/worker/amazon-mcf.js` already reads preview fees, fulfillment constraints and arrival windows. `mcf.js` provides a read-only admin connection check for each SKU. The checkout currently uses fixed fees in `pricing.js`; it does not obtain MCF previews before payment. Defaults remain D204 USD 29.90 / D215 USD 24.90, free Standard / USD 9 Express and undecided tax. None were changed here.

If the owner chooses the preview-based policy:

1. Add a server-side checkout shipping quote using the existing read-only preview client. Require a valid USD fee and eligible destination/cart; validate currency and malformed fee responses before exposing amounts.
2. Return Standard/Expedited options and estimated dates, cache briefly, and invalidate/requote when items, quantity, address or speed changes. Do not create or hold MCF orders to obtain a quote.
3. Bind the accepted quote to the checkout/cart and verify freshness server-side before creating the Airwallex session. Store the charged shipping amount and estimate with the order. Missing/unavailable quotes must not fall back to free shipping.
4. Keep the payment amount consistent with the confirmed quote; an amount change requires shopper review. A preview is not an inventory reservation, so fulfillment failure handling remains necessary.
5. Apply the approved geographic policy and Amazon-matching initial product prices in staging, then verify single/multiple bottles, quote failures, expired quotes, address changes and payment retry. Auto-fulfillment stays off during this stage.

This research changes documentation only. No website configuration, production deployment, payment, shipment or reservation was performed.

## Later addendum: existing Amazon customer shipping rules

Owner request: inspect the Amazon store's current rules because website shipping should align with them.

Authenticated Seller Central inventory showed both offers fulfilled by Amazon (FBA):

| SKU | Featured offer product price | Featured offer shipping component |
| --- | ---: | ---: |
| D204 | USD 59.99 | USD 0.00 |
| D215 | USD 29.99 | USD 0.00 |

This is the displayed Featured offer summary, not a checkout quote for every buyer. It does not establish unconditional free delivery regardless of Prime membership, destination, speed or cart value.

[Saved Featured offer screenshot](../review/amazon-fba-featured-offers-oct4.png).

Seller Central Settings → Shipping settings → Shipping Templates showed one default **Migrated Template**:

| Service | Region | Fee | Displayed time |
| --- | --- | --- | --- |
| Standard | 48 contiguous states + DC | USD 0 per order + USD 0/lb | 14–28 days, excluding handling |
| Standard | Hawaii, Alaska, Puerto Rico | USD 4.99 per order + USD 0.99/lb | 14–28 days, excluding handling |
| Expedited | 48 contiguous states + DC | USD 8.99 per order + USD 0.99/lb | 1–2 days, excluding handling |
| Two-Day | 48 contiguous states + DC | USD 10.99 per order + USD 0.99/lb | 2 days, including handling |

The rows include Street and PO Box address types. No template edits, SKU assignments or account settings were changed. [Saved template screenshot](../review/amazon-mfn-shipping-template-oct4.png).

**Applicability:** shipping templates are for seller-fulfilled (FBM/MFN) offers. They are not evidence of the customer shipping policy for these two current FBA offers, nor proof that MCF supports the same PO-box destinations or deadlines. Amazon Seller University's [shipping template explanation](https://www.youtube.com/watch?v=aYAlWhBVyi8) explicitly identifies FBM/MFN usage. Do not copy this default template's 14–28-day transit time or rates into the website as if they were these FBA products' active policy.

Amazon's [current published free-delivery explanation](https://www.aboutamazon.com/news/retail/amazon-free-delivery) describes free delivery on eligible Prime items and, for non-Prime shoppers, eligible Amazon-shipped orders reaching USD 35. That is a platform rule subject to eligibility; it is not an APGO-specific unconditional free-shipping switch. The viewed authenticated product page currently used the owner's Taiwan destination and reported the product unavailable there. No saved delivery location was changed and no US retail checkout was performed. US per-address/customer expedited charges and exact sub-threshold fees therefore remain unverified.

Implementation implication: align website customer terms with the verified Amazon retail experience after defining how to handle Amazon membership-specific benefits. Keep MCF preview fees as APGO's fulfillment cost/eligibility data. Any website free shipping means APGO pays the MCF charge without collecting an equivalent fee from the customer. Amazon Prime benefits do not automatically apply to the current Airwallex + ordinary MCF checkout. Do not presume Buy with Prime or MCF Prime-delivery enrollment, either of which would require a separate implementation/eligibility review.

## Follow-up: live US retail destination checks, October 4

The owner asked to continue checking. This follow-up supersedes the earlier Taiwan-only product-page observation for US retail offers. Only temporary public ZIP-code delivery views were used; no US address was saved, and no payment, order, fulfillment request or stock reservation was submitted. The original Taiwan delivery selection and Traditional Chinese/CNY display were restored after the research.

Both product pages showed Ships from Amazon, Sold by Master APGO, quantity 1 and In Stock at the following sample ZIPs. D204 remained USD 59.99; D215 remained USD 29.99 before any coupon.

| Destination sample | D204 primary delivery message | D215 primary delivery message | Faster option shown |
| --- | --- | --- | --- |
| Seattle, WA 98109 | FREE delivery Oct 9 | FREE delivery Oct 9 on Amazon-shipped orders over USD 35 | Prime free Oct 5 for both; D204 showed a morning window |
| New York, NY 10118 | FREE delivery Oct 9 | FREE delivery Oct 9 on Amazon-shipped orders over USD 35 | Prime free Oct 5 for both |
| Honolulu, HI 96813 | FREE delivery Oct 9 | FREE delivery Oct 9 on Amazon-shipped orders over USD 35 | D204 fastest Oct 8, fee unspecified; no separate faster D215 message observed |
| Anchorage, AK 99501 | FREE delivery Oct 9 | FREE delivery Oct 9 on Amazon-shipped orders over USD 35 | D204 Prime free Oct 5, evening window; D215 Prime free Oct 6 |
| San Juan, PR 00901 | FREE delivery Oct 20 | FREE delivery Oct 10 on Amazon-shipped orders over USD 35 | Fastest Oct 9 for both, fees unspecified |

All dates above are 2026 live estimates, not universal delivery promises. ZIP-only product-page availability does not verify every street address, PO box, military destination, island or remote area. These are retail FBA offers, not MCF quotes or MCF shipping eligibility tests.

D215 displayed an unchecked coupon offering a USD 23.99 coupon price. It was not applied and does not change the owner's previously selected USD 29.99 base price or authorize matching Amazon promotions on the website. How discounts affect the free-delivery threshold was not verified.

### Concrete checkout blocker

A single attempt to add D215 to the cart returned Amazon's notice that the item was removed because the signed-in account is registered as its seller. The resulting cart showed zero items. No purchase was attempted, and no account switch or workaround was used. Consequently the exact non-Prime shipping charge below USD 35 and paid expedited fees remain unverified. Do not substitute the seller-fulfilled template fees or MCF fulfillment charges for these missing retail checkout fees.

### Website policy implications

The observed ordinary free-delivery threshold is USD 35, consistent with Amazon's published eligible-order rule. At current base prices, D204 alone qualifies, D215 alone does not, and two D215 bottles exceed the threshold before discounts. Prime-specific faster/free benefits must not be promised by the current Airwallex + ordinary MCF integration.

If the website adopts the same ordinary threshold, APGO absorbs the applicable MCF fulfillment cost on qualifying orders. The below-threshold customer fee, expedited customer fee, treatment of discounts and supported geography still need a defined implementation rule; they cannot be inferred from these pages. Even when a retail FBA offer shows free shipping to Hawaii/Alaska/Puerto Rico, ordinary MCF may charge APGO substantially more. Retail dates should not be copied into checkout: use eligible MCF arrival estimates for the eventual website service.

No checkout code, website pricing, production settings or deployment was changed by this follow-up.

Evidence screenshots:

- [D204, Seattle retail offer](../review/amazon-d204-seattle-retail-oct4.png)
- [D215, Seattle retail offer](../review/amazon-d215-seattle-retail-oct4.png)
- [D215, New York retail offer](../review/amazon-d215-new-york-retail-oct4.png)
- [D204, Honolulu retail offer](../review/amazon-d204-honolulu-retail-oct4.png)
- [D215, Honolulu retail offer](../review/amazon-d215-honolulu-retail-oct4.png)
- [D215, Anchorage retail offer](../review/amazon-d215-anchorage-retail-oct4.png)
- [D204, San Juan retail offer](../review/amazon-d204-san-juan-retail-oct4.png)
- [D215, San Juan retail offer](../review/amazon-d215-san-juan-retail-oct4.png)
- [Seller own-item cart restriction](../review/amazon-own-item-cart-block-oct4.png)
