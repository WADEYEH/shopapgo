# V2 claim ledger

Audit date: **2026-09-01**

Scope: APGO US finish-care landing page only

This ledger distinguishes evidence from publication approval. A statement on a
current APGO or Amazon page is evidence that the statement has been published;
it is not automatically evidence that the underlying performance claim is true.

Per the owner’s content direction, this is an internal traceability/risk file,
not the creative brief. It must not render on the page or force shopper copy into
generic language. The conversion-first copy in `page-copy-en-us.md` deliberately
uses APGO’s current product features and performance claims; this file preserves
where each statement came from for later consistency, marketplace, or legal
review.

## Status definitions

| Status | Meaning |
| --- | --- |
| `READY FOR DRAFT` | Supported enough for this review draft; owner still approves final copy. |
| `CONDITIONAL` | May publish only after the stated missing condition is satisfied. |
| `MISMATCH` | Sources conflict; resolve before the product can receive an outbound CTA. |
| `BLOCKED` | Do not publish without new product-specific substantiation. |

## Evidence register

| Code | Source | What it can establish | What it cannot establish |
| --- | --- | --- | --- |
| `SDS-204` | `../../../output/pdf/FBA_20260824/SDS_D204_原子琉璃釉_2025-06-11.pdf` | product identity, stated purpose, composition, manufacturer | measured durability, contact angle, consumer-safety superlatives |
| `SDS-215` | `../../../output/pdf/FBA_20260824/SDS_D215_原子釉鍍膜_2024-03-02_最新版.pdf` | product identity, stated purpose, composition, pH, manufacturer | measured durability, material compatibility, non-toxic claim |
| `ORIGIN` | `../../../output/pdf/FBA_20260824/3_輸美國貨品原產地聲明書_台灣製造_已勾選及用印.pdf` | origin statement for the audited export shipment | automatic identity match to every future US retail unit |
| `CI-PL` | `../../../outputs/fba_20260824/CI_PL_filled_corrected.xlsx` | D204/D215 line identity, capacity, stated use, Taiwan origin for that shipment | Amazon availability, final retail pack contents, performance |
| `PKG-204` | `../../../_imglib/APGO產品圖庫/D204 APGO原子琉璃釉/` | official bottle/box appearance, 300 mL, printed wording | independent performance proof |
| `PKG-215` | `../../../_imglib/APGO產品圖庫/D215 APGO原子釉鍍膜/` | official bottle/box appearance, 200 mL, printed wording | independent performance proof |
| `VID-204` | `/Users/wadeyeh/Desktop/Coloured Glaze.mp4` and the approved prototype derivative | visible hand-application sequence | contact angle, durability, comparative efficacy |
| `VID-215` | `../../prototype/assets/video/d215-application.mp4` | visible wet-paint application sequence | durability, gloss units, water repellency, US reuse rights |
| `TW-204` | <https://apgo.tw/products/apgo-atomic-colored-glaze> | current Taiwan-market instructions and brand wording | US-market package/offer identity or independent substantiation |
| `TW-215` | <https://apgo.tw/products/glaze_coating> | current Taiwan-market instructions and brand wording | US-market package/offer identity or independent substantiation |
| `AMZ-204` | <https://www.amazon.com/dp/B0HFWM2W54> | current ASIN copy and availability state | independent proof of its own marketing claims |
| `AMZ-215` | <https://www.amazon.com/dp/B0HFW9CQ1R> | intended clean destination only | current public identity or availability; audit could not resolve it |
| `A+-204` | `../../../Amazon上架/D204_原子琉璃釉/08_CREATIVE/D204_Aplus_模組1-4_生圖提示詞_v001.md` | internal creative intent and its own claim restrictions | approval; file says `USER CONFIRMATION PENDING` |

Files under `生成候選` or named `AI_candidate_NOT_USED` are excluded as product
truth. They may not promote a claim to a higher status.

## Brand and shared claims

| ID | Proposed statement | Status | Evidence | Publication rule |
| --- | --- | --- | --- | --- |
| `BR-01` | APGO is a Taiwan-based automotive-care brand. | `READY FOR DRAFT` | official APGO Taiwan terms/company identity, the manufacturer address in `SDS-204` and `SDS-215`, and APGO first-party history | Do not expand this into a product-development, own-factory, or own-laboratory claim. |
| `BR-02` | Development began in 2014; APGO launched in 2017. | `CONDITIONAL` | APGO Taiwan and Malaysia first-party timelines | Publish only after brand-owner confirmation; omit from V2 default copy. |
| `BR-03` | 17-year brand history. | `BLOCKED` | current site wording conflicts with the same site’s 2014/2017 timeline | Define the starting event and correct the arithmetic before reconsidering. |
| `BR-04` | Own factory, own laboratory, ISO 9001, 50,000 sets sold, Southeast Asia validation. | `BLOCKED` | first-party marketing statements only | Require factory ownership, certificate scope, sales source, and market evidence. |
| `COM-01` | Both products are intended to help protect/care for automotive paint and provide/enhance gloss. | `READY FOR DRAFT` | `SDS-204`, `SDS-215` purpose lines | Use “designed to help”; do not imply quantified or permanent protection. |
| `COM-02` | Landing-page recommendation is limited to automotive paint. | `READY FOR DRAFT` | both SDS purpose lines | This is a content boundary, not a claim that other surfaces are unsafe. |
| `COM-03` | Real product-specific application footage. | `CONDITIONAL` | `VID-204`, `VID-215`, `docs/asset-map.md` | Publish only after US web reuse rights, final edit, captions, and product match are approved. |
| `COM-04` | Label safety/directions language. | `CONDITIONAL` | SDS precautions and current local labels | Replace draft wording with the final US label verbatim where required. Do not claim non-toxic/safe/eco-friendly. |
| `COM-05` | D204 and D215 can be layered or used together. | `BLOCKED` | no combined-use protocol found | FAQ must say a combined routine has not been established. |
| `COM-06` | Sprayer/towels are included. | `CONDITIONAL` | Taiwan offers show accessories; US BOM absent | Tell shoppers to check the exact Amazon offer until US package contents are verified. |
| `COM-07` | The page uses official product photography. | `READY FOR DRAFT` | source/hash records in `docs/asset-map.md`; unchanged packshots in `prototype/assets/products/` | Continue to prohibit redrawn labels, altered capacities, or generated product substitutes. |

## D204 claims

| ID | Proposed statement | Status | Evidence | Publication rule |
| --- | --- | --- | --- | --- |
| `D204-01` | Product name: APGO Atomic Colored Glaze. | `MISMATCH` | `PKG-204`, `SDS-204`, and `VID-204` agree; `AMZ-204` title says “Crystal Glaze” | Align Amazon title, US label, landing copy, and Attribution destination before enabling CTA. |
| `D204-02` | 300 mL. | `READY FOR DRAFT` | `PKG-204`, `SDS-204`, `CI-PL` | Confirm final US dual-unit net-contents presentation before rendering fl oz. |
| `D204-03` | Apply to clean, fully dry automotive paint. | `MISMATCH` | `TW-204`, `VID-204`, and the implementation contract say dry; `AMZ-204` bullet says dry or wet | V2 uses dry only; correct/approve the Amazon route before referral. |
| `D204-04` | Wash and fully dry; use on a cool surface out of direct sun; spray/spread one section; buff with a clean dry microfiber. | `READY FOR DRAFT` | `TW-204`, `VID-204`, implementation contract | Keep directions concise and align the final endpoint wording to the US label. |
| `D204-05` | Made in Taiwan. | `CONDITIONAL` | official packaging, `ORIGIN`, `CI-PL` | Confirm the sellable US unit and landing packshot match the audited shipment. |
| `D204-06` | Water beading, without a number. | `CONDITIONAL` | real footage and `TW-204` | May show approved real footage with results-vary context; no angle/durability inference. |
| `D204-07` | 110° contact angle; 180 days/6 months; 30 washes. | `BLOCKED` | current Amazon/creative claims, but no underlying report found; `A+-204` explicitly gates them | Require a product-specific controlled test report, method, samples, dates, and approval. |
| `D204-08` | Covers 6–8 vehicles; 10-minute application; superiority over wax. | `BLOCKED` | Amazon/creative copy only | Require usage and comparative test records. |
| `D204-09` | Safe on paint, wrap, glass, wheels, trim, matte, and every exterior surface. | `BLOCKED` | Taiwan/Amazon marketing lists; SDS scope is car paint | Require final label plus material-compatibility evidence for every named surface. |
| `D204-10` | Nano, ceramic, SiO₂, graphene, 9H, UV, scratch, or corrosion performance. | `BLOCKED` | no matching product-level substantiation found | Do not use a category buzzword as a chemistry or performance fact. |

## D215 claims

| ID | Proposed statement | Status | Evidence | Publication rule |
| --- | --- | --- | --- | --- |
| `D215-01` | Product name: APGO Atomic Glaze Coating. | `READY FOR DRAFT` | `PKG-215`, `SDS-215`, `CI-PL` | Reconfirm against final US label and Amazon detail page. |
| `D215-02` | 200 mL. | `READY FOR DRAFT` | `PKG-215`, `SDS-215`, `CI-PL` | Confirm final US dual-unit net-contents presentation before rendering fl oz. |
| `D215-03` | Apply while clean automotive paint is still wet after washing, before final drying. | `CONDITIONAL` | `TW-215`, `VID-215`, implementation contract | Obtain final US label/instructions and approve video reuse. |
| `D215-04` | Wash; keep wet; spray and spread; towel-dry. | `CONDITIONAL` | `TW-215`, `VID-215`, implementation contract | Do not invent dwell time, cure time, dosage, or speed. |
| `D215-05` | Made in Taiwan. | `CONDITIONAL` | official packaging, `ORIGIN`, `CI-PL` | Confirm final sellable US unit and packshot match the audited shipment. |
| `D215-06` | Water-based formula. | `READY FOR DRAFT` | `SDS-215` lists water at 88–90% | Does not imply non-toxic, skin-safe, or environmentally friendly. |
| `D215-07` | pH-neutral formula. | `CONDITIONAL` | `SDS-215` says neutral | Confirm the 2024 SDS matches the current US batch/formula. |
| `D215-08` | 120 days/4 months; 20 washes; 80% repellency; 80 gloss units. | `BLOCKED` | Taiwan marketing or generated candidates; no raw reports found | Require method, samples, baseline, full raw results, dates, and approval. |
| `D215-09` | Prevents corrosion; works on all exterior materials. | `BLOCKED` | printed/marketing statements without matching technical evidence | Require corrosion/material compatibility reports and final label. |
| `D215-10` | 6–8 vehicles; one-third normal usage; 30 minutes versus 4 hours. | `BLOCKED` | marketing images only | Require coverage and fair comparative time-study records. |

## Amazon and operational claims

| ID | Proposed statement | Status | Evidence | Publication rule |
| --- | --- | --- | --- | --- |
| `AMZ-01` | Amazon displays current price, availability, shipping, offer contents, and returns. | `READY FOR DRAFT` | destination-platform behavior | Do not mirror changing values on the landing page. |
| `AMZ-02` | D204 can be bought now. | `BLOCKED` | `AMZ-204` currently says unavailable | Do not enable any D204 Amazon CTA until inventory and detail-page alignment pass signed-out US verification. |
| `AMZ-03` | D215 exact Amazon destination is ready. | `BLOCKED` | direct public check did not resolve `B0HFW9CQ1R`; no final listing evidence in project | Verify exact ASIN, product identity, availability, and Attribution redirects. |
| `AMZ-04` | An outbound click equals a sale. | `BLOCKED` | analytics model | GA4 records referral intent only; Amazon Attribution reports downstream Amazon outcomes. |

## Required evidence to change a blocked status

The owner or reviewer must attach the exact source, product/batch match, date,
test method, sample count, complete result, and authorized final wording. A
screenshot of a claim already published, an AI-generated image, a marketplace
bullet, or an isolated demonstration frame is not sufficient.
