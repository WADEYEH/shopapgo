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

const TITLE = "Car Wax vs Spray Ceramic Coating: Which Finish Is Worth Your Time?";
const CRUMB = "Wax vs spray coating";
const LEDE =
  "Compare traditional car wax and spray ceramic coating on time, steps, and how long the finish holds—without another how-to tutorial.";
const COVER = asset("generated/car-wax-vs-spray-hero.png");
const INLINE_COMPARISON = asset("generated/wax-vs-spray-coating-time-steps.png");

export const metadata = {
  title: `${TITLE} · APGO`,
  description: LEDE,
  alternates: { canonical: routes.waxVsSprayCoating },
  openGraph: {
    title: `${TITLE} · APGO`,
    description: LEDE,
    url: routes.waxVsSprayCoating,
    images: [COVER],
  },
};

const TOC = [
  { href: "#comparing", label: "What you're actually comparing" },
  { href: "#time-steps", label: "Time and steps" },
  { href: "#longevity", label: "How long it lasts" },
  { href: "#after", label: "What you get after" },
  { href: "#when-wins", label: "When wax still wins vs when spray coating wins" },
  { href: "#bottom-line", label: "Bottom line" },
];

const COMPARE = [
  ["Typical session shape", "Apply → wait/haze → buff (often multi-pass)", "Spray → spread → towel finish"],
  ["Time pressure", "Cure/haze windows matter", "No long wait between apply and finish"],
  ["Best fit", "When you want a dedicated detailing block", "When you want protection after a wash without a second project"],
  ["Main tradeoff", "More control, more labor", "Less labor, less ritual"],
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

export default function WaxVsSprayCoatingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: TITLE, description: LEDE, image: COVER, route: routes.waxVsSprayCoating }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#12151a 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="COMPARE"
          tagColor={color.orange}
          tagLabel="Finish strategies"
          title={TITLE}
          lede={LEDE}
          readTime="5 min read"
        />

        <HeroFigure src={COVER} alt="Car wax vs spray ceramic coating comparison" />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            You washed the car. The paint looks clean. Now comes the usual fork in the road: spend the afternoon with traditional wax,
            or finish with a spray ceramic / glaze coating and get on with your day.
          </p>
          <p style={body}>
            This guide compares those two paths on what actually changes your Saturday—time, steps, and how long the finish tends to
            hold. It is not a product-application tutorial, and it is not a roundup of every paint-protection option on the market.
          </p>

          <section id="comparing" style={section}>
            <h2 style={h2Balance}>What you're actually comparing</h2>
            <p style={body}>
              <strong style={strong}>Traditional car wax</strong> usually means paste or liquid wax. You work product onto clean, dry
              paint, wait for it to haze or cure per the label, then buff it off—often panel by panel, sometimes with more than one
              pass.
            </p>
            <p style={body}>
              <strong style={strong}>Spray ceramic / glaze coating</strong> (in this article, a dry-surface spray finish such as APGO
              Atomic Colored Glaze D204) is a thin spray you spread and towel-finish on clean, dry paint. The point of the comparison
              is the workflow and upkeep, not the chemistry jargon on the bottle.
            </p>
            <p style={body}>
              If you came here looking for wet-vs-dry product choice or a how-to for one SKU, that already lives in APGO's other
              guides. Stay here for wax vs spray coating as finish strategies.
            </p>
          </section>

          <section id="time-steps" style={section}>
            <h2 style={h2}>Time and steps</h2>
            <p style={body}>This is where most people feel the difference.</p>
            <p style={body}>
              Traditional wax asks for a longer block of uninterrupted time: apply, wait, buff, and often repeat around the car. Miss
              a window or rush the haze, and you spend more time correcting swirls or leftover residue.
            </p>
            <p style={body}>
              A dry spray coating compresses the same "protect the paint" intent into a shorter cycle: spray a panel, spread, wipe
              with a clean microfiber, move on. You still need shade, clean paint, and clean towels—but you are not building an
              afternoon around cure timers.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                fontSize: 15,
                lineHeight: 1.4,
              }}
            >
              <div style={tableHead(color.tertiary)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Traditional wax</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Dry spray coating (e.g. D204)</span>
              </div>
              {COMPARE.map(([label, wax, spray]) => (
                <Fragment key={label}>
                  <div style={tableRowLabel}>{label}</div>
                  <div style={tableCell}>{wax}</div>
                  <div style={tableCell}>{spray}</div>
                </Fragment>
              ))}
            </div>
            <figure style={{ margin: 0 }}>
              <img
                src={INLINE_COMPARISON}
                alt="Side-by-side comparison: Traditional wax (Apply, Wait/haze, Buff, Often re-pass) vs Dry spray coating (Spray, Spread, Towel)"
                style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "contain", background: color.raised }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                Same goal — protected paint. Different Saturday.
              </figcaption>
            </figure>
          </section>

          <section id="longevity" style={section}>
            <h2 style={h2}>How long it lasts</h2>
            <p style={body}>
              Longevity depends on wash habits, climate, and how the paint was prepared. Treat any single number as a ceiling under
              good conditions, not a guarantee.
            </p>
            <p style={body}>
              For a dry-surface spray glaze like <strong style={strong}>APGO Atomic Colored Glaze (D204)</strong>, the U.S. product
              page states wash resistance lasting <strong style={strong}>up to about 6 months</strong>. That is the only specific
              duration we cite here.
            </p>
            <p style={body}>
              Traditional wax is different: many drivers find they need to reapply more often to keep the same look and water
              behavior. Exact month counts vary widely by wax type and use, so this article does not invent a wax "expires in X
              months" figure. The practical takeaway is simple—wax usually asks for more frequent touch-ups; a longer-lasting spray
              coating reduces how often you reopen the project.
            </p>
          </section>

          <section id="after" style={section}>
            <h2 style={h2}>What you get after</h2>
            <p style={body}>
              Both approaches can leave paint looking richer and water beading more cleanly than bare clear coat. The everyday
              difference is less "which one can shine" and more "how often you have to chase that look again."
            </p>
            <p style={body}>
              After wax, you often notice a classic warm glow and water behavior that fades as the wax wears—so the calendar fills
              with re-wax days. After a durable spray coating, the finish tends to stay "done" longer between maintenance sessions,
              which is why people shopping <code style={{ fontSize: 14, background: color.raised, padding: "2px 6px", borderRadius: 4 }}>car wax vs spray ceramic coating</code> care
              about upkeep as much as first-day gloss.
            </p>
            <p style={body}>
              Skip the brochure language. Ask yourself: do you want the ritual of waxing, or do you want the wash-and-finish rhythm
              with fewer return trips?
            </p>
          </section>

          <section id="when-wins" style={section}>
            <h2 style={h2Balance}>When wax still wins vs when spray coating wins</h2>
            <p style={body}>
              <strong style={strong}>Wax still wins when</strong> you enjoy detailing as a hobby, you want maximum hands-on control
              over a paste or liquid product, or you are fine scheduling longer sessions and more frequent reapplication.
            </p>
            <p style={body}>
              <strong style={strong}>Spray coating wins when</strong> your constraint is time: you already washed and dried the car,
              you want protection without a second project, and you'd rather stretch the interval before the next full protection
              session. A dry spray glaze such as D204 is one example of that path—not the only spray on the market, but a clear
              instance of "finish after drying" without traditional wax labor.
            </p>
            <p style={body}>Neither choice replaces washing, drying, or reading the label for surfaces the product is approved for.</p>
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom line</h2>
            <p style={body}>
              The real gap between traditional car wax and a spray ceramic / glaze coating is rarely a single lab claim. It is whether
              your finish care eats an afternoon—or fits into the end of a normal wash. If you are weighing{" "}
              <code style={{ fontSize: 14, background: color.raised, padding: "2px 6px", borderRadius: 4 }}>car wax vs spray ceramic coating</code> because
              weekends are short, compare labor and reapply cadence first; the shine usually follows either path when the paint
              underneath is clean.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General paint-care guidance does not replace your vehicle's care instructions or the
            directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["coloredGlaze", "wetOrDry", "afterWashing"]} />
      </main>
    </div>
  );
}
