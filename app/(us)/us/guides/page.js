import Link from "next/link";
import GuideButton from "@/components/us/guides/GuideButton";
import JsonLd, { breadcrumbLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";

const TITLE = "APGO car care guides";
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
    items: [routes.paintProtectionTypes, routes.whatIsSprayCeramic, routes.whatIsCarGlaze, routes.sprayVsCoating, routes.coatingScratches, routes.waxVsSprayCoating, routes.isSprayWorthIt, routes.diyVsPro, routes.chooseCoatingSpray],
  },
  {
    id: "prep-and-application",
    label: "Prep & application",
    labelColor: color.orange,
    items: [routes.prepForSpray, routes.clayBarFirst, routes.detailingSteps, routes.wetOrDry, routes.coatingOverWax, routes.removeWaxFirst, routes.waitToWash, routes.coloredGlaze, routes.glazeCoating],
  },
  {
    id: "wash-and-care",
    label: "Wash & care",
    labelColor: color.dry,
    items: [routes.coatingMaintenance, routes.washCoatedCar, routes.afterWashing, routes.autoWashCoating],
  },
  {
    id: "durability-and-weather",
    label: "Durability & weather",
    labelColor: color.wet,
    items: [routes.howOftenReapply, routes.rainDamageCoating, routes.winterWash],
  },
  {
    id: "paint-vehicle-surface",
    label: "By paint, vehicle & surface",
    labelColor: color.dry,
    items: [routes.windshieldCoating],
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    labelColor: color.orange,
    items: [routes.streaksHighSpots],
  },
];

const JUMP_LINK_LABELS = {
  [routes.paintProtectionTypes]: "Types of paint protection",
  [routes.whatIsSprayCeramic]: "What is spray ceramic?",
  [routes.whatIsCarGlaze]: "What is car glaze?",
  [routes.sprayVsCoating]: "Ceramic spray vs coating",
  [routes.coatingScratches]: "Scratches & coating",
  [routes.waxVsSprayCoating]: "Wax vs spray coating",
  [routes.isSprayWorthIt]: "Is ceramic spray worth it?",
  [routes.diyVsPro]: "DIY ceramic coating vs professional",
  [routes.chooseCoatingSpray]: "Choose a coating spray",
  [routes.prepForSpray]: "Prep for ceramic spray",
  [routes.clayBarFirst]: "Clay bar before coating",
  [routes.detailingSteps]: "Exterior detailing steps",
  [routes.wetOrDry]: "Compare dry & wet",
  [routes.coatingOverWax]: "Coating over wax?",
  [routes.removeWaxFirst]: "Remove wax first",
  [routes.waitToWash]: "When to wash after spraying",
  [routes.coloredGlaze]: "Colored Glaze · DRY",
  [routes.glazeCoating]: "Glaze Coating · WET",
  [routes.coatingMaintenance]: "Coating maintenance",
  [routes.washCoatedCar]: "Wash a coated car",
  [routes.afterWashing]: "After washing your car",
  [routes.autoWashCoating]: "Auto wash & coating",
  [routes.howOftenReapply]: "How often to reapply",
  [routes.rainDamageCoating]: "Rain & coating",
  [routes.winterWash]: "Winter washing",
  [routes.windshieldCoating]: "Windshield & glass",
  [routes.streaksHighSpots]: "Streaks & high spots",
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
const cardTitle = { fontFamily: CONDENSED, fontWeight: 700, fontSize: 30, lineHeight: 0.95, textTransform: "uppercase" };
const cardStyle = (borderColor) => ({
  display: "flex",
  flexDirection: "column",
  gap: 12,
  textDecoration: "none",
  color: color.text,
  borderTop: `4px solid ${borderColor}`,
  paddingTop: 14,
});
const cardImg = { width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" };

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
              {/* #11 types-of-car-paint-protection */}
              <Link href={routes.paintProtectionTypes} style={cardStyle(color.tertiary)}>
                <img src={asset("generated/types-of-car-paint-protection-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.tertiary)}>Compare · Protection options</span>
                <span style={cardTitle}>Types of Car Paint Protection: Wax, Sealant, Spray Glaze, Ceramic & PPF</span>
                <span style={cardExcerpt}>Compare the types of car paint protection: wax, sealant, spray glaze, spray ceramic, ceramic coating and PPF, by effort, how you renew it and who it suits.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* #12 what-is-spray-ceramic-coating */}
              <Link href={routes.whatIsSprayCeramic} style={cardStyle(color.tertiary)}>
                <img src={asset("generated/what-is-spray-ceramic-coating-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.tertiary)}>Basics · Spray ceramic</span>
                <span style={cardTitle}>What Is Spray Ceramic Coating? How It Works and What It Won't Do</span>
                <span style={cardExcerpt}>What is spray ceramic coating? Learn how ceramic spray works on paint, what it won't do, like fix scratches or stop rock chips, and why the label matters most.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* #15 what-is-car-glaze */}
              <Link href={routes.whatIsCarGlaze} style={cardStyle(color.tertiary)}>
                <img src={asset("generated/what-is-car-glaze-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.tertiary)}>Basics · Car glaze</span>
                <span style={cardTitle}>What Is Car Glaze? Glaze vs Wax vs Sealant, Explained</span>
                <span style={cardExcerpt}>What is car glaze? See how traditional glaze differs from polish, wax and sealant, how glaze differs from ceramic, and what APGO means by a spray glaze.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* #14 ceramic-spray-vs-ceramic-coating */}
              <Link href={routes.sprayVsCoating} style={cardStyle(color.tertiary)}>
                <img src={asset("generated/ceramic-spray-vs-ceramic-coating-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.tertiary)}>Compare · Spray vs liquid</span>
                <span style={cardTitle}>Ceramic Spray vs Ceramic Coating: What's Actually Different?</span>
                <span style={cardExcerpt}>Ceramic spray vs ceramic coating: compare prep load, application window, fixing mistakes and durability expectations, then pick the format that fits your wash.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* #22 does-ceramic-coating-prevent-scratches */}
              <Link href={routes.coatingScratches} style={cardStyle(color.tertiary)}>
                <img src={asset("generated/does-ceramic-coating-prevent-scratches-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.tertiary)}>Basics · Coating limits</span>
                <span style={cardTitle}>Does Ceramic Coating Prevent Scratches? What a Coating Can and Can't Do</span>
                <span style={cardExcerpt}>Does ceramic coating prevent scratches? See which scratches a coating can help with, which it can't, like keys and rock chips, and what really prevents swirls.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* existing: car-wax-vs-spray-ceramic-coating */}
              <Link href={routes.waxVsSprayCoating} style={cardStyle(color.orange)}>
                <img src={asset("generated/car-wax-vs-spray-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Compare · Finish strategies</span>
                <span style={cardTitle}>Car Wax vs Spray Ceramic Coating</span>
                <span style={cardExcerpt}>Compare traditional car wax and spray ceramic coating on time, steps, and how long the finish holds—without another how-to tutorial.</span>
                <GuideButton>Read the comparison →</GuideButton>
              </Link>
              {/* #13 is-ceramic-spray-worth-it */}
              <Link href={routes.isSprayWorthIt} style={cardStyle(color.tertiary)}>
                <img src={asset("generated/is-ceramic-spray-worth-it-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.tertiary)}>Compare · Worth it for you</span>
                <span style={cardTitle}>Is Ceramic Spray Worth It? An Honest Look for Everyday Drivers</span>
                <span style={cardExcerpt}>Is ceramic spray worth it? It depends on how you wash, the time you'll spend after a wash, and what you expect from it. See when it pays off and when it won't.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* existing: diy-ceramic-coating-vs-professional */}
              <Link href={routes.diyVsPro} style={cardStyle(color.orange)}>
                <img src={asset("generated/diy-vs-pro-hero-title.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Compare · Buying decision</span>
                <span style={cardTitle}>DIY Ceramic Coating vs Professional</span>
                <span style={cardExcerpt}>DIY spray coating buys a redoable afternoon at home; a pro shop buys bay time and a longer package. Compare time, cost, and effort before you choose.</span>
                <GuideButton>Read the comparison →</GuideButton>
              </Link>
              {/* #21 how-to-choose-a-ceramic-coating */}
              <Link href={routes.chooseCoatingSpray} style={cardStyle(color.tertiary)}>
                <img src={asset("generated/how-to-choose-a-ceramic-coating-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.tertiary)}>Check · Label checklist</span>
                <span style={cardTitle}>How to Choose a Ceramic Coating Spray: What to Check Before You Buy</span>
                <span style={cardExcerpt}>How to choose a ceramic coating spray: match the label to how you wash. Check wet or dry use, listed surfaces, durability as a ceiling and what's on your paint.</span>
                <GuideButton>Read the guide →</GuideButton>
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
              {/* #24 how-to-prep-car-for-ceramic-spray */}
              <Link href={routes.prepForSpray} style={cardStyle(color.orange)}>
                <img src={asset("generated/how-to-prep-car-for-ceramic-spray-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Prep · Wash, decon, dry</span>
                <span style={cardTitle}>How to Prep Your Car for Ceramic Spray (Wash, Decon, Dry)</span>
                <span style={cardExcerpt}>How to prep car for ceramic spray: wash, check for bonded contamination, decon only if needed, confirm there's no old wax, then dry or leave wet per your label.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* #26 clay-bar-before-ceramic-coating */}
              <Link href={routes.clayBarFirst} style={cardStyle(color.orange)}>
                <img src={asset("generated/clay-bar-before-ceramic-coating-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Prep · Clay bar</span>
                <span style={cardTitle}>Clay Bar Before Ceramic Coating: When a Spray Finish Actually Needs It</span>
                <span style={cardExcerpt}>Clay bar before ceramic coating? Use the bag test to see if your paint needs it, clay safely with plenty of lubricant, and see where iron remover fits.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* #30 exterior-car-detailing-steps */}
              <Link href={routes.detailingSteps} style={cardStyle(color.orange)}>
                <img src={asset("generated/exterior-car-detailing-steps-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Steps · Full exterior order</span>
                <span style={cardTitle}>Exterior Car Detailing Steps: The Right Order From Wheels to Protection</span>
                <span style={cardExcerpt}>Exterior car detailing steps in the right order: wheels first, top-down wash, decontaminate if needed, rinse, dry, inspect, protect, then glass and trim.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* existing: wet-or-dry-application */}
              <Link href={routes.wetOrDry} style={cardStyle(color.orange)}>
                <img src={asset("generated/atomic-layers-macro.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Compare · Choose your routine</span>
                <span style={cardTitle}>APGO paint protection: wet or dry application?</span>
                <span style={cardExcerpt}>Atomic Colored Glaze goes on dry paint. Atomic Glaze Coating goes on wet paint. Compare the application steps and tools before choosing—both routines include a final buff.</span>
                <GuideButton>Compare the two routines →</GuideButton>
              </Link>
              {/* existing: can-i-apply-ceramic-coating-over-wax */}
              <Link href={routes.coatingOverWax} style={cardStyle(color.orange)}>
                <img src={asset("generated/coating-over-wax-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Check · Compatibility</span>
                <span style={cardTitle}>Can I apply ceramic coating over wax?</span>
                <span style={cardExcerpt}>Your paint may already have something on it. Use this checklist to decide whether to spray now or clear the surface first.</span>
                <GuideButton>Read the compatibility guide →</GuideButton>
              </Link>
              {/* #25 how-to-remove-wax-before-ceramic-coating */}
              <Link href={routes.removeWaxFirst} style={cardStyle(color.orange)}>
                <img src={asset("generated/how-to-remove-wax-before-ceramic-coating-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Prep · Wax removal</span>
                <span style={cardTitle}>How to Remove Wax Before Ceramic Coating</span>
                <span style={cardExcerpt}>How to remove wax before ceramic coating or a spray finish: gentle-to-heavy options, how to test first and protect trim, and how to check the wax is gone.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* #28 how-long-to-wait-to-wash-after-ceramic-spray */}
              <Link href={routes.waitToWash} style={cardStyle(color.orange)}>
                <img src={asset("generated/how-long-to-wait-to-wash-after-ceramic-spray-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Timing · First wash</span>
                <span style={cardTitle}>How Long After Ceramic Coating to Wash Your Car: Waiting Out a Fresh Spray</span>
                <span style={cardExcerpt}>How long after ceramic coating to wash car? There's no universal wait, so check your label. What to look for, what to do if it rains, and your first wash.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* existing: how-to-apply-colored-glaze (packshot card) */}
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
              {/* existing: how-to-apply-glaze-coating (packshot card) */}
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
              {/* #32 ceramic-coating-maintenance */}
              <Link href={routes.coatingMaintenance} style={cardStyle(color.dry)}>
                <img src={asset("generated/ceramic-coating-maintenance-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.dry)}>Care · Maintenance routine</span>
                <span style={cardTitle}>Ceramic Coating Maintenance: A Simple Routine That Keeps Spray Coatings Working</span>
                <span style={cardExcerpt}>Ceramic coating maintenance made simple: wash gently, dry the car, clear contamination fast, watch water behavior and gloss, and top up as your label says.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* #33 how-to-wash-a-ceramic-coated-car */}
              <Link href={routes.washCoatedCar} style={cardStyle(color.dry)}>
                <img src={asset("generated/how-to-wash-a-ceramic-coated-car-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.dry)}>Wash · Step by step</span>
                <span style={cardTitle}>How to Wash a Ceramic Coated Car at Home</span>
                <span style={cardExcerpt}>How to wash a ceramic coated car at home: shade and cool paint, a top-down pre-rinse, wheels first, pH-neutral shampoo and two buckets, then a final rinse.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
              {/* existing: after-washing-your-car */}
              <Link href={routes.afterWashing} style={cardStyle(color.tertiary)}>
                <img src={asset("application/d215-step-1.webp")} alt="" style={cardImg} />
                <span style={cardLabel(color.tertiary)}>Basics · Wash & care</span>
                <span style={cardTitle}>What to do after washing your car</span>
                <span style={cardExcerpt}>Learn what to check after rinsing, how to prepare your towels, and when to apply a paint-care product. A straightforward starting point, whether or not you use APGO.</span>
                <GuideButton>Read the wash-care guide →</GuideButton>
              </Link>
              {/* existing: does-an-automatic-car-wash-remove-ceramic-coating */}
              <Link href={routes.autoWashCoating} style={cardStyle(color.orange)}>
                <img src={asset("generated/auto-wash-hero-title.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Wash · Care</span>
                <span style={cardTitle}>Does an Automatic Car Wash Remove Ceramic Coating?</span>
                <span style={cardExcerpt}>An automatic wash rarely strips spray coating in one pass—but brushes, strong soap, and repeat friction wear it down sooner. Compare tunnel risk vs a gentler hand wash.</span>
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
              <Link href={routes.howOftenReapply} style={cardStyle(color.orange)}>
                <img src={asset("generated/how-often-reapply-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Cadence · Reapply signals</span>
                <span style={cardTitle}>How Often to Apply Ceramic Spray Coating</span>
                <span style={cardExcerpt}>Reapply when paint signals fade—not on a fixed month. Treat the label's figure as a ceiling, then watch water beading and gloss.</span>
                <GuideButton>Read the cadence guide →</GuideButton>
              </Link>
              <Link href={routes.rainDamageCoating} style={cardStyle(color.orange)}>
                <img src={asset("generated/rain-salt-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Weather · Care</span>
                <span style={cardTitle}>Does Rain Damage Ceramic Coating?</span>
                <span style={cardExcerpt}>Clean rain rarely ruins a spray coating in one shower—dirty water spots and winter road salt that sit on paint are the real risks. Know what to rinse and when.</span>
                <GuideButton>Read the weather care guide →</GuideButton>
              </Link>
              {/* #45 how-to-wash-your-car-in-winter */}
              <Link href={routes.winterWash} style={cardStyle(color.wet)}>
                <img src={asset("generated/how-to-wash-your-car-in-winter-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.wet)}>Weather · Winter washing</span>
                <span style={cardTitle}>How to Wash Your Car in Winter (Cold, Salt & Freezing Temps)</span>
                <span style={cardExcerpt}>How to wash your car in winter: pick the right day and place, rinse road salt from the low areas first, dry seals and locks, and clear snow without scratching.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
            </div>
          </div>
        </section>

        {/* BY PAINT, VEHICLE & SURFACE */}
        <section id="paint-vehicle-surface" style={{ borderBottom: `1px solid ${color.hairline}` }}>
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
            <h2 style={sectionH2}>By paint, vehicle & surface</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
                gap: "clamp(16px,2vw,24px)",
              }}
            >
              {/* #51 ceramic-coating-on-windshield */}
              <Link href={routes.windshieldCoating} style={cardStyle(color.dry)}>
                <img src={asset("generated/ceramic-coating-on-windshield-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.dry)}>Surface · Glass prep</span>
                <span style={cardTitle}>Can You Use Ceramic Coating on a Windshield? (And How to Prep the Glass)</span>
                <span style={cardExcerpt}>Ceramic coating on windshield glass: check that the label lists glass, remove the oil film first, test a small area, and fix wiper chatter before you drive.</span>
                <GuideButton>Read the guide →</GuideButton>
              </Link>
            </div>
          </div>
        </section>

        {/* TROUBLESHOOTING */}
        <section id="troubleshooting" style={{ borderBottom: `1px solid ${color.hairline}` }}>
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
            <h2 style={sectionH2}>Troubleshooting</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
                gap: "clamp(16px,2vw,24px)",
              }}
            >
              {/* #47 ceramic-spray-streaks-high-spots */}
              <Link href={routes.streaksHighSpots} style={cardStyle(color.orange)}>
                <img src={asset("generated/ceramic-spray-streaks-high-spots-hero.png")} alt="" style={cardImg} />
                <span style={cardLabel(color.orange)}>Fix · Streaks & haze</span>
                <span style={cardTitle}>Ceramic Coating Streaks, Haze or High Spots? How to Fix Them</span>
                <span style={cardExcerpt}>Ceramic coating streaks, haze or high spots after a spray? Learn which problem you have, then fix it from gentle to heavy, starting with a clean re-buff.</span>
                <GuideButton>Read the guide →</GuideButton>
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
