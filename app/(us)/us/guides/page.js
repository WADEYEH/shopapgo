import Link from "next/link";
import GuideButton from "@/components/us/guides/GuideButton";
import JsonLd, { breadcrumbLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";

const TITLE = "APGO car care guides";
// Shared by the visible breadcrumb and the BreadcrumbList JSON-LD so they cannot drift.
const CRUMB = "Guides";
const DESCRIPTION =
  "Practical guidance for what comes after the wash—from drying and choosing an application routine to using your APGO product.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.guides },
  openGraph: { title: TITLE, description: DESCRIPTION, url: routes.guides, images: [asset("application/d215-step-1.webp")] },
};

const GUIDE_GROUPS = [
  {
    id: "compare-and-choose",
    label: "Compare & choose",
    labelColor: color.tertiary,
    items: [routes.waxVsSprayCoating, routes.diyVsPro],
  },
  {
    id: "prep-and-application",
    label: "Prep & application",
    labelColor: color.orange,
    items: [routes.wetOrDry, routes.coatingOverWax, routes.coloredGlaze, routes.glazeCoating],
  },
  {
    id: "wash-and-care",
    label: "Wash & care",
    labelColor: color.dry,
    items: [routes.afterWashing, routes.autoWashCoating],
  },
  {
    id: "durability-and-weather",
    label: "Durability & weather",
    labelColor: color.wet,
    items: [routes.howOftenReapply, routes.rainDamageCoating],
  },
];

const JUMP_LINK_LABELS = {
  [routes.waxVsSprayCoating]: "Car wax vs spray ceramic coating",
  [routes.diyVsPro]: "DIY ceramic coating vs professional",
  [routes.wetOrDry]: "Wet or dry application?",
  [routes.coatingOverWax]: "Can I apply ceramic coating over wax?",
  [routes.coloredGlaze]: "How to apply Atomic Colored Glaze (dry)",
  [routes.glazeCoating]: "How to apply Atomic Glaze Coating (wet)",
  [routes.afterWashing]: "What to do after washing your car",
  [routes.autoWashCoating]: "Does an automatic car wash remove ceramic coating?",
  [routes.howOftenReapply]: "How often to apply ceramic spray coating",
  [routes.rainDamageCoating]: "Does rain damage ceramic coating?",
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
      <JsonLd data={breadcrumbLd([{ name: "Home", route: routes.home }, { name: CRUMB }])} />
      <main id="main">
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
            <nav aria-label="Breadcrumb" className="us-breadcrumb"><Link href={routes.home}>Home</Link><span aria-hidden="true">›</span><span aria-current="page">{CRUMB}</span></nav>
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
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 16,
                lineHeight: 1.55,
                color: color.tertiary,
                maxWidth: 680,
              }}
            >
              New to paint care, or deciding where a product fits into your wash? These guides explain the basics and help you
              choose your next step.
            </p>
          </div>
        </section>

        {/* BROWSE BY TOPIC */}
        <section style={{ borderBottom: `1px solid ${color.hairline}` }}>
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "clamp(32px,4vw,48px) 20px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <h2 style={{ ...sectionH2, fontSize: "clamp(24px,3vw,32px)" }}>Browse by topic</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: "clamp(20px,3vw,32px)" }}>
              {GUIDE_GROUPS.filter((g) => g.items.length > 0).map((group) => (
                <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <a href={`#${group.id}`} style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: group.labelColor, fontWeight: 700, textDecoration: "none" }}>{group.label}</a>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, lineHeight: 1.45 }}>
                    {group.items.map((route) => (
                      <li key={route}><Link href={route} className="us-text-link">{JUMP_LINK_LABELS[route]}</Link></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARE & CHOOSE */}
        <section id="compare-and-choose" style={{ borderBottom: `1px solid ${color.hairline}` }}>
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
            <h2 style={sectionH2}>Compare & choose</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
                gap: "clamp(16px,2vw,24px)",
              }}
            >
              <Link
                href={routes.waxVsSprayCoating}
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
                  src={asset("generated/car-wax-vs-spray-hero.png")}
                  alt=""
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                />
                <span style={cardLabel(color.orange)}>Compare · Finish strategies</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 30, lineHeight: 0.95, textTransform: "uppercase" }}>
                  Car Wax vs Spray Ceramic Coating
                </span>
                <span style={cardExcerpt}>
                  Compare traditional car wax and spray ceramic coating on time, steps, and how long the finish holds—without another how-to tutorial.
                </span>
                <GuideButton>Read the comparison →</GuideButton>
              </Link>
              <Link
                href={routes.diyVsPro}
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
                  src={asset("generated/diy-vs-pro-hero-title.png")}
                  alt=""
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                />
                <span style={cardLabel(color.orange)}>Compare · Buying decision</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 30, lineHeight: 0.95, textTransform: "uppercase" }}>
                  DIY Ceramic Coating vs Professional
                </span>
                <span style={cardExcerpt}>
                  DIY spray coating buys a redoable afternoon at home; a pro shop buys bay time and a longer package. Compare time, cost, and effort before you choose.
                </span>
                <GuideButton>Read the comparison →</GuideButton>
              </Link>
            </div>
          </div>
        </section>

        {/* PREP & APPLICATION */}
        <section id="prep-and-application" style={{ borderBottom: `1px solid ${color.hairline}` }}>
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
              <h2 style={sectionH2}>Prep & application</h2>
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
              <Link
                href={routes.coatingOverWax}
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
                  src={asset("generated/coating-over-wax-hero.png")}
                  alt=""
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                />
                <span style={cardLabel(color.orange)}>Check · Compatibility</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 30, lineHeight: 0.95, textTransform: "uppercase" }}>
                  Can I apply ceramic coating over wax?
                </span>
                <span style={cardExcerpt}>
                  Your paint may already have something on it. Use this checklist to decide whether to spray now or clear the surface
                  first.
                </span>
                <GuideButton>Read the compatibility guide →</GuideButton>
              </Link>
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

        {/* WASH & CARE */}
        <section id="wash-and-care" style={{ borderBottom: `1px solid ${color.hairline}` }}>
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
            <h2 style={sectionH2}>Wash & care</h2>
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
                href={routes.autoWashCoating}
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
                  src={asset("generated/auto-wash-vs-hand-wash.png")}
                  alt=""
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                />
                <span style={cardLabel(color.orange)}>Wash · Care</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 30, lineHeight: 0.95, textTransform: "uppercase" }}>
                  Does an Automatic Car Wash Remove Ceramic Coating?
                </span>
                <span style={cardExcerpt}>
                  An automatic wash rarely strips spray coating in one pass—but brushes, strong soap, and repeat friction wear it
                  down sooner. Compare tunnel risk vs a gentler hand wash.
                </span>
                <GuideButton>Read the wash care guide →</GuideButton>
              </Link>
            </div>
          </div>
        </section>

        {/* DURABILITY & WEATHER */}
        <section id="durability-and-weather" style={{ borderBottom: `1px solid ${color.hairline}` }}>
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
            <h2 style={sectionH2}>Durability & weather</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
                gap: "clamp(16px,2vw,24px)",
              }}
            >
              <Link
                href={routes.howOftenReapply}
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
                  src={asset("generated/how-often-reapply-hero.png")}
                  alt=""
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                />
                <span style={cardLabel(color.orange)}>Cadence · Reapply signals</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 30, lineHeight: 0.95, textTransform: "uppercase" }}>
                  How Often to Apply Ceramic Spray Coating
                </span>
                <span style={cardExcerpt}>
                  Reapply when paint signals fade—not on a fixed month. Treat the label's figure as a ceiling, then watch water
                  beading and gloss.
                </span>
                <GuideButton>Read the cadence guide →</GuideButton>
              </Link>
              <Link
                href={routes.rainDamageCoating}
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
                  src={asset("generated/rain-vs-salt-spots.png")}
                  alt=""
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                />
                <span style={cardLabel(color.orange)}>Weather · Care</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 30, lineHeight: 0.95, textTransform: "uppercase" }}>
                  Does Rain Damage Ceramic Coating?
                </span>
                <span style={cardExcerpt}>
                  Clean rain rarely ruins a spray coating in one shower—dirty water spots and winter road salt that sit on paint
                  are the real risks. Know what to rinse and when.
                </span>
                <GuideButton>Read the weather care guide →</GuideButton>
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
              View FAQs <span aria-hidden="true">→</span>
            </Link>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: color.quiet2, lineHeight: 1.5 }}>
              These guides are published by APGO. Follow the current directions for your specific product and your vehicle's care
              requirements.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
