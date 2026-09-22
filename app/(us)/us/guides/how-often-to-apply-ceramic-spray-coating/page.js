import { Fragment } from "react";
import Link from "next/link";
import ArticleHead from "@/components/us/guides/ArticleHead";
import HeroFigure from "@/components/us/guides/HeroFigure";
import ArticleBody from "@/components/us/guides/ArticleBody";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Balance, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "How Often to Apply Ceramic Spray Coating";
const CRUMB = "Reapply cadence";
const LEDE =
  "Reapply ceramic spray coating when paint signals fade—not on a fixed month. Use D204's ~6-month ceiling as a landmark, then watch water beading and gloss.";
const COVER = asset("generated/how-often-reapply-hero.png");
const INLINE_CHECKLIST = asset("generated/how-often-reapply-signals-checklist.png");

export const metadata = {
  title: `${TITLE} · APGO`,
  description: LEDE,
  alternates: { canonical: routes.howOftenReapply },
  openGraph: {
    title: `${TITLE} · APGO`,
    description: LEDE,
    url: routes.howOftenReapply,
    images: [COVER],
  },
};

const TOC = [
  { href: "#label-ceiling", label: "The label ceiling is not your calendar" },
  { href: "#factors", label: "What shortens or stretches the interval" },
  { href: "#signals", label: "Signals it's time to reapply" },
  { href: "#rhythm", label: "A simple reapply rhythm" },
  { href: "#before", label: "Before you spray again" },
  { href: "#bottom-line", label: "Bottom line" },
];

const TABLE = [
  {
    factor: "Wash frequency",
    shortens: "Very frequent washes, especially aggressive cycles",
    stretches: "Gentler, less frequent washing",
  },
  {
    factor: "Wash method / chemistry",
    shortens: "Automatic washes, strong detergents, high pH soaps",
    stretches: "Hand wash with milder, coating-friendly products",
  },
  {
    factor: "Climate",
    shortens: "Hot sun, heavy rain, road salt, coastal air",
    stretches: "Milder weather, less UV and fallout",
  },
  {
    factor: "Parking / storage",
    shortens: "Street parking, uncovered lots",
    stretches: "Garage or covered parking",
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

export default function HowOftenReapplyPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: TITLE, description: LEDE, image: COVER, route: routes.howOftenReapply }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#12151a 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="CADENCE"
          tagColor={color.orange}
          tagLabel="Reapply signals"
          title={TITLE}
          lede={LEDE}
          readTime="4 min read"
        />

        <HeroFigure src={COVER} alt="How often to apply ceramic spray coating" />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            You already protected the paint after a wash. The next question is quieter: when do you do it again?
          </p>
          <p style={body}>
            This guide is about <strong style={strong}>reapply rhythm and surface signals</strong>—not how to spray, and not another
            wax-vs-coating debate. If you are still choosing between traditional wax and a spray coating, start with the{" "}
            <Link href={routes.waxVsSprayCoating} className="us-text-link">comparison guide</Link> first, then come back here for
            cadence.
          </p>

          <section id="label-ceiling" style={section}>
            <h2 style={h2Balance}>The label ceiling is not your calendar</h2>
            <p style={body}>
              Product pages often cite a best-case window. For APGO Atomic Colored Glaze (D204), the U.S. page states wash resistance
              lasting <strong style={strong}>up to about 6 months</strong> under good conditions. That is a ceiling, not an alarm
              clock.
            </p>
            <p style={body}>
              Climate, wash style, and how the paint was prepared all move the real date. Treat "about 6 months" as the upper bound
              you might see when everything goes well—not a fixed day on the calendar you must wait for, or a promise that every car
              will get there.
            </p>
          </section>

          <section id="factors" style={section}>
            <h2 style={h2}>What shortens or stretches the interval</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                overflow: "hidden",
              }}
            >
              <div style={{ ...tableHead, borderTop: `4px solid ${color.tertiary}` }}>Factor</div>
              <div style={{ ...tableHead, borderTop: `4px solid ${color.orange}` }}>Often shortens the interval</div>
              <div style={{ ...tableHead, borderTop: `4px solid ${color.dry}` }}>Often stretches the interval</div>
              {TABLE.map((row, i) => (
                <Fragment key={i}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.factor}</div>
                  <div style={tableCell}>{row.shortens}</div>
                  <div style={tableCell}>{row.stretches}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              None of these replace reading the label. They explain why two drivers using the same dry spray coating can land on
              different reapply months.
            </p>
          </section>

          <section id="signals" style={section}>
            <h2 style={h2Balance}>Signals it's time to reapply</h2>
            <p style={body}>Watch the paint, not only the bottle:</p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Water behavior weakens—beads flatten, sheet oddly, or stop beading like they did after the last application.
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                The finish looks "flatter" sooner after a wash than it used to.
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                Dust and road film seem to cling more; the car looks dirty faster between washes.
              </li>
              <li style={{ ...body, ...bulletItem }}>
                <span style={bulletMarker}>•</span>
                You are approaching the product's stated upper window (for D204, up to about 6 months) <strong style={strong}>and</strong> the
                signals above are showing up.
              </li>
            </ul>
            <p style={body}>
              One dull wash day after rain is not always a crisis. A pattern across several washes usually is.
            </p>

            <figure style={{ margin: "24px 0 0" }}>
              <img
                src={INLINE_CHECKLIST}
                alt="Three reapply signals—weaker beading, flatter gloss, dirt sticks sooner—leading to Reapply or Keep monitoring"
                style={{ display: "block", width: "100%", maxWidth: 680 }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                Follow the paint's signals, not only the month count.
              </figcaption>
            </figure>
          </section>

          <section id="rhythm" style={section}>
            <h2 style={h2}>A simple reapply rhythm</h2>
            <p style={body}>A practical rhythm for most daily drivers:</p>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              <li style={{ ...body, display: "flex", gap: 12 }}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, color: color.orange, flex: "none", width: 24 }}>1</span>
                <span>After a correct application on ready paint, note the date.</span>
              </li>
              <li style={{ ...body, display: "flex", gap: 12 }}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, color: color.orange, flex: "none", width: 24 }}>2</span>
                <span>At each wash, glance at water behavior and how fast the car soils.</span>
              </li>
              <li style={{ ...body, display: "flex", gap: 12 }}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, color: color.orange, flex: "none", width: 24 }}>3</span>
                <span>When signals stack—or you are near the label's upper window and performance has clearly faded—plan a reapply session.</span>
              </li>
              <li style={{ ...body, display: "flex", gap: 12 }}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, color: color.orange, flex: "none", width: 24 }}>4</span>
                <span>Between those points, do not spray "just because" on a schedule that ignores the surface.</span>
              </li>
            </ol>
            <p style={body}>
              For a <strong style={strong}>dry-surface</strong> spray glaze such as D204, reapply still means the panel is clean and
              dry first; the <Link href={routes.coloredGlaze} className="us-text-link">dry-application guide</Link> covers the how. If
              your routine is wet-surface instead, use the <Link href={routes.glazeCoating} className="us-text-link">wet-application guide</Link> for
              that product's steps—this article only sets cadence.
            </p>
          </section>

          <section id="before" style={section}>
            <h2 style={h2}>Before you spray again</h2>
            <p style={body}>
              The surface has to be ready. If old wax or an unknown layer is still on the paint, do not blindly stack a new
              coating—confirm or clear first (see the{" "}
              <Link href={routes.coatingOverWax} className="us-text-link">coating-over-wax checklist</Link>). This piece does not
              re-teach compatibility; it only flags that a reapply on a contaminated base wastes the session.
            </p>
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom line</h2>
            <p style={body}>
              <code style={{ fontSize: 14, background: color.raised, padding: "2px 6px", borderRadius: 4 }}>How often to apply ceramic spray coating</code> is
              answered by the paint in front of you plus the product's upper window—not by a single universal month. Use D204's "up
              to about 6 months" as a ceiling landmark, shorten or stretch with wash and climate reality, and reapply when the
              signals say the last layer is done working.
            </p>
          </section>

          <p style={finePrint}>
            This guide is published by APGO. General paint-care guidance does not replace your vehicle's care instructions or the
            directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["waxVsSprayCoating", "coatingOverWax", "coloredGlaze"]} />
      </main>
    </div>
  );
}
