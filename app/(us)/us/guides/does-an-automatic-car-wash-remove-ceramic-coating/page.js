import { Fragment } from "react";
import Link from "next/link";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Balance, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "Does an Automatic Car Wash Remove Ceramic Coating?";
const CRUMB = "Auto wash & coating";
const LEDE =
  "An automatic wash rarely strips spray coating in one pass—but brushes, strong soap, and repeat friction wear it down sooner. Compare tunnel risk vs a gentler hand wash.";
const COVER = asset("generated/auto-wash-hero.png");
const INLINE_COMPARE = asset("generated/auto-wash-vs-hand-wash.png");

export const metadata = {
  title: TITLE,
  description: LEDE,
  alternates: { canonical: routes.autoWashCoating },
  openGraph: {
    title: `${TITLE} · APGO`,
    description: LEDE,
    url: routes.autoWashCoating,
    images: [COVER],
  },
};

const TOC = [
  { href: "#what-remove-means", label: 'What "remove" usually means' },
  { href: "#hard-on-coatings", label: "What in an automatic wash is hard on spray coatings" },
  { href: "#auto-vs-hand", label: "Automatic wash vs gentler hand wash" },
  { href: "#coating-safe-claims", label: 'Strong soaps and "coating-safe" claims' },
  { href: "#after-tunnel", label: "If you already used a tunnel wash" },
  { href: "#bottom-line", label: "Bottom line" },
];

const TABLE = [
  {
    row: "Contact",
    auto: "Brushes or cloth rollers on paint",
    hand: "Controlled mitt / towel contact",
  },
  {
    row: "Chemistry",
    auto: "Often stronger, shared soap systems",
    hand: "You choose a milder, coating-friendlier soap",
  },
  {
    row: "Wear pattern",
    auto: "Frequent visits accelerate fade",
    hand: "Easier to keep pressure and product mild",
  },
  {
    row: "Best when",
    auto: "Convenience matters more than max longevity",
    hand: "You want the coating to last closer to its upper window",
  },
];

const tableHead = {
  background: color.raised,
  padding: "10px 14px",
  fontSize: 11,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: color.quiet2,
  fontWeight: 700,
  textAlign: "left",
  borderBottom: `1px solid ${color.hairline}`,
};

const tableCell = {
  background: color.bg,
  padding: "14px",
  fontSize: 15,
  lineHeight: 1.45,
  color: color.secondary,
  borderBottom: `1px solid ${color.hairline}`,
  verticalAlign: "top",
};

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

export default function AutoWashCoatingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: TITLE, description: LEDE, image: COVER, route: routes.autoWashCoating }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#12151a 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="WASH"
          tagColor={color.orange}
          tagLabel="Care"
          title={TITLE}
          lede={LEDE}
          readTime="4 min read"
          heroSrc={COVER}
          heroAlt="Automatic wash wears coating faster—brushes, strong soap, repeat friction"
          heroCaption="Automatic wash wears faster"
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            You left the tunnel wash and the water doesn't bead like it did last week. The worry writes itself:{" "}
            <strong style={strong}>does an automatic car wash remove ceramic coating?</strong>
          </p>
          <p style={body}>
            This guide is about wash risk and gentler alternatives—not how to apply a spray coating, and not another
            wax-vs-spray debate. If you are still choosing a protection style, skim the{" "}
            <Link href={routes.waxVsSprayCoating} className="us-text-link">comparison guide</Link> first; then come back for
            wash habits.
          </p>

          <section id="what-remove-means" style={section}>
            <h2 style={h2Balance}>What "remove" usually means</h2>
            <p style={body}>
              Most of the time, an automatic wash does not strip a spray coating down to bare clear coat in one pass. What
              drivers notice is earlier fade: weaker beading, a flatter look after drying, dirt that sticks sooner.
            </p>
            <p style={body}>
              So "remove" in search language usually means <strong style={strong}>wear it down faster</strong>—not a
              guaranteed one-wash wipeout. Scare headlines help clicks; they do not match how most daily-driver finishes
              fail.
            </p>
          </section>

          <section id="hard-on-coatings" style={section}>
            <h2 style={h2Balance}>What in an automatic wash is hard on spray coatings</h2>
            <p style={body}>
              Three parts of a tunnel or rollover wash tend to stress a spray ceramic / glaze coating:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                <strong style={strong}>Brush or cloth contact</strong> — soft or hard media dragging across paint adds
                friction every visit.
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                <strong style={strong}>Strong detergents</strong> — high-pH or heavy-duty soaps can strip oils and weaken
                sacrificial protection faster than a mild hand-wash soap.
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                <strong style={strong}>Pressure plus repetition</strong> — high-pressure jets and frequent visits stack
                wear even when a single wash looks fine.
              </li>
            </ul>
            <p style={body}>
              This is a risk map, not a car-wash how-to. The point is knowing what you are trading for convenience.
            </p>
          </section>

          <section id="auto-vs-hand" style={section}>
            <h2 style={h2}>Automatic wash vs gentler hand wash</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr 1fr",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                overflow: "hidden",
              }}
            >
              <div style={{ ...tableHead, borderTop: `4px solid ${color.tertiary}` }}></div>
              <div style={{ ...tableHead, borderTop: `4px solid ${color.orange}` }}>Typical automatic / tunnel wash</div>
              <div style={{ ...tableHead, borderTop: `4px solid ${color.dry}` }}>Gentler hand wash</div>
              {TABLE.map((row, i) => (
                <Fragment key={i}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.row}</div>
                  <div style={tableCell}>{row.auto}</div>
                  <div style={tableCell}>{row.hand}</div>
                </Fragment>
              ))}
            </div>

            <figure style={{ margin: "24px 0 0" }}>
              <img
                src={INLINE_COMPARE}
                alt="Automatic wash risk vs gentler hand wash—two-block comparison"
                style={{ display: "block", width: "100%", maxWidth: 680 }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                Convenience costs longevity—choose on purpose.
              </figcaption>
            </figure>
          </section>

          <section id="coating-safe-claims" style={section}>
            <h2 style={h2Balance}>Strong soaps and "coating-safe" claims</h2>
            <p style={body}>
              A harsh soap can shorten how long a spray coating looks and behaves "fresh," whether you wash by hand or in
              a tunnel. Milder, neutral-leaning soaps are the safer default when you care about upkeep.
            </p>
            <p style={body}>
              Ignore vague "coating-safe" badges that cite no brand or test. Read the soap label, and when unsure, pick
              the gentler option—or ask the product maker. This article does not invent certifications.
            </p>
          </section>

          <section id="after-tunnel" style={section}>
            <h2 style={h2}>If you already used a tunnel wash</h2>
            <p style={body}>
              Check the paint over the next few washes: beading, how fast it soils, whether the finish looks flatter
              sooner. If those signals stack, you may need to reapply sooner—see{" "}
              <Link href={routes.howOftenReapply} className="us-text-link">how often to reapply</Link>. When you do
              reapply, the surface still has to be ready; do not stack over old wax or mystery layers.
            </p>
            <p style={body}>
              One aggressive wash is not a crisis by itself. A habit of aggressive washes usually is.
            </p>
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom line</h2>
            <p style={body}>
              An automatic car wash does not always "remove" a ceramic spray coating in one go—but brushes, strong soap,
              and repeat friction often wear it down sooner. If longevity matters, prefer a gentle hand wash and milder
              chemistry; use the tunnel when convenience wins, and watch the paint's signals afterward.
            </p>
          </section>

          <p style={finePrint}>
            This guide is published by APGO. General paint-care guidance does not replace your vehicle's care instructions
            or the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["afterWashing", "rainDamageCoating", "howOftenReapply"]} />
      </main>
    </div>
  );
}
