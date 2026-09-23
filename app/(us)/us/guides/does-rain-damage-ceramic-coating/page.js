import { Fragment } from "react";
import Link from "next/link";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Balance, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "Does Rain Damage Ceramic Coating?";
const CRUMB = "Rain & coating";
const LEDE =
  "Clean rain rarely ruins a spray coating in one shower—dirty water spots and winter road salt that sit on paint are the real risks. Know what to rinse and when.";
const INLINE_COMPARE = asset("generated/rain-vs-salt-spots.png");

export const metadata = {
  title: `${TITLE} · APGO`,
  description: LEDE,
  alternates: { canonical: routes.rainDamageCoating },
  openGraph: {
    title: `${TITLE} · APGO`,
    description: LEDE,
    url: routes.rainDamageCoating,
  },
};

const TOC = [
  { href: "#what-rain-alone", label: "What rain alone usually does" },
  { href: "#rain-vs-spots-salt", label: "Rain vs dirty water spots vs road salt" },
  { href: "#winter-road-salt", label: "Winter and road salt" },
  { href: "#after-rain-salt", label: "What to do after rain or salt exposure" },
  { href: "#bottom-line", label: "Bottom line" },
];

const TABLE = [
  {
    row: "Clean rain alone",
    what: "Water with little soil",
    risk: "Usually low for a single event",
    takeaway: "Dry and check; don't panic after one shower",
  },
  {
    row: "Dirty water / water spots",
    what: "Minerals, fallout, dried rings",
    risk: "Medium—spots etch look and weaken \"fresh\" beading if left on",
    takeaway: "Rinse or wash before spots bake on",
  },
  {
    row: "Road salt / brine",
    what: "Winter salt and salty film that sits",
    risk: "Higher when it stays on paint",
    takeaway: "Rinse salt off soon; don't leave brine to dry",
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

export default function RainDamageCoatingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: TITLE, description: LEDE, route: routes.rainDamageCoating }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#12151a 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="WEATHER"
          tagColor={color.orange}
          tagLabel="Care"
          title={TITLE}
          lede={LEDE}
          readTime="4 min read"
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            A storm rolls through and the first worry is simple:{" "}
            <strong style={strong}>does rain damage ceramic coating?</strong>
          </p>
          <p style={body}>
            This guide covers rain, dirty water spots, and winter road salt—seasonal and road-condition risk, not how
            to spray a coating and not another automatic-wash debate. Wash-method risk lives in the{" "}
            <Link href={routes.autoWashCoating} className="us-text-link">automatic car wash guide</Link>; start here
            for weather and salt.
          </p>

          <section id="what-rain-alone" style={section}>
            <h2 style={h2Balance}>What rain alone usually does</h2>
            <p style={body}>
              Clean rain by itself rarely "wipes off" a spray ceramic / glaze coating in one shower. What hurts the
              look and the water behavior is what the water leaves behind: mineral spots, dirty film, acidic fallout,
              and spots that bake on in the sun.
            </p>
            <p style={body}>
              So the useful answer is not "rain always destroys coatings." It is:{" "}
              <strong style={strong}>rain plus residue and heat</strong> is what drivers actually see as damage.
            </p>
          </section>

          <section id="rain-vs-spots-salt" style={section}>
            <h2 style={h2}>Rain vs dirty water spots vs road salt</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr 1fr 1fr",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                overflow: "hidden",
              }}
            >
              <div style={{ ...tableHead, borderTop: `4px solid ${color.tertiary}` }}></div>
              <div style={{ ...tableHead, borderTop: `4px solid ${color.tertiary}` }}>What it is</div>
              <div style={{ ...tableHead, borderTop: `4px solid ${color.orange}` }}>Risk to a spray coating</div>
              <div style={{ ...tableHead, borderTop: `4px solid ${color.dry}` }}>Practical takeaway</div>
              {TABLE.map((row, i) => (
                <Fragment key={i}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.row}</div>
                  <div style={tableCell}>{row.what}</div>
                  <div style={tableCell}>{row.risk}</div>
                  <div style={tableCell}>{row.takeaway}</div>
                </Fragment>
              ))}
            </div>

            <figure style={{ margin: "24px 0 0" }}>
              <img
                src={INLINE_COMPARE}
                alt="Rain alone vs road salt / dirty water spots—two-block risk comparison"
                style={{ display: "block", width: "100%", maxWidth: 680 }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                Rain isn't the enemy—what it leaves behind is.
              </figcaption>
            </figure>
          </section>

          <section id="winter-road-salt" style={section}>
            <h2 style={h2}>Winter and road salt</h2>
            <p style={body}>
              Road salt and salty brine are harder on finishes than a clean summer shower. Salt that sits on paint
              holds moisture and contaminants against the clear coat and any spray protection on top. The longer it
              stays, the more likely you see dulling, spotting, and earlier fade in water behavior.
            </p>
            <p style={body}>
              After driving on treated roads, rinse the salt film off when you can—especially wheel arches, lower
              panels, and the rear. You do not need a full detailing tutorial here; the goal is simple:{" "}
              <strong style={strong}>don't let salt dry and sit.</strong>
            </p>
          </section>

          <section id="after-rain-salt" style={section}>
            <h2 style={h2}>What to do after rain or salt exposure</h2>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
              <li style={{ ...body, display: "flex", gap: 12 }}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, color: color.orange, flex: "none", width: 24 }}>1</span>
                <span>Rinse or wash off dirt, minerals, and salt before they bake on.</span>
              </li>
              <li style={{ ...body, display: "flex", gap: 12 }}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, color: color.orange, flex: "none", width: 24 }}>2</span>
                <span>Dry with clean towels so new spots don't form from standing water.</span>
              </li>
              <li style={{ ...body, display: "flex", gap: 12 }}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, color: color.orange, flex: "none", width: 24 }}>3</span>
                <span>
                  Watch beading and how fast the car soils over the next washes. If signals stack and performance has
                  clearly faded, plan a reapply—see{" "}
                  <Link href={routes.howOftenReapply} className="us-text-link">how often to reapply</Link>. Climate
                  and salt exposure can shorten the interval; this article does not rewrite that full cadence guide.
                </span>
              </li>
            </ol>
            <p style={body}>
              If old wax or an unknown layer is still on the paint, clear or confirm before you spray again—compatibility
              is covered elsewhere.
            </p>
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom line</h2>
            <p style={body}>
              Rain alone usually does not ruin a ceramic spray coating in one go. Dirty water spots and winter road
              salt that sit on the paint are the real seasonal risks. Rinse what the weather leaves behind, and pair
              this with the automatic-wash guide if your other risk is how you clean the car.
            </p>
          </section>

          <p style={finePrint}>
            This guide is published by APGO. General paint-care guidance does not replace your vehicle's care instructions
            or the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["autoWashCoating", "howOftenReapply", "waxVsSprayCoating"]} />
      </main>
    </div>
  );
}
