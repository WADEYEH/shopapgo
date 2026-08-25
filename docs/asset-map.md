# APGO US landing asset map

Last verified: 2026-08-25 (Asia/Taipei)

This manifest is the source of truth for the prototype's visual assets. `Approved source` means the pixels come from an APGO-controlled source and may be used as product identity in the local prototype. It does **not** approve performance claims embedded in source packaging or establish US-market legal clearance.

## Delivered brand and product assets

| Output | Source | Status | Mechanical transform | Intended usage |
|---|---|---|---|---|
| `prototype/assets/brand/apgo-logo.png` | `Amazon上架/雨傘_新品待建檔/品牌素材/第01批/APGO-logo.png` | Approved source / ready for prototype | Trim transparent bounds; proportional Lanczos resize to 1400 px width; retain original orange pixels and alpha | Header, footer, brand section |
| `prototype/assets/products/d204-packshot.webp` | `_imglib/APGO產品圖庫/D204 APGO原子琉璃釉/琉璃釉.png` + `_imglib/APGO產品圖庫/D204 APGO原子琉璃釉/2025原子琉璃釉300ml(噴頭).png` | Approved source / ready for prototype | Trim existing alpha only; proportional resize; place official box behind official 300 mL bottle on a 1400 x 1400 transparent canvas; add neutral alpha-derived drop shadow; WebP quality 94 | D204 Hero, selector, comparison and product spotlight |
| `prototype/assets/products/d215-packshot.webp` | `_imglib/APGO產品圖庫/D215 APGO原子釉鍍膜/原子釉.png` + `_imglib/APGO產品圖庫/D215 APGO原子釉鍍膜/2025原子釉鍍膜200ml(噴頭).png` | Approved source / ready for prototype | Trim existing alpha only; proportional resize; place official box behind official 200 mL bottle on a 1400 x 1400 transparent canvas; add neutral alpha-derived drop shadow; WebP quality 94 | D215 selector, comparison and product spotlight |

No label, bottle, box, capacity, logo or package copy was redrawn. The output canvases remain transparent; dark backgrounds shown by some image viewers are not baked into the files.

## AI context backgrounds

The root integration lane may add the following files without waiting for this asset lane:

| Output | Source | Status | Permitted usage | Prohibited usage |
|---|---|---|---|---|
| `prototype/assets/generated/hero-studio-bg.webp` | Newly generated, claim-free contextual art | Approved for contextual use | Hero studio lighting, neutral automotive surface and APGO brand atmosphere behind the official transparent packshot | Product truth, package or label replacement, performance proof, application proof |
| `prototype/assets/generated/d204-context-bg.webp` | Newly generated, claim-free contextual art | Approved for contextual use | D204 spotlight atmosphere or vehicle-body background behind the official D204 packshot | D204 product pixels, before/after, water behavior, durability or test evidence |
| `prototype/assets/generated/d215-context-bg.webp` | Newly generated, claim-free contextual art | Approved for contextual use | D215 spotlight atmosphere or vehicle-body background behind the official D215 packshot | D215 product pixels, wet-application instructions, water behavior, durability or test evidence |

Generated backgrounds must remain separate from official product truth. The page may mechanically layer the official transparent packshot over them, but AI must not redraw, relabel, reshape or alter the APGO logo, bottle, box, capacity or package copy. Generated people, hands, factories, laboratories, application steps, before/after results and performance visuals remain prohibited.

## Application and video assets

| Output | Source | Status | Mechanical transform / restriction | Intended usage |
|---|---|---|---|---|
| `prototype/assets/application/d204-step-1.webp` | `/Users/wadeyeh/Desktop/Coloured Glaze.mp4`, 00:05.0 | Approved real source / ready for prototype | Exact real spray frame; center 4:3 crop; 1200 x 900 WebP | D204 `Spray` step |
| `prototype/assets/application/d204-step-2.webp` | Same video, 00:06.5 | Approved real source / ready for prototype | Exact real coating-cloth frame; center 4:3 crop; 1200 x 900 WebP | D204 `Spread` step |
| `prototype/assets/application/d204-step-3.webp` | Same video, 00:09.5 | Approved real source / ready for prototype | Exact real towel frame; center 4:3 crop; 1200 x 900 WebP | D204 `Buff` step |
| `prototype/assets/video/d204-poster.webp` | Same video, 00:05.0 | Approved real source / ready for prototype | Real vertical frame centered over a mechanically blurred/darkened duplicate; 1600 x 900 WebP; no generated content | D204 video poster |
| `prototype/assets/video/d204-application.mp4` | Same video | Approved real source / ready for prototype; publication rights confirmation remains required | Trim to 22.2 seconds before unsupported final title card; 720 x 1280 H.264/AAC; 30 fps; fast-start; metadata removed | Click-to-load D204 video |
| `prototype/assets/video/d204-captions-en.vtt` | D204 video audio | Ready for prototype | Music cue only; no instructional narration transcribed | Caption track |
| `prototype/assets/application/d215-step-1.webp` | APGO Malaysia Shopify CDN video, 00:00.5 | Approved real source / ready for prototype | Exact real rinse frame; center 4:3 crop; 1200 x 900 WebP | D215 `Wash` step |
| `prototype/assets/application/d215-step-2.webp` | Same video, 00:06.0 | Approved real source / ready for prototype | Exact real wet-surface frame; center 4:3 crop; 1200 x 900 WebP | D215 `Keep paint wet` step |
| `prototype/assets/application/d215-step-3.webp` | Same video, 00:10.0 | Approved real source / ready for prototype | Exact real spray frame; center 4:3 crop; 1200 x 900 WebP | D215 `Spray and spread` step |
| `prototype/assets/application/d215-step-4.webp` | Same video, 00:13.0 | Approved real source / ready for prototype | Exact real final-towel frame; center 4:3 crop; 1200 x 900 WebP | D215 `Dry` step |
| `prototype/assets/video/d215-poster.webp` | Same video, 00:10.0 | Approved real source / ready for prototype | Real vertical frame centered over a mechanically blurred/darkened duplicate; 1600 x 900 WebP; no generated content | D215 video poster |
| `prototype/assets/video/d215-application.mp4` | APGO Malaysia Shopify CDN: `https://apgo.my/cdn/shop/videos/c/vp/380dc7b0cfdd4b4ea8c7b8e8bedd9815/380dc7b0cfdd4b4ea8c7b8e8bedd9815.HD-1080p-7.2Mbps-81867711.mp4?v=0` | Approved APGO-hosted source / ready for prototype; US reuse approval must be confirmed before publication | Trim to 22.2 seconds before unsupported final title card; 606 x 1080 H.264/AAC; 30 fps; fast-start; metadata removed | Click-to-load D215 video |
| `prototype/assets/video/d215-captions-en.vtt` | D215 video audio | Ready for prototype | Music cue only; no instructional narration transcribed | Caption track |

If an application frame cannot clearly represent the stated step, the page must use the HTML numbered-step fallback. It must not generate a replacement image.

## Explicitly excluded

- Every file or folder marked `生成候選`, `AI_candidate_NOT_USED`, or `USER CONFIRMATION PENDING`.
- D204/D215 marketplace graphics containing durability days, wash counts, contact angles, percentage comparisons, chemistry, UV, scratch, corrosion, all-material, bestseller, review, rating or warranty claims.
- AI water beads, AI before/after paint, AI hands, AI people, AI factories and AI laboratories.
- The final title cards in the located D204/D215 videos where they state unsupported gloss, durability or protection claims.
- Any product image where the label, package, bottle shape, capacity or logo has been regenerated or altered.

## Missing or publication-blocking inputs

- Confirm APGO's right to republish the Malaysia-store D215 video and its audio on the US-market page.
- Confirm the D204 local video's ownership and audio usage rights for US publication.
- Confirm whether the US retail boxes and labels are pixel-identical to the Taiwan/Malaysia sources used here.
- Final ASINs, Amazon Attribution URLs, neutral-domain ownership and US support email are intentionally outside this asset lane.

## Source integrity hashes

SHA-256 values record the exact sources used for product identity:

```text
APGO-logo.png                                      8bb98e9afc3843cc41932868d009509216dd85ce5faf2b770ee10efe49d2bd9e
D204 box (琉璃釉.png)                              45ccd9eba48cc9c584fc40e46da9969deae991cb2f74e99633b948cb1bdf8550
D204 300 mL bottle with nozzle                    91724dee75251ee772b6c7b6ab82a95d9dd943c2a889004214646bfde5df60c8
D215 box (原子釉.png)                              7f491d4efaf383a5ebcb232a97495631a0de570277a6754af489d496e405d0f6
D215 200 mL bottle with nozzle                    7c28a675df5df6dbf9668c2ddb19b849e0523d0e61a2255576f9cb09cf4babe5
Coloured Glaze.mp4                                5f08af5247231f3cc33a1387c01a66a2adbbf5ad3a9f51c65c17be64d91e224a
D215 APGO Shopify CDN video                      4fdc407bc002109f0d15f22ca4df260de026cdebed628884f3101884f48e7b0e
```
