import { color, CONDENSED } from "@/lib/us/tokens";
import { config } from "@/lib/us/config";
import Eyebrow from "./Eyebrow";

const stat = { fontFamily: CONDENSED, fontWeight: 800, fontSize: "clamp(56px,5vw,84px)", lineHeight: 0.9, color: color.orange };
const statLabel = { fontSize: 14, letterSpacing: ".12em", textTransform: "uppercase", color: color.tertiary };
const cell = { background: color.bg, padding: "clamp(20px,2.6vw,36px)", display: "flex", flexDirection: "column", gap: 10 };
const marker = { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: color.bg, padding: "0 12px" };
const markerLabel = { fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: color.quiet, fontWeight: 700 };
const hollowDot = { width: 11, height: 11, borderRadius: "50%", border: `2px solid ${color.quiet}`, boxSizing: "border-box" };

export default function BrandSection() {
  return (
    <section
      id="brand"
      style={{
        position: "relative",
        overflow: "hidden",
        background: color.bg,
        backgroundImage: "radial-gradient(rgba(251,248,244,.07) 1px,transparent 1px)",
        backgroundSize: "28px 28px",
        borderTop: `1px solid ${color.hairline}`,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "clamp(20px,4.4vw,64px)",
          top: "clamp(24px,4vw,56px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 6,
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontFamily: CONDENSED,
            fontWeight: 800,
            fontSize: "clamp(72px,11vw,168px)",
            lineHeight: 0.85,
            letterSpacing: "-0.02em",
            color: "transparent",
            WebkitTextStroke: "1px #2a2f37",
          }}
        >
          EST.<span style={{ color: color.orange, WebkitTextStroke: 0 }}> 2011</span>
        </span>
        <span style={{ fontSize: 12, letterSpacing: ".24em", textTransform: "uppercase", color: color.quiet, fontWeight: 700 }}>Taipei, Taiwan</span>
      </div>
      <div
        style={{
          position: "relative",
          maxWidth: 1312,
          margin: "0 auto",
          padding: "clamp(56px,7vw,104px) clamp(20px,4.4vw,64px)",
          display: "flex",
          flexDirection: "column",
          gap: "clamp(32px,4vw,64px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))",
            gap: "clamp(28px,4vw,64px)",
            alignItems: "end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <Eyebrow>The APGO story</Eyebrow>
            <h2
              style={{
                margin: 0,
                fontFamily: CONDENSED,
                fontWeight: 800,
                fontSize: "clamp(44px,6vw,92px)",
                lineHeight: 0.88,
                textTransform: "uppercase",
                textWrap: "balance",
              }}
            >
              Taiwan’s No.1 car-care brand. Fifteen years in the making.
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: "clamp(17px,1.4vw,21px)", lineHeight: 1.5, color: color.secondary, maxWidth: 560, textWrap: "pretty" }}>
            APGO started in Taiwan with one conviction: a good finish shouldn't cost a Saturday. Fifteen years and three markets later, more
            Taiwanese drivers reach for APGO than any other car-care brand—because our lab turned the hours-long wax into something you do with
            a spray bottle and a clean towel.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))",
            gap: 2,
            background: color.hairline,
            border: `1px solid ${color.hairline}`,
          }}
        >
          <div style={cell}>
            <span style={stat}>No.1</span>
            <span style={statLabel}>Best-selling car-care brand in Taiwan</span>
            <span style={{ fontSize: 12, color: color.quiet, lineHeight: 1.4 }}>{config.rankSource}</span>
          </div>
          <div style={cell}>
            <span style={stat}>
              15<span style={{ fontSize: ".5em", verticalAlign: "top" }}> yrs</span>
            </span>
            <span style={statLabel}>Developing car care in Taiwan</span>
          </div>
          <div style={cell}>
            <span style={stat}>3</span>
            <span style={statLabel}>Markets · Taiwan, Singapore, Malaysia</span>
          </div>
        </div>
        <div aria-hidden="true" style={{ position: "relative", paddingTop: 12 }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 17,
              height: 1,
              background: "linear-gradient(90deg,transparent,#3a4048 10%,#3a4048 90%,transparent)",
            }}
          />
          <div style={{ position: "relative", display: "flex", justifyContent: "center", gap: "clamp(40px,12vw,220px)", flexWrap: "wrap" }}>
            <div style={marker}>
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: color.orange, boxShadow: "0 0 0 6px rgba(240,132,23,.18)" }} />
              <span style={{ ...markerLabel, color: color.orange, whiteSpace: "nowrap" }}>Taiwan · HQ</span>
            </div>
            <div style={marker}>
              <span style={hollowDot} />
              <span style={markerLabel}>Singapore</span>
            </div>
            <div style={marker}>
              <span style={hollowDot} />
              <span style={markerLabel}>Malaysia</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
