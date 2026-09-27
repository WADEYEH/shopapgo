import { Fragment } from "react";
import Link from "next/link";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Balance, section, lead, body, strong } from "@/components/us/guides/styles";

const TITLE = "DIY Ceramic Coating vs Professional";
const H1 = "DIY Ceramic Coating vs Professional: What’s Actually Worth It?";
const CRUMB = "DIY vs pro coating";
const LEDE =
  "DIY spray coating buys a redoable afternoon at home; a pro shop buys bay time and a longer package. Compare time, cost, and effort before you choose.";
const HERO = asset("generated/diy-vs-pro-hero.png");
const HERO_TITLE = asset("generated/diy-vs-pro-hero-title.png");
const HERO_ALT = "Clean dark car paint with a microfiber towel in a home garage at dusk, with a professional detailing bay lit up in the distance";
const INLINE_IMAGE = asset("generated/diy-afternoon-vs-pro-bay.png");

export const metadata = {
  title: TITLE,
  description: LEDE,
  alternates: { canonical: routes.diyVsPro },
  openGraph: {
    title: H1,
    description: LEDE,
    url: routes.diyVsPro,
    images: [HERO_TITLE],
  },
};

const TOC = [
  { href: "#comparing", label: "What you’re comparing" },
  { href: "#time-cost-effort", label: "Time, cost, and effort" },
  { href: "#how-long", label: "How long each path usually lasts" },
  { href: "#who-fits", label: "Who DIY spray is for vs who should go pro" },
  { href: "#diy-requires", label: "What DIY still requires" },
  { href: "#bottom-line", label: "Bottom line" },
];

const TABLE1 = [
  {
    path: "DIY spray ceramic / glaze",
    means: "A consumer spray you apply after a wash day (example: APGO Atomic Colored Glaze, D204, on clean, dry paint)",
    treats: "Convenience you can repeat on your own schedule",
  },
  {
    path: "Professional ceramic coating",
    means: "A shop service with prep, application, and often a package with longer-term expectations",
    treats: "Paid labor, bay time, and a longer care relationship",
  },
];

const TABLE2 = [
  {
    factor: "Calendar time",
    diy: "Often one focused afternoon after washing and drying",
    pro: "An appointment plus drop-off or waiting; can run from hours to a multi-day slot",
  },
  {
    factor: "Labor",
    diy: "You wash, prep, spray, spread, and buff",
    pro: "The shop handles prep and application",
  },
  {
    factor: "Cost scale",
    diy: "A consumer bottle plus towels (see current retailer pricing)",
    pro: "A shop package, typically a much higher ticket than a DIY bottle; ask for a written quote",
  },
  {
    factor: "Redos",
    diy: "You can reapply when performance fades",
    pro: "Usually a shop revisit or add-on plan, not a quick garage spray",
  },
  {
    factor: "Control",
    diy: "Full control of timing",
    pro: "Depends on the shop’s calendar and package rules",
  },
];

const tableHead = (accent) => ({
  background: color.bg,
  padding: "14px 16px",
  borderTop: `4px solid ${accent}`,
  display: "flex",
  flexDirection: "column",
  gap: 2,
});

const tableRowLabel = {
  gridColumn: "1 / -1",
  background: color.raised,
  padding: "8px 16px",
  fontSize: 11,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: color.quiet2,
};

const tableCell = { background: color.bg, padding: "12px 16px" };

const bulletItem = {
  margin: 0,
  padding: "0 0 0 20px",
  position: "relative",
};

const bulletMarker = {
  position: "absolute",
  left: 0,
  color: color.orange,
};

export default function DiyVsProPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: LEDE, image: HERO_TITLE, route: routes.diyVsPro }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#16120f 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="COMPARE"
          tagColor={color.orange}
          tagLabel="Buying decision"
          title={H1}
          lede={LEDE}
          readTime="6 min read"
          heroSrc={HERO}
          heroAlt={HERO_ALT}
          heroOverlayTitle
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            You are not choosing a chemistry lecture. You are choosing a path: a garage DIY spray ceramic (or glaze) you can redo yourself, versus a pro shop ceramic coating job you book and leave to the bay.
          </p>
          <p style={body}>
            This guide compares time, cost scale, durability expectations, and who each path fits. It is not a how-to-spray guide. If you are still deciding between traditional wax and spray coating as finish strategies, start with our <Link href={routes.waxVsSprayCoating} className="us-text-link">car wax vs spray ceramic coating</Link> guide, then come back to the DIY-versus-pro decision.
          </p>

          <section id="comparing" style={section}>
            <h2 style={h2Balance}>What you’re comparing</h2>
            <p style={body}>There are two different routes to paint protection:</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                fontSize: 15,
                lineHeight: 1.4,
                overflow: "auto",
              }}
            >
              <div style={tableHead(color.tertiary)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Path</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>What it usually means</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>What this article treats it as</span>
              </div>
              {TABLE1.map((row) => (
                <Fragment key={row.path}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.path}</div>
                  <div style={tableCell}>{row.means}</div>
                  <div style={tableCell}>{row.treats}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              We are comparing paths, not writing a white paper. Product labels, shop quotes, and APGO support still beat any generic “DIY is always enough” or “pro is always required” claim.
            </p>
          </section>

          <section id="time-cost-effort" style={section}>
            <h2 style={h2}>Time, cost, and effort</h2>
            <p style={body}>
              Think in orders of magnitude, not invented price tags. Shop packages vary widely by market, paint condition, and package tier. DIY cost is mostly the product plus your afternoon.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                fontSize: 15,
                lineHeight: 1.4,
                overflow: "auto",
              }}
            >
              <div style={tableHead(color.tertiary)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Factor</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>DIY spray ceramic / glaze</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Professional shop ceramic</span>
              </div>
              {TABLE2.map((row) => (
                <Fragment key={row.factor}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.factor}</div>
                  <div style={tableCell}>{row.diy}</div>
                  <div style={tableCell}>{row.pro}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              If your real constraint is “I need protection before next week and I can spend a Saturday,” DIY spray is usually the reachable path. If your constraint is “I want the shop to own prep and a longer service relationship,” pro is what you are shopping for, not a different spray bottle with a fancier name.
            </p>
            <figure style={{ margin: 0 }}>
              <img
                src={INLINE_IMAGE}
                alt="Side-by-side comparison: a DIY spray afternoon in a home garage versus a car in a brightly lit professional detailing bay"
                style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "contain", background: color.raised }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                DIY buys a redoable afternoon. Pro buys bay time and a longer package.
              </figcaption>
            </figure>
          </section>

          <section id="how-long" style={section}>
            <h2 style={h2Balance}>How long each path usually lasts</h2>
            <p style={body}>
              Durability is where DIY and pro marketing tend to talk past each other, so keep the claims honest.
            </p>
            <p style={body}>
              <strong style={strong}>DIY spray / glaze (example: D204).</strong> The U.S. product page says Atomic Colored Glaze lasts up to about 6 months. Treat that as a ceiling, not a promise that every car reaches six months regardless of how it is washed or stored. When water beading and gloss fade, reassess; our guide on <Link href={routes.howOftenReapply} className="us-text-link">how often to apply ceramic spray coating</Link> covers the signals to watch.
            </p>
            <p style={body}>
              <strong style={strong}>Professional shop ceramic.</strong> Shop coatings are usually sold on a years-scale expectation that depends on the package, the paint prep, and how you maintain the car afterward. This article does not quote a specific year count; ask the shop what the package includes and what maintenance it requires.
            </p>
            <p style={body}>
              Neither path is permanent. DIY expects more frequent redos. Pro usually means fewer visits, a higher first ticket, and clearer aftercare rules.
            </p>
          </section>

          <section id="who-fits" style={section}>
            <h2 style={h2Balance}>Who DIY spray is for vs who should go pro</h2>
            <p style={body}>Use this as a decision list.</p>
            <p style={body}>
              <strong style={strong}>DIY spray ceramic / glaze tends to fit when you:</strong>
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Can wash and fully dry the car, then spend a focused block of time working in the shade
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Want a finish you can refresh yourself when performance fades
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Are comfortable with month-scale durability (for D204, treat about 6 months as the upper landmark, then watch the paint)
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Prefer controlling the schedule over booking a bay
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Already know what is on the paint, or will clear unknowns before spraying
              </li>
            </ul>
            <p style={body}>
              <strong style={strong}>A professional ceramic job tends to fit when you:</strong>
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Want the shop to handle paint correction or prep you will not do at home
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Are buying a longer service package and aftercare relationship, not just a bottle
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Need documentation, warranties, or package terms that only a shop offers
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Do not have the time or tools for careful DIY prep and reapplication
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Prefer one planned visit over learning a garage routine
              </li>
            </ul>
            <p style={body}>
              If you want someone else to own the hard prep, go pro. If you want something you can redo on a free afternoon, DIY spray is the category to evaluate; then follow the current label for the bottle you buy.
            </p>
          </section>

          <section id="diy-requires" style={section}>
            <h2 style={h2}>What DIY still requires</h2>
            <p style={body}>
              Choosing DIY does not remove prep. Clean, compatible paint still comes first. If wax, an old coating, or an unknown film is on the paint, resolve that before you spray. Our <Link href={routes.coatingOverWax} className="us-text-link">coating-over-wax checklist</Link> covers that decision, so this article will not repeat it.
            </p>
            <p style={body}>
              Aftercare is part of the path too. How you wash matters: brushes and strong soap wear a spray coating down sooner, as explained in <Link href={routes.autoWashCoating} className="us-text-link">does an automatic car wash remove ceramic coating</Link>. Weather matters as well; dirty water spots and road salt left on paint are covered in <Link href={routes.rainDamageCoating} className="us-text-link">does rain damage ceramic coating</Link>. Reapply when those wear signals show rather than on a blind calendar, using the <Link href={routes.howOftenReapply} className="us-text-link">how-often guide</Link>. For the actual application steps on dry paint, use the <Link href={routes.coloredGlaze} className="us-text-link">dry-application guide</Link>.
            </p>
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom line</h2>
            <p style={body}>
              DIY versus professional ceramic coating is a purchase decision between redoable convenience and paid bay labor with a longer package. DIY spray, with D204 as one dry-surface example rated up to about six months on the U.S. product page, fits drivers who will prep honestly and refresh when the finish fades. Pro fits drivers who want to buy prep, time, and a years-scale package, based on a written shop quote.
            </p>
            <p style={body}>
              Pick the path that matches your calendar and your patience for redos, then follow the product label or the shop’s written package terms.
            </p>
          </section>
        </ArticleBody>

        <RelatedGuides items={["waxVsSprayCoating", "howOftenReapply", "coatingOverWax"]} />
      </main>
    </div>
  );
}
