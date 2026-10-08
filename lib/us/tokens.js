import { PRODUCTS } from "@/lib/shop/catalog";

// Design tokens from the handoff. Use these instead of retyping hex values.
export const color = {
  bg: "#080A0C",
  raised: "#0d1014",
  surface: "#111419",
  hairline: "#1d2128",
  border: "#292E35",
  mutedLine: "#3a4048",
  text: "#FBF8F4",
  secondary: "#D8DCE1",
  tertiary: "#A8AFB8",
  quiet: "#68707a",
  quiet2: "#7d858f",
  orange: "#F08417",
  dry: "#E99495",
  dryDim: "#956263",
  wet: "#6EAC30",
  wetDim: "#547f28",
};

// Font stacks. The CSS variables are set on <body> by app/(us)/layout.js via next/font.
export const CONDENSED = "var(--font-barlow-condensed), 'Barlow Condensed', system-ui, sans-serif";
export const BODY = "var(--font-barlow), 'Barlow', system-ui, sans-serif";

// Product facts shared by landing and guides. Names, SKUs, contents, when to apply and how long each lasts come from the
// store's product data (lib/shop/catalog.js), the one list the store pages and the Worker read too (D41).
const facts = (sku) => {
  const p = PRODUCTS[sku];
  return { sku, tag: p.sku, name: p.name, fullName: `${p.word} · ${p.name}`, size: p.size, oz: p.oz, contents: `${p.size} · ${p.oz}`, when: p.when, lasts: p.lasts };
};

export const products = {
  d204: { ...facts("d204"), word: "DRY", accent: color.dry, accentDim: color.dryDim },
  d215: { ...facts("d215"), word: "WET", accent: color.wet, accentDim: color.wetDim },
};
