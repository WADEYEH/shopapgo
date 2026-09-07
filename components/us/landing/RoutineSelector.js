"use client";

import { color, CONDENSED, products } from "@/lib/us/tokens";

// The DRY / WET radiogroup. `variant` is "desktop" (h48, inside the sticky bar) or "mobile" (h60).
export default function RoutineSelector({ sku, onPick, variant, labelledBy }) {
  const mobile = variant === "mobile";
  const seg = (sel, p) => ({
    bg: sel ? color.text : "transparent",
    fg: sel ? color.bg : color.tertiary,
    code: sel ? p.accentDim : p.accent,
  });
  const a = seg(sku === "d204", products.d204);
  const b = seg(sku === "d215", products.d215);

  const btn = (s, extra) => ({
    flex: 1,
    border: 0,
    cursor: "pointer",
    background: s.bg,
    color: s.fg,
    fontFamily: "inherit",
    fontWeight: 600,
    fontSize: mobile ? 13 : 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: mobile ? 10 : 14,
    minWidth: 0,
    padding: mobile ? "0 8px" : "0 12px",
    transition: "background .18s",
    ...(mobile ? { lineHeight: 1.15, textAlign: "left" } : { whiteSpace: "nowrap" }),
    ...extra,
  });
  const code = (c) => ({
    fontFamily: CONDENSED,
    fontWeight: 800,
    fontSize: 24,
    letterSpacing: ".06em",
    color: c,
  });

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      style={{
        display: "flex",
        ...(mobile ? { height: 60 } : { flex: "1 1 560px", minWidth: 0, height: 48 }),
        border: `1px solid ${color.border}`,
        borderRadius: 8,
        overflow: "hidden",
        background: color.bg,
      }}
    >
      <button role="radio" aria-checked={sku === "d204"} data-routine-option="d204" onClick={() => onPick("d204")} style={btn(a)}>
        <span style={code(a.code)}>DRY</span>After washing &amp; fully drying
      </button>
      <button
        role="radio"
        aria-checked={sku === "d215"}
        data-routine-option="d215"
        onClick={() => onPick("d215")}
        style={btn(b, { borderLeft: `1px solid ${color.border}` })}
      >
        <span style={code(b.code)}>WET</span>While paint is still wet
      </button>
    </div>
  );
}
