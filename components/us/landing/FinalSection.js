import { asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import AmazonCta from "./AmazonCta";

const ctaStyle = {
  width: "100%",
  background: color.orange,
  color: color.bg,
  height: 56,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  fontWeight: 700,
  fontSize: 16,
  textDecoration: "none",
};

function Cell({ sku, accent, word, name, meta, cta }) {
  return (
    <div
      style={{
        background: color.raised,
        padding: "clamp(24px,3vw,40px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        borderTop: `4px solid ${accent}`,
      }}
    >
      <img src={asset(`products/${sku}-packshot.png`)} alt="" style={{ width: 180, height: 180, objectFit: "contain" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 44, lineHeight: 1, color: accent, letterSpacing: ".04em" }}>{word}</span>
        <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 20, textTransform: "uppercase" }}>{name}</span>
        <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: color.quiet }}>{meta}</span>
      </div>
      <AmazonCta sku={sku} placement="final" style={ctaStyle}>
        {cta}
      </AmazonCta>
    </div>
  );
}

export default function FinalSection() {
  return (
    <section id="final" style={{ background: color.bg, borderTop: `4px solid ${color.orange}` }}>
      <div
        style={{
          maxWidth: 1312,
          margin: "0 auto",
          padding: "clamp(56px,7vw,104px) clamp(20px,4.4vw,64px)",
          display: "flex",
          flexDirection: "column",
          gap: "clamp(28px,3vw,48px)",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820, alignItems: "center" }}>
          <div style={{ color: color.orange, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase" }}>Available on Amazon US</div>
          <h2
            style={{
              margin: 0,
              fontFamily: CONDENSED,
              fontWeight: 800,
              fontSize: "clamp(44px,6vw,88px)",
              lineHeight: 0.88,
              textTransform: "uppercase",
              textWrap: "balance",
            }}
          >
            Choose the product that fits your routine.
          </h2>
          <p style={{ margin: 0, fontSize: "clamp(15px,1.2vw,17px)", lineHeight: 1.5, color: color.tertiary }}>
            Current pricing, availability, shipping, and order returns are shown and handled on Amazon.com.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))",
            gap: 2,
            width: "100%",
            maxWidth: 960,
            background: color.hairline,
            border: `1px solid ${color.hairline}`,
          }}
        >
          <Cell sku="d204" accent={color.dry} word="DRY" name="Atomic Colored Glaze" meta="After drying · 300 mL" cta="Buy Dry on Amazon" />
          <Cell sku="d215" accent={color.wet} word="WET" name="Atomic Glaze Coating" meta="Before final drying · 200 mL" cta="Buy Wet on Amazon" />
        </div>
        <span style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: color.quiet }}>Opens Amazon.com</span>
      </div>
    </section>
  );
}
