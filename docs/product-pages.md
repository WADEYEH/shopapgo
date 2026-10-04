# Product pages: design source and decisions

## Source

Claude Design export of **2026-10-05**, unpacked (read-only, not committed) at
`design-import/claude-design-2026-10-05/` in the main working tree. Files used:

| Used for | File in the export |
|---|---|
| Page structure and section order | `APGO Design System/ui_kits/product-v2/ProductScreenV2.jsx`, `README.md` (preferred over the simpler `ui_kits/product/`) |
| Naming rule "Routine first" (DRY/WET first, product name second, SKU a small tag) | `CLAUDE.md`, `APGO Design System/readme.md` |
| Tokens, type (Barlow / Barlow Condensed), colours | `APGO Design System/tokens/*.css`, mirrored 1:1 in `prototype/css/commerce.css` |
| Component behaviour (FAQ, step figures, video card, sticky bar, quantity stepper, breadcrumb) | `APGO Design System/components/**` |
| Images | `APGO Design System/assets/{products,application,video}` are byte-identical to files already in `prototype/assets/`, so nothing was copied |

The `.dc.html` files and React/JSX are design references only. Nothing from the export is loaded at
runtime (`support.js`, `<x-dc>`, `sc-if`, `{{ }}`, React, Babel); a static test guards that. The page is
rebuilt as plain HTML, CSS and ES modules, reusing the store's `commerce.css`, `shared.js` cart and header/footer.

## Section order (as designed)

Hero (sticky gallery, buy box with DRY/WET switch, pair upsell, price, quantity, Add to cart, trust strip)
→ benefit strip → before/after → how to apply → fit quiz → Dry vs Wet table → reviews (hidden below 3
verified) → 30-day guarantee → FAQ → Keep reading, plus a sticky add-to-cart bar.

Copy is the design's (FTC-reviewed) text, unchanged.

## Where this build differs from the design

* **Prices:** the design shows placeholder prices ($29.90 / $24.90 / pair $49.90). The page reads prices
  from `/api/store/config`; the pair price is the sum of the two, with the pair discount marked `[TO CONFIRM]`.
* **Trust strip, guarantee and FAQ shipping/returns lines** are placeholders in the design; they carry a
  `[TO CONFIRM]` mark here (the returns policy page still has open items).
* **Rating slot / review slots:** the design draws dashed placeholder boxes. They are not shown to
  shoppers: the rating line and reviews appear only with 3+ verified reviews. Before/after slots show
  (labelled `[TO CONFIRM: real photo pending]`) only while the store is in estimate mode.
* **Quiz** uses native radio groups (keyboard and screen-reader friendly); upcoming questions are dimmed by
  colour, not opacity, to keep contrast.
* **Keep reading:** the design links two guide articles that do not exist in this repo, so the section
  links to the other product page and back to the store instead.
* **"Read the full how-to guide" button** is omitted (no guide page yet).
* **Compare table** is a real table that fits 390 px without horizontal scrolling.
* **Application video** is the existing click-to-load MP4 with captions already used on the v3 page
  (publication rights are still on the asset-map to-do list).
