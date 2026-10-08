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
runtime (`support.js`, `<x-dc>`, `sc-if`, `{{ }}`, Babel); a static test guards that. The pages were first
rebuilt as plain HTML; since D41 they are Next.js pages of the site (`app/(us)/(shop)/products`,
`components/shop`), in the site's own header and footer, with the store styles scoped under `.shop`
(`app/(us)/(shop)/shop.css`). How they work: [commerce.md](commerce.md), "Product pages and the overview".

## Section order (as designed)

Hero (sticky gallery, buy box with DRY/WET switch, pair upsell, price, quantity, Add to cart, trust strip)
→ benefit strip → before/after → how to apply → fit quiz → Dry vs Wet table → reviews (hidden below 3
verified) → 30-day guarantee → FAQ → Keep reading, plus a sticky add-to-cart bar.

Copy is the design's (FTC-reviewed) text, unchanged.

## Where this build differs from the design

* **Prices:** the design shows placeholder prices ($29.90 / $24.90 / pair $49.90). The page reads prices
  from `/api/store/config`; the pair total is the sum of the two. The design's pair discount is not shown
  (no confirmed discount price); the "add the other routine" checkbox stays, without any offer wording.
* **Trust strip, guarantee and FAQ shipping/returns lines** are placeholders in the design. Since the store
  went live (PRICING_APPROVED) they are not shown: the "Free US shipping" / "30-day returns" trust items and
  the "30 days to change your mind" guarantee section are removed, and the FAQ answer only says shipping
  options and cost are shown at checkout and links the Returns & Refunds page. No `[TO CONFIRM]` marker is
  shown to shoppers on the product pages; restore these only with brand-confirmed wording.
* **Rating slot / review slots:** the design draws dashed placeholder boxes. They are not shown to
  shoppers: the rating line and reviews appear only with 3+ verified reviews. The before/after section is
  hidden entirely until a real photo pair exists in product-reviews.js (no placeholder slots, in any mode).
* **Price note:** no "placeholder price" note; the note only appears when the price could not be loaded.
* **DRY / WET switch:** the design swaps the product in place. Each routine has its own page (D39), so the
  switch, the quiz result and the compare table link to the other product page.
* **Quiz** uses native radio groups (keyboard and screen-reader friendly); upcoming questions are dimmed by
  colour, not opacity, to keep contrast.
* **Keep reading:** the design links two guide articles that do not exist in this repo, so the section
  links to the other product page and to "How APGO works" on the home page instead.
* **"Read the full how-to guide" button** is omitted (no guide page yet).
* **Compare table** is a real table that fits 390 px without horizontal scrolling.
* **Application video** is the existing click-to-load MP4 with captions already used on the v3 page
  (publication rights are still on the asset-map to-do list).
