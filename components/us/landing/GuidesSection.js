import Link from "next/link";
import { routes } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { CARDS } from "@/components/us/guides/RelatedGuides";
import GuideButton from "@/components/us/guides/GuideButton";
import Eyebrow from "./Eyebrow";

// Links the landing page to the four guides. Heading and lede reuse the guides hub copy;
// card labels/titles reuse the "Keep reading" cards; the CTA lines reuse the hub's card CTAs.
const ORDER = ["afterWashing", "wetOrDry", "coloredGlaze", "glazeCoating"];
const CTA = {
  afterWashing: "Read the wash-care guide →",
  wetOrDry: "Compare the two routines →",
  coloredGlaze: "Read the dry-application guide →",
  glazeCoating: "Read the wet-application guide →",
};

export default function GuidesSection() {
  return (
    <section id="guides" style={{ background: color.bg, borderTop: `1px solid ${color.hairline}` }}>
      <div
        style={{
          maxWidth: 1312,
          margin: "0 auto",
          padding: "clamp(56px,7vw,104px) clamp(20px,4.4vw,64px)",
          display: "flex",
          flexDirection: "column",
          gap: "clamp(28px,3vw,44px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))",
            gap: "clamp(20px,3vw,48px)",
            alignItems: "end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Eyebrow>Guides</Eyebrow>
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
              <Link href={routes.guides} style={{ color: "inherit", textDecoration: "none" }}>
                APGO car care guides
              </Link>
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: "clamp(16px,1.3vw,19px)", lineHeight: 1.5, color: color.tertiary, maxWidth: 520, textWrap: "pretty" }}>
            Practical guidance for what comes after the wash—from drying and choosing an application routine to using your APGO product.
          </p>
        </div>
        <div className="us-guides-grid" style={{ display: "grid", gap: "clamp(16px,2vw,24px)" }}>
          {ORDER.map((key) => {
            const c = CARDS[key];
            return (
              <Link
                key={key}
                href={c.href}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  textDecoration: "none",
                  color: color.text,
                  borderTop: `4px solid ${c.labelColor}`,
                  paddingTop: 14,
                }}
              >
                <img src={c.img} alt="" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }} />
                <span style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: c.labelColor, fontWeight: 700 }}>
                  {c.label}
                </span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 26, lineHeight: 0.95, textTransform: "uppercase" }}>
                  {c.title}
                </span>
                <GuideButton>{CTA[key]}</GuideButton>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
