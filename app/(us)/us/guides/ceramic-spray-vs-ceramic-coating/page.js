import { Fragment } from "react";
import Link from "next/link";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import FaqList from "@/components/us/guides/FaqList";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd, faqLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Balance, h3, h2Faq, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "Ceramic Spray vs Ceramic Coating: What's Different?";
const H1 = "Ceramic Spray vs Ceramic Coating: What's Actually Different?";
const CRUMB = "Ceramic spray vs coating";
const DESCRIPTION = "Ceramic spray vs ceramic coating: compare prep load, application window, fixing mistakes and durability expectations, then pick the format that fits your wash.";
const COVER = asset("generated/ceramic-spray-vs-ceramic-coating-hero.png");
const HERO_ALT = "Hand gliding a microfiber towel over a freshly misted car hood in a home garage";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.sprayVsCoating },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.sprayVsCoating,
    images: [COVER],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [COVER],
  },
};

const FAQ = [
  {
    q: "Is ceramic spray as good as a ceramic coating?",
    a: "They do different jobs. A spray is built for convenience and easy redos, while a liquid coating is built for the longer term according to its label, so choose based on your time and your wash habits.",
  },
  {
    q: "Can I apply a liquid ceramic coating myself?",
    a: "Yes. DIY kits exist, but the prep and leveling are demanding. For help deciding, see DIY vs professional ceramic coating.",
  },
  {
    q: "Can I put a ceramic spray on top of a ceramic coating?",
    a: "Don't assume you can. Check the coating maker's or the installing shop's aftercare instructions first.",
  },
  {
    q: "Which lasts longer, ceramic spray or ceramic coating?",
    a: "Liquid coatings are usually marketed as the longer-term option, but real results depend on the product's label and how you care for the car. This guide doesn't quote year counts.",
  },
  {
    q: "Is APGO's spray glaze a ceramic spray?",
    a: "No. APGO's silicone-based spray glaze is a glaze, not a ceramic product.",
  },
];

const TOC = [
  { href: "#same-or-different", label: "Same as Ceramic Coating?" },
  { href: "#at-a-glance", label: "At a Glance" },
  { href: "#differences", label: "Where They Actually Differ" },
  { href: "#which-fits", label: "Which Fits Your Wash?" },
  { href: "#spray-glaze", label: "Where Spray Glaze Fits" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_COMPARE = [
  {
    factor: "Format",
    spray: "Spray bottle; spray, spread, and buff on wash day",
    liquid: "Small bottle with applicator; worked panel by panel",
  },
  {
    factor: "Prep load",
    spray: "Clean, wax-free paint; full correction usually not required",
    liquid: "Thorough decontamination; many makers recommend paint correction first",
  },
  {
    factor: "Application window",
    spray: "More relaxed; follow the label",
    liquid: "Level and wipe within the label's window",
  },
  {
    factor: "If something goes wrong",
    spray: "Re-wipe, or redo after the next wash",
    liquid: "High spots can be hard to fix once they harden",
  },
  {
    factor: "Durability expectation",
    spray: "Shorter, redoable cycles; check the label",
    liquid: "Often sold as years-scale; check the label",
  },
  {
    factor: "Fits which wash habit",
    spray: "Frequent washers who like a quick routine",
    liquid: "Owners who want a one-time project and a set aftercare routine",
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

const tableCell = { background: color.bg, padding: "12px 16px" };

export default function CeramicSprayVsCoatingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.sprayVsCoating }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
          faqLd(FAQ),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#16120f 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="COMPARE & CHOOSE"
          tagColor={color.orange}
          tagLabel="Formats compared"
          title={H1}
          lede={DESCRIPTION}
          readTime="7 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            Two products sit side by side on the shelf, and both say "ceramic." One is a full-size spray bottle. The other is a small bottle packed with an applicator and cloths. The ceramic spray vs ceramic coating question comes down to that difference in format: how much prep each one needs, how forgiving it is to apply, what happens when something goes wrong, and what you can expect from it over time. This guide compares the products themselves, not who applies them. Liquid coatings come in DIY kits too. If your real question is whether to do the job yourself or book a shop, see <Link href={routes.diyVsPro} className="us-text-link">DIY ceramic coating vs professional</Link>. APGO comes up near the end: it makes a silicone-based spray glaze, not a ceramic coating, and we explain the difference there.
          </p>

          <section id="same-or-different" style={section}>
            <h2 style={h2Balance}>Is Ceramic Spray the Same as Ceramic Coating?</h2>
            <p style={body}>
              Short answer: same family of names, different format, different job. A ceramic spray is a thin layer you can apply quickly after a wash and redo whenever it fades. A liquid ceramic coating asks for more demanding prep and a more careful application, and it's usually marketed as the longer-term option.
            </p>
            <p style={body}>
              If you'd like the full definition of the spray side first, see our guide on <Link href={routes.whatIsSprayCeramic} className="us-text-link">what spray ceramic coating is</Link>.
            </p>
          </section>

          <section id="at-a-glance" style={section}>
            <h2 style={h2Balance}>Ceramic Spray vs Ceramic Coating at a Glance</h2>
            <p style={body}>
              In this guide, "ceramic coating" means a bottled liquid coating, so the comparison is really ceramic spray vs liquid ceramic coating. Both can be DIY products.
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Ceramic spray</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Liquid ceramic coating</span>
              </div>
              {TABLE_COMPARE.map((row) => (
                <Fragment key={row.factor}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.factor}</div>
                  <div style={tableCell}>{row.spray}</div>
                  <div style={tableCell}>{row.liquid}</div>
                </Fragment>
              ))}
            </div>
          </section>

          <section id="differences" style={section}>
            <h2 style={h2Balance}>Where the Two Formats Actually Differ</h2>

            <h3 style={h3}>Prep Load</h3>
            <p style={body}>
              Liquid ceramic coatings usually call for thorough decontamination, and many makers recommend correcting the paint first. The reasoning is simple: a longer-term coating sits over whatever the paint looks like the moment you apply it, swirl marks included.
            </p>
            <p style={body}>
              Ceramic sprays still need clean paint with no old wax or unknown products on it, but they don't usually require full correction. The goal of spray prep is a clean surface and no new marks, not flawless paint.
            </p>

            <h3 style={h3}>Application Window and Leveling</h3>
            <p style={body}>
              With a liquid coating, you typically work one panel at a time and level and wipe off the product within the window its label specifies. Miss that window and you can end up with high spots: raised, uneven patches that catch the light.
            </p>
            <p style={body}>
              A spray follows a looser spray, spread, and buff rhythm. It's more forgiving, but not foolproof. Too much product or a dirty cloth can still leave streaks or haze. If that happens, see our guide to <Link href={routes.streaksHighSpots} className="us-text-link">fixing streaks and high spots</Link>.
            </p>

            <h3 style={h3}>Mistakes and Redos</h3>
            <p style={body}>
              This is where the two formats differ most in practice. Once a high spot from a liquid coating hardens, it can be difficult to correct on your own, and polishing may be the last resort. That's a job to approach carefully, not casually.
            </p>
            <p style={body}>
              A spray is a redoable format. A mistake can usually be re-wiped on the spot, or put right at your next wash when you apply again.
            </p>

            <h3 style={h3}>Durability and Upkeep Expectations</h3>
            <p style={body}>
              Liquid coatings are often sold as years-scale products; check that maker's label for what it actually claims. They usually come with a stated cure period and specific aftercare instructions, and you should follow both.
            </p>
            <p style={body}>
              Sprays assume a shorter, repeatable cycle. Rather than following a fixed calendar, reapply when the paint tells you it's time; our guide on <Link href={routes.howOftenReapply} className="us-text-link">how often to reapply a spray coating</Link> covers the signals. Either way, washing habits and weather shorten the real-world life of both formats, and neither one is permanent.
            </p>
            <p style={body}>
              You'll also see labels like 9H or graphene in this category. Definitions vary from brand to brand, and this guide doesn't compare them.
            </p>
          </section>

          <section id="which-fits" style={section}>
            <h2 style={h2Balance}>Which Format Fits Your Wash Routine?</h2>
            <p style={body}>
              Neither format is better across the board. Ask yourself these questions instead:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>How much prep time will you put in?</strong> If thorough decontamination and possible paint correction sound like too much, a spray is the realistic fit.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Do you want room for mistakes?</strong> A spray lets you redo. A liquid coating rewards getting it right once and then following its aftercare.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>How often, and how, do you wash?</strong> Regular hand washers can keep a spray topped up easily, while frequent trips through an automatic wash tend to wear any protection down faster.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Do you want to do the work at all?</strong> Liquid coatings come in DIY kits, but if you'd rather hand the whole job off, compare <Link href={routes.diyVsPro} className="us-text-link">doing it yourself vs booking a shop</Link>.
              </li>
            </ul>
            <p style={body}>
              If you're still deciding between traditional wax and a spray, start with <Link href={routes.waxVsSprayCoating} className="us-text-link">car wax vs spray ceramic coating</Link> instead.
            </p>
          </section>

          <section id="spray-glaze" style={section}>
            <h2 style={h2Balance}>Where Spray Glaze Fits, and Why It Isn't Ceramic</h2>
            <p style={body}>
              Ceramic products, spray or liquid, are typically marketed on silica-based chemistry. Liquid coatings in particular are usually sold on years-scale durability claims, and both formats come with their own labels for prep and aftercare.
            </p>
            <p style={body}>
              Spray glaze is a separate category. APGO doesn't make a ceramic product; it makes a silicone-based spray glaze. APGO Atomic Colored Glaze (D204) is applied after the car is washed and completely dried, and it lasts up to about 6 months (180 days). APGO Atomic Glaze Coating (D215) goes on after washing and rinsing, while the paint is still wet: you spread it with a damp application cloth, towel-dry the car, then buff with a clean coral-fleece microfiber towel. It lasts up to about 4 months (120 days). Both figures are ceilings, not promises.
            </p>
            <p style={body}>
              If what you want is a redoable finishing step after a wash, and you don't need a ceramic product, take a look at <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link>.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Can I apply a liquid ceramic coating myself?"
                ? <>Yes. DIY kits exist, but the prep and leveling are demanding. For help deciding, see <Link href={routes.diyVsPro} className="us-text-link">DIY vs professional ceramic coating</Link>.</>
                : item.q === "Is APGO's spray glaze a ceramic spray?"
                ? <>No. <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link> is a glaze, not a ceramic product.</>
                : item.a
            }))} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              The difference in ceramic spray vs ceramic coating isn't the name on the bottle. It's the prep load, how forgiving the application is, how you fix mistakes, and what you expect over time. Start with your available time and your wash habits, pick the format that matches, and follow that product's label. For the wider view, see <Link href={routes.paintProtectionTypes} className="us-text-link">all types of car paint protection</Link>.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["diyVsPro", "waxVsSprayCoating", "howOftenReapply"]} />
      </main>
    </div>
  );
}
