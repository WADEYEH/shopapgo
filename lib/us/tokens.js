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

// Product facts shared by landing and guides.
export const products = {
  d204: {
    sku: "d204",
    tag: "D204",
    word: "DRY",
    name: "Atomic Colored Glaze",
    fullName: "Dry · Atomic Colored Glaze",
    accent: color.dry,
    accentDim: color.dryDim,
    contents: "300 mL · 10.1 fl oz",
  },
  d215: {
    sku: "d215",
    tag: "D215",
    word: "WET",
    name: "Atomic Glaze Coating",
    fullName: "Wet · Atomic Glaze Coating",
    accent: color.wet,
    accentDim: color.wetDim,
    contents: "200 mL · 6.8 fl oz",
  },
};
