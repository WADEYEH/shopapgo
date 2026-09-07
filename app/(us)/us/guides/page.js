import Link from "next/link";
import GuideHeader from "@/components/us/guides/GuideHeader";
import GuideFooter from "@/components/us/guides/GuideFooter";
import GuideButton from "@/components/us/guides/GuideButton";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";

const TITLE = "APGO car care guides";
const DESCRIPTION =
  "Practical guidance for what comes after the wash—from drying and choosing an application routine to using your APGO product.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.guides },
  openGraph: { title: TITLE, description: DESCRIPTION, url: routes.guides, images: [asset("application/d215-step-1.webp")] },
};

const sectionH2 = {
  margin: 0,
  fontFamily: CONDENSED,
  fontWeight: 800,
  fontSize: "clamp(32px,4vw,48px)",
  lineHeight: 0.92,
  textTransform: "uppercase",
};
const sectionP = { margin: 0, fontSize: 16, lineHeight: 1.55, color: color.tertiary };
const cardLabel = (c) => ({ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: c, fontWeight: 700 });
const cardExcerpt = { fontSize: 15, lineHeight: 1.5, color: color.tertiary };

export default function GuidesPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <GuideHeader />
      <main>
        <section style={{ borderBottom: `1px solid ${color.hairline}` }}>
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "clamp(40px,6vw,88px) 20px clamp(32px,4vw,56px)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: color.orange,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: ".18em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ width: 28, height: 2, background: color.orange }}></span>Guides
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: CONDENSED,
                fontWeight: 800,
                fontSize: "clamp(52px,9vw,120px)",
                lineHeight: 0.86,
                textTransform: "uppercase",
                textWrap: "balance",
              }}
            >
              APGO car care guides
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "clamp(17px,1.5vw,21px)",
                lineHeight: 1.5,
                color: color.secondary,
                maxWidth: 680,
                textWrap: "pretty",
              }}
            >
              Practical guidance for what comes after the wash—from drying and choosing an application routine to using your APGO
              product.
            </p>
          </div>
        </section>

        {/* START HERE */}
        <section style={{ borderBottom: `1px solid ${color.hairline}` }}>
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "clamp(40px,5vw,72px) 20px",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 680 }}>
              <h2 style={sectionH2}>Start here</h2>
              <p style={sectionP}>
                New to paint care, or deciding where a product fits into your wash? These guides explain the basics and help you
                choose your next step.
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
                gap: "clamp(16px,2vw,24px)",
              }}
            >
              <Link
                href={routes.afterWashing}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  textDecoration: "none",
                  color: color.text,
                  borderTop: `4px solid ${color.tertiary}`,
                  paddingTop: 14,
                }}
              >
                <img
                  src={asset("application/d215-step-1.webp")}
                  alt=""
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                />
                <span style={cardLabel(color.tertiary)}>Basics · Wash & care</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 30, lineHeight: 0.95, textTransform: "uppercase" }}>
                  What to do after washing your car
                </span>
                <span style={cardExcerpt}>
                  Learn what to check after rinsing, how to prepare your towels, and when to apply a paint-care product. A
                  straightforward starting point, whether or not you use APGO.
                </span>
                <GuideButton>Read the wash-care guide →</GuideButton>
              </Link>
              <Link
                href={routes.wetOrDry}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  textDecoration: "none",
                  color: color.text,
                  borderTop: `4px solid ${color.orange}`,
                  paddingTop: 14,
                }}
              >
                <img
                  src={asset("generated/atomic-layers-macro.png")}
                  alt=""
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                />
                <span style={cardLabel(color.orange)}>Compare · Choose your routine</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 30, lineHeight: 0.95, textTransform: "uppercase" }}>
                  APGO paint protection: wet or dry application?
                </span>
                <span style={cardExcerpt}>
                  Atomic Colored Glaze goes on dry paint. Atomic Glaze Coating goes on wet paint. Compare the application steps and
                  tools before choosing—both routines include a final buff.
                </span>
                <GuideButton>Compare the two routines →</GuideButton>
              </Link>
            </div>
          </div>
        </section>

        {/* PRODUCT GUIDES */}
        <section style={{ borderBottom: `1px solid ${color.hairline}` }}>
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "clamp(40px,5vw,72px) 20px",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 680 }}>
              <h2 style={sectionH2}>Product application guides</h2>
              <p style={sectionP}>
                Already know which product you are using? Follow its specific instructions rather than treating every spray product
                the same way.
              </p>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
                gap: "clamp(16px,2vw,24px)",
              }}
            >
              <Link
                href={routes.coloredGlaze}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 18,
                  alignItems: "start",
                  textDecoration: "none",
                  color: color.text,
                  border: `1px solid ${color.border}`,
                  borderTop: `4px solid ${color.dry}`,
                  padding: 20,
                  background: color.raised,
                }}
              >
                <img src={asset("products/d204-packshot.png")} alt="" style={{ width: 96, height: 96, objectFit: "contain" }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                  <span style={cardLabel(color.dry)}>How-to · Dry-surface application</span>
                  <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 28, lineHeight: 0.95, textTransform: "uppercase" }}>
                    How to apply APGO Atomic Colored Glaze
                  </span>
                  <span style={cardExcerpt}>
                    Prepare clean, completely dry paint, apply a thin amount, spread, and buff. Learn how to recognize overapplication
                    and what APGO recommends after you finish.
                  </span>
                  <GuideButton>Read the dry-application guide →</GuideButton>
                </span>
              </Link>
              <Link
                href={routes.glazeCoating}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 18,
                  alignItems: "start",
                  textDecoration: "none",
                  color: color.text,
                  border: `1px solid ${color.border}`,
                  borderTop: `4px solid ${color.wet}`,
                  padding: 20,
                  background: color.raised,
                }}
              >
                <img src={asset("products/d215-packshot.png")} alt="" style={{ width: 96, height: 96, objectFit: "contain" }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                  <span style={cardLabel(color.wet)}>How-to · Wet-surface application</span>
                  <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 28, lineHeight: 0.95, textTransform: "uppercase" }}>
                    How to apply APGO Atomic Glaze Coating
                  </span>
                  <span style={cardExcerpt}>
                    Apply after washing and rinsing, while the paint is still wet. Follow the full sequence: spread with a damp
                    application cloth, towel-dry, then finish with a separate buffing towel.
                  </span>
                  <GuideButton>Read the wet-application guide →</GuideButton>
                </span>
              </Link>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section style={{ background: color.raised, borderTop: `4px solid ${color.orange}` }}>
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "clamp(40px,5vw,72px) 20px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: CONDENSED,
                fontWeight: 800,
                fontSize: "clamp(36px,5vw,64px)",
                lineHeight: 0.9,
                textTransform: "uppercase",
                textWrap: "balance",
              }}
            >
              Not sure which instructions apply?
            </h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: color.secondary, maxWidth: 640 }}>
              If your car already has wax, a coating, or another surface treatment, check compatibility before applying a new product.
              Tell us which APGO product you plan to use and what is currently on the vehicle.
            </p>
            <Link
              href={routes.faq}
              className="us-btn"
              style={{
                alignSelf: "flex-start",
                background: color.orange,
                color: color.bg,
                height: 52,
                padding: "0 24px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontWeight: 700,
                fontSize: 16,
                textDecoration: "none",
              }}
            >
              Contact APGO <span aria-hidden="true">→</span>
            </Link>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: color.quiet2, lineHeight: 1.5 }}>
              These guides are published by APGO. Follow the current directions for your specific product and your vehicle's care
              requirements.
            </p>
          </div>
        </section>
      </main>
      <GuideFooter />
    </div>
  );
}
