// Shared inline-style objects for the guide articles. Values are ported 1:1 from the design files.
import { color, CONDENSED } from "@/lib/us/tokens";

export const container = { maxWidth: 1100, margin: "0 auto", padding: "0 20px" };

export const h2 = {
  margin: 0,
  fontFamily: CONDENSED,
  fontWeight: 800,
  fontSize: "clamp(32px,4vw,44px)",
  lineHeight: 0.92,
  textTransform: "uppercase",
};
export const h2Balance = { ...h2, textWrap: "balance" };
export const h2Faq = { ...h2, margin: "0 0 6px" };

export const h3 = {
  margin: "8px 0 0",
  fontFamily: CONDENSED,
  fontWeight: 700,
  fontSize: 26,
  lineHeight: 1,
  textTransform: "uppercase",
};

export const section = { display: "flex", flexDirection: "column", gap: 16 };

export const lead = { margin: 0, fontSize: 18, lineHeight: 1.6, color: color.secondary };
export const body = { margin: 0, fontSize: 17, lineHeight: 1.6, color: color.secondary };
export const strong = { fontWeight: 600, color: color.text };
export const finePrint = { margin: 0, fontSize: 13, color: color.quiet2, lineHeight: 1.5 };

export const chip = {
  border: `1px solid ${color.border}`,
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 13,
  letterSpacing: ".06em",
  color: color.secondary,
};

export const label = (accent) => ({
  fontSize: 12,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: accent,
  fontWeight: 700,
});

// Big accent word used for step titles ("01 · Spray") and section markers ("DRY").
export const stepTitle = (accent) => ({
  fontFamily: CONDENSED,
  fontWeight: 800,
  fontSize: 40,
  lineHeight: 1,
  color: accent,
});
