# APGO US landing design system

This specification aligns the prototype and the eventual Shopify page. The
prototype CSS is the visual source of truth when a token here and an implemented
value differ.

## Design intent

- Precise automotive presentation without exaggerated performance theater.
- APGO orange identifies the brand and actions.
- D204 rose and D215 green identify products, not superiority.
- Dark/light sections create editorial pacing and keep an 8,000 px page easy to
  scan.
- Product truth remains in official packshots; backgrounds and lighting remain
  claim-free.

## Generated-background policy

AI may fill a missing studio, vehicle, contextual, or brand-atmosphere
background. It may not generate or redraw a bottle, box, label, logo, product
text, performance number, water/result evidence, or before/after comparison.
Official product and logo files must be mechanically composited over the
generated background without relabeling, reshaping, repainting, or blending away
product details.

Expected generated-background slots:

- `prototype/assets/generated/hero-studio-bg.webp`
- `prototype/assets/generated/d204-context-bg.webp`
- `prototype/assets/generated/d215-context-bg.webp`

Treat these as atmosphere-only layers. They must remain visually plausible but
claim-neutral: no text, badges, gauges, diagrams, tests, water beads, result
panels, or comparison states. Real application and effect media always comes
from approved real source material.

## Grid and spacing

Desktop reference: 1440 × 900 px.

| Property | Desktop | Tablet | Mobile |
| --- | ---: | ---: | ---: |
| Content max width | 1248 px | calc(100% - 64 px) | calc(100% - 32 px) |
| Outer margin | 96 px | 32–48 px | 16–24 px |
| Grid | 12 columns | 8 columns | 1 column |
| Gutter | 24 px | 20 px | 16 px |
| Section block padding | 104 px | 80 px | 56 px |
| Major card radius | 16 px | 16 px | 14 px |
| Major card padding | 32–40 px | 28–32 px | 20 px |
| Primary button height | 56 px | 52 px | 48 px |

Breakpoints:

- `>=1440`: 1248 px content maximum.
- `1024–1439`: 48 px edge margin, 12-column grid.
- `768–1023`: 32 px edge margin, 8-column grid.
- `480–767`: 24 px edge margin, single column.
- `320–479`: 16 px edge margin, single column.

Mobile source order is D204 then D215. Comparison facts stack vertically and
must never create a horizontal-scrolling table.

## Color tokens

```css
:root {
  --apgo-orange-500: #f08417;
  --apgo-orange-100: #fdf0e3;
  --apgo-orange-700: #af6317;

  --d204-pink-500: #e99495;
  --d204-pink-100: #fcf2f2;
  --d204-pink-700: #956263;

  --d215-green-500: #6eac30;
  --d215-green-100: #eef5e6;
  --d215-green-700: #547f28;

  --ink-950: #080a0c;
  --ink-900: #171717;
  --carbon-800: #111419;
  --dark-border: #292e35;

  --surface-white: #ffffff;
  --surface-warm: #fbf8f4;
  --light-border: #e6e0d9;

  --text-on-dark: #f7f4ef;
  --muted-on-dark: #a8afb8;
  --text-on-light: #171717;
  --muted-on-light: #68635e;
}
```

Rules:

- Amazon CTAs use orange with near-black text.
- Rose/green 500 are not used for small text on white; use 700.
- Do not use a rose-to-green gradient.
- Selection also requires border/icon/text, never color alone.
- Decorative dark-grid opacity stays below 4%; light-dot texture below 3%.

## Typography

- Display: system monospace stack (`SFMono-Regular`, `SF Mono`, `Roboto Mono`,
  `ui-monospace`, monospace).
- Body and UI: Inter with system sans-serif fallback.

| Role | Desktop | Mobile | Weight |
| --- | --- | --- | ---: |
| H1 | 64/70 px, -0.04em | 38/42 px | 500 |
| H2 | 44/50 px | 30/36 px | 500 |
| H3 | 28/34 px | 22/28 px | 600 |
| Lead | 20/30 px | 17/26 px | 400 |
| Body | 17/28 px | 16/24 px | 400 |
| Small | 14/22 px | 14/20 px | 400 |
| Eyebrow | 12/18 px, 0.14em | 12/18 px | 600 |
| Button | 15/20 px | 16/20 px | 700 |

Text line length is capped near 62 characters for body copy and 620 px for
introductory copy.

## Components

### Primary Amazon CTA

- 56 px desktop / 48 px mobile height.
- 8 px radius.
- Orange background, near-black text, external-link arrow.
- Hover: up to 2 px lift and 4 px arrow translation.
- Focus: 3 px high-contrast ring with visible offset.
- Disabled: no `href`, `aria-disabled=true`, no pointer affordance, and
  `Amazon link pending` status.
- Do not use Amazon logos, price, Prime, stars, stock, or review counts.

### Product card

- White or dark surface according to section.
- 16 px radius and one-pixel neutral border.
- Four-pixel SKU accent at top.
- Selected state: two-pixel accent border, check icon, and `SELECTED` text.
- Unselected cards retain normal opacity and readable contrast.
- Card itself is not a link; radios and Amazon CTA remain separate controls.

### Routine selector

- Native radio inputs remain in the accessibility tree.
- Two labeled options at desktop and mobile; wrapping is allowed at 320 px.
- `data-routine-option` carries the JS hook.
- `data-selection-live` provides polite selection announcements.

### Comparison

- Desktop: row labels plus equal D204/D215 columns.
- Mobile: one detail heading followed by D204 and D215 values.
- No winner icons, strength charts, or horizontal scroll.

### Video card

- 16:9 poster from real footage.
- Play control at least 56 × 56 px.
- Video is created/hydrated only after click; `preload=none`, no autoplay.
- Unavailable source remains a non-interactive pending state.
- Captions and transcript links remain visible after hydration.

### FAQ

- Native `<details>/<summary>`.
- 76 px minimum row on desktop; 56 px mobile.
- Multiple items may remain open.
- 180 ms maximum disclosure transition; remains usable without JS.

### Mobile sticky CTA

- 72 px shell plus `env(safe-area-inset-bottom)`.
- Hidden in hero and while final choice is visible.
- Selected-product label and link.
- Body/footer retain at least 96 px bottom clearance.

## Section rhythm

Recommended sequence and surface:

1. Header — translucent/dark.
2. Hero — ink 950.
3. Routine selector — warm white.
4. Comparison — carbon 800.
5. D204 spotlight — warm white.
6. D215 spotlight — ink 950.
7. How to apply — warm white.
8. Videos — carbon 800.
9. Why APGO — warm white.
10. FAQ — ink 950.
11. Final choice — warm white with dark inset panel.
12. Footer — ink 950.

Do not force every section to exactly one viewport. Content determines natural
height. Target overall desktop length is approximately 7,500–8,200 px.

## Motion

```css
:root {
  --motion-fast: 180ms;
  --motion-standard: 220ms;
  --motion-enter: 320ms;
  --motion-hero: 420ms;
  --motion-ease: cubic-bezier(.2, .8, .2, 1);
}
```

- Optional section reveal: opacity plus no more than 12 px vertical motion.
- Card stagger: 60 ms, capped at 180 ms total.
- Card hover lift: no more than 4 px.
- No parallax, marquee, floating bottle, autoplay, or carousel.
- `prefers-reduced-motion: reduce` removes transforms, stagger, smooth scroll,
  and nonessential transitions.

## Accessibility

- WCAG 2.2 AA target.
- Body contrast >=4.5:1; large display text >=3:1.
- Touch targets >=44 × 44 px.
- Visible keyboard focus on every control.
- Meaningful alt text for product images; decorative textures use empty alt.
- Skip link to main content.
- Semantic header/main/footer and one page H1.
- Pinch zoom is never disabled.
- Validate at 200% zoom and with reduced motion.
