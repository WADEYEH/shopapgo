"use client";

import { color, CONDENSED, products } from "@/lib/us/tokens";

// One responsive selector next to the product cards it controls.
export default function RoutineSelector({ sku, onPick, labelledBy }) {
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
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minWidth: 0,
    padding: "0 8px",
    transition: "background .18s",
    lineHeight: 1.15,
    textAlign: "left",
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
      className="us-routine-selector"
      aria-labelledby={labelledBy}
      onKeyDown={(event) => {
        const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "d204" : event.key === "End" ? "d215" : sku === "d204" ? "d215" : "d204";
        onPick(next);
        event.currentTarget.querySelector(`[data-routine-option="${next}"]`)?.focus();
      }}
      style={{
        display: "flex",
        height: 60,
        border: `1px solid ${color.border}`,
        borderRadius: 8,
        overflow: "hidden",
        background: color.bg,
      }}
    >
      <button type="button" role="radio" tabIndex={sku === "d204" ? 0 : -1} aria-checked={sku === "d204"} data-routine-option="d204" onClick={() => onPick("d204")} style={btn(a)}>
        <span style={code(a.code)}>DRY</span>After washing &amp; fully drying
      </button>
      <button
        type="button"
        role="radio"
        tabIndex={sku === "d215" ? 0 : -1}
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
