import { asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { config } from "@/lib/us/config";
import AmazonCta from "./AmazonCta";
import Eyebrow from "./Eyebrow";

// Hero always shows D204 regardless of the selected routine (per handoff).
export default function Hero() {
  const eyebrow =
    config.showOrigin === false
      ? "APGO Auto Care · Taiwan’s No.1 car-care brand"
      : "APGO Auto Care · Taiwan’s No.1 car-care brand · Made in Taiwan";
  const specNum = { fontFamily: CONDENSED, fontWeight: 800, fontSize: "clamp(30px,2.8vw,40px)" };
  const specLabel = { fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: color.tertiary };

  return (
    <section id="top" style={{ position: "relative", overflow: "hidden", background: color.bg }}>
      <div
        style={{
          maxWidth: 1312,
          margin: "0 auto",
          padding: "clamp(32px,4vw,56px) clamp(20px,4.4vw,64px) 0",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))",
          gap: "clamp(16px,3vw,40px)",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(18px,2vw,28px)", order: 1 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1
            style={{
              margin: 0,
              fontFamily: CONDENSED,
              fontWeight: 800,
              fontSize: "clamp(64px,10.4vw,152px)",
              lineHeight: 0.86,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
              textWrap: "balance",
            }}
          >
            Professional finish care. <span style={{ color: color.orange }}>Made simple.</span>
          </h1>
          <p style={{ margin: 0, maxWidth: 560, fontSize: "clamp(16px,1.4vw,20px)", lineHeight: 1.5, color: color.secondary, textWrap: "pretty" }}>
            Same simple core: spray, spread, and finish with a clean towel. The only difference is timing—
            <strong style={{ color: color.dry, fontWeight: 600 }}>Dry</strong> after you've dried the paint,{" "}
            <strong style={{ color: color.wet, fontWeight: 600 }}>Wet</strong> while it's still wet.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <AmazonCta
              sku="d204"
              placement="hero"
              style={{
                background: color.orange,
                color: color.bg,
                height: 56,
                padding: "0 28px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontWeight: 700,
                fontSize: 17,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Buy Dry · Atomic Colored Glaze
            </AmazonCta>
            <a
              href="#compare"
              style={{
                color: color.text,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 56,
                padding: "0 4px",
                borderBottom: `1px solid ${color.border}`,
              }}
            >
              Compare Dry &amp; Wet <span style={{ color: color.orange }}>↓</span>
            </a>
          </div>
        </div>
        <div style={{ position: "relative", aspectRatio: "1", maxWidth: 720, width: "100%", margin: "0 auto", order: 2 }}>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              right: "-3%",
              top: "4%",
              fontFamily: CONDENSED,
              fontWeight: 800,
              fontSize: "clamp(200px,32vw,460px)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
              color: "transparent",
              WebkitTextStroke: "1px #23272e",
              userSelect: "none",
            }}
          >
            DRY
          </div>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "52%",
              width: "78%",
              height: "78%",
              transform: "translate(-50%,-50%)",
              borderRadius: "50%",
              background: "radial-gradient(circle,rgba(233,148,149,.28),rgba(8,10,12,0) 68%)",
            }}
          />
          <img
            src={asset("products/d204-packshot.png")}
            alt="APGO Atomic Colored Glaze, 300 mL bottle and box"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
      </div>
      <div style={{ maxWidth: 1312, margin: "0 auto", padding: "0 clamp(20px,4.4vw,64px)" }}>
        <div
          style={{
            borderTop: `1px solid ${color.hairline}`,
            padding: "20px 0 clamp(28px,3vw,40px)",
            display: "flex",
            flexWrap: "wrap",
            gap: "16px 40px",
            alignItems: "baseline",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ ...specNum, color: color.dry, letterSpacing: ".04em" }}>DRY</span>
            <span style={specLabel}>Apply after drying</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ ...specNum, textTransform: "uppercase" }}>Atomic Colored Glaze</span>
            <span style={{ fontSize: 12, letterSpacing: ".14em", color: color.quiet, border: `1px solid ${color.border}`, padding: "3px 8px", borderRadius: 4 }}>
              D204
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={specNum}>300 mL</span>
            <span style={specLabel}>10.1 fl oz</span>
          </div>
        </div>
      </div>
    </section>
  );
}
