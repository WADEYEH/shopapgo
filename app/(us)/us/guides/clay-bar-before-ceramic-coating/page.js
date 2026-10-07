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

const TITLE = "Clay Bar Before Ceramic Coating: When It's Needed";
const H1 = "Clay Bar Before Ceramic Coating: When a Spray Finish Actually Needs It";
const CRUMB = "Clay bar before coating";
const DESCRIPTION = "Clay bar before ceramic coating? Use the bag test to see if your paint needs it, clay safely with plenty of lubricant, and see where iron remover fits.";
const COVER = asset("generated/clay-bar-before-ceramic-coating-hero.png");
const HERO_ALT = "Hand in a thin plastic bag feeling a freshly washed car hood for roughness";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.clayBarFirst },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.clayBarFirst,
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
    q: "Do I need to clay bar before ceramic spray?",
    a: "Usually only if the paint still feels rough after washing. If it's smooth, skip it.",
  },
  {
    q: "Should I use a clay bar before or after iron remover?",
    a: "Usually after: wash, use iron remover if needed, then clay, then wash or rinse again.",
  },
  {
    q: "Can clay scratch my paint?",
    a: "It can leave light haze if you press hard, use too little lubricant, or keep using a bar that's been dropped.",
  },
  {
    q: "Does claying remove wax?",
    a: "It can take existing wax or protection with it, so plan to reapply protection afterward.",
  },
  {
    q: "How often should I clay my car?",
    a: "Only when the bag test says the paint feels rough again. It isn't an every-wash step.",
  },
];

const TOC = [
  { href: "#do-i-need", label: "Do I Need to Clay?" },
  { href: "#bag-test", label: "The Bag Test" },
  { href: "#how-to-clay", label: "How to Use a Clay Bar" },
  { href: "#iron-remover", label: "Before or After Iron Remover?" },
  { href: "#after-clay", label: "After Clay" },
  { href: "#apgo", label: "APGO's Spray Glaze After Clay" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_TOOLS = [
  { tool: "Clay bar", bestFor: "Control and feel on small or heavily contaminated areas", watchOut: "Needs kneading to a clean face; ruined if dropped" },
  { tool: "Clay mitt", bestFor: "Covering large areas quickly", watchOut: "Can be less forgiving if you press hard; rinse it often" },
  { tool: "Clay towel", bestFor: "Fast work on panels with light contamination", watchOut: "Keep it well lubricated and rinse it often" },
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
const tableHeadText = { fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" };

const bulletList = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 };
const bulletItem = { ...body, margin: 0, padding: "0 0 0 20px", position: "relative" };
const bullet = { position: "absolute", left: 0, color: color.orange };

export default function ClayBarBeforeCeramicCoatingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.clayBarFirst }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
          faqLd(FAQ),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#16120f 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="PREP & APPLICATION"
          tagColor={color.orange}
          tagLabel="Clay bar"
          title={H1}
          lede={DESCRIPTION}
          readTime="6 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            Using a clay bar before ceramic coating sounds like a must, but for a spray finish it's only needed when the paint still feels rough after a wash. Clay is a useful tool, not a ritual, and using it when you don't need to just adds time and the risk of light marring. This guide is a closer look at the clay step from <Link href={routes.prepForSpray} className="us-text-link">how to prep your car for ceramic spray</Link>: how to tell whether your paint needs it, how to clay safely, where iron remover fits, and what to do afterward. APGO's own products, which come up later, are a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="do-i-need" style={section}>
            <h2 style={h2Balance}>Do I Need to Clay Bar Before Ceramic Spray?</h2>
            <p style={body}>
              Usually only if the paint still feels rough after you've washed it. If it feels smooth, you can usually skip clay and move on.
            </p>
            <p style={body}>
              Here's why washing doesn't always get everything. Some contamination doesn't just sit on the paint; it bonds to it. Tiny specks of tree sap, industrial fallout, overspray, and iron particles from brake dust and rail dust can stick firmly to the clear coat. A normal wash lifts dirt that's resting on the surface, but it often can't release particles that are stuck to it. That bonded layer is what makes clean paint feel gritty, and it's what clay is designed to pull off.
            </p>
            <p style={body}>
              New cars aren't automatically exempt. Paint can pick up fallout during transport and storage, so let the feel of the paint decide, not the mileage. Whether to coat a new car at all is its own question; see should you ceramic coat a new car.
            </p>
          </section>

          <section id="bag-test" style={section}>
            <h2 style={h2Balance}>The Bag Test: How to Tell If Your Paint Needs Clay</h2>
            <p style={body}>
              The easiest way to check is the bag test. Wash and dry the car, then slip your hand into a thin plastic sandwich bag and glide your fingertips lightly across the paint. The bag exaggerates texture, so you'll feel contamination you'd miss with bare fingers.
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Smooth as glass:</strong> skip the clay.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Feels like fine sandpaper:</strong> the paint has bonded contamination, and clay can help.
              </li>
            </ul>
            <p style={body}>
              Check the horizontal panels first, such as the hood, roof, and trunk lid, since contamination tends to settle there. Also check the lower panels behind the rear wheels, which often catch the most road grime.
            </p>
          </section>

          <section id="how-to-clay" style={section}>
            <h2 style={h2Balance}>How to Use a Clay Bar Before Ceramic Coating</h2>
            <p style={body}>
              Claying is simple, but it rewards a light touch. Always follow the directions on your clay and lubricant.
            </p>

            <h3 style={h3}>Clay Bar, Clay Mitt or Clay Towel?</h3>
            <p style={body}>
              All three do the same job in slightly different ways. A traditional clay bar gives the most control and feel, but you need to knead it to a clean face as it picks up contamination. A clay mitt or clay towel covers more area faster and can usually be rinsed and reused, which suits larger vehicles or people who clay more often. Which you pick comes down to the condition of the paint and your own preference.
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
                <span style={tableHeadText}>Tool</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={tableHeadText}>Best for</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={tableHeadText}>Watch out for</span>
              </div>
              {TABLE_TOOLS.map((row) => (
                <Fragment key={row.tool}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.tool}</div>
                  <div style={tableCell}>{row.bestFor}</div>
                  <div style={tableCell}>{row.watchOut}</div>
                </Fragment>
              ))}
            </div>

            <h3 style={h3}>Lubricate, Go Light, Work Small</h3>
            <p style={body}>
              Use plenty of lubricant, following its label, and never clay a dry surface. Work a small section at a time with light pressure and straight back-and-forth passes, letting the clay glide rather than pushing it into the paint. When the section feels smooth and the clay stops grabbing, move on. Wipe off leftover lubricant and residue as you go.
            </p>

            <h3 style={h3}>Dropped It? Toss It</h3>
            <p style={body}>
              If a clay bar hits the ground, throw it away. It will have picked up grit that can scratch the paint, and you can't reliably knead it out. Clay mitts and towels can usually be rinsed clean instead; follow their labels.
            </p>
          </section>

          <section id="iron-remover" style={section}>
            <h2 style={h2Balance}>Clay Bar Before or After Iron Remover?</h2>
            <p style={body}>
              Usually after. A typical order looks like this: wash the car, use an iron remover if the paint needs it (following its label), clay the areas that still feel rough, then wash or rinse again before you apply protection, either dry or wet according to that product's label.
            </p>
            <p style={body}>
              The reasoning is simple: letting the chemical dissolve iron particles first leaves less for the clay to pull off, which means less friction on the paint. To see where decontamination fits in a full detail, from wheels to glass, see our guide to <Link href={routes.detailingSteps} className="us-text-link">exterior car detailing steps</Link>.
            </p>
          </section>

          <section id="after-clay" style={section}>
            <h2 style={h2Balance}>After Clay: Haze, Stripped Protection and What Comes Next</h2>
            <p style={body}>
              Clay can leave light haze or marring, especially on dark paint or under strong light. Whether that's worth addressing depends on how much it bothers you; polishing is one option for removing it, but it's a separate job. If you're wondering how much a coating can do about marks like these, see <Link href={routes.coatingScratches} className="us-text-link">does ceramic coating prevent scratches</Link>.
            </p>
            <p style={body}>
              Claying can also take existing wax or protection off along with the contamination, so plan to put protection back on afterward. If your actual goal is to strip old wax, that's a different process with its own steps; see <Link href={routes.removeWaxFirst} className="us-text-link">how to remove wax before ceramic coating</Link>.
            </p>
            <p style={body}>
              Finally, wash or rinse off any clay residue and lubricant, then dry the car or move straight to a wet-application product, depending on what you're using. For drying and finishing, see <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>.
            </p>
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2Balance}>Using APGO's Silicone-Based Spray Glaze After Clay</h2>
            <p style={body}>
              APGO makes a silicone-based spray glaze, not a ceramic coating. Clay is general paint prep that you do only when the paint needs it; the clay, lubricant, and iron remover mentioned above are generic products, used as their own labels direct.
            </p>
            <p style={body}>
              If you're following with APGO Atomic Colored Glaze (D204), wash the car again after claying and let it dry completely before you apply it. APGO doesn't recommend applying D204 over an existing wax layer; don't rely on claying to take care of that, because wax removal is its own job. Before you touch the paint with a cloth, check it for leftover grit, sand, or dust, including any clay residue. Anything left on the surface can be dragged across the paint while you spread or buff, and that's what causes fine scratches and swirl marks. The full routine is in <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link>.
            </p>
            <p style={body}>
              If you're following with APGO Atomic Glaze Coating (D215), apply it after washing and rinsing, while the paint is still wet: spray it onto the wet paint, spread it with a damp application cloth, towel-dry the car, then buff with a clean coral-fleece microfiber towel. "Wet" means freshly washed and rinsed, not wet from rain or still dusty. See <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link>.
            </p>
            <p style={body}>
              Not sure which suits your routine? See <Link href={routes.wetOrDry} className="us-text-link">APGO's wet vs dry glaze routines</Link>, or <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link>.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Feel the paint before you decide. Clay only when it's rough, use plenty of lubricant and a light touch, and use iron remover first if you need it. Afterward, put protection back on, dry or wet according to the product's label, and keep the paint clean with regular, gentle washes; see <Link href={routes.washCoatedCar} className="us-text-link">how to wash a ceramic coated car</Link>.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["prepForSpray", "detailingSteps", "removeWaxFirst"]} />
      </main>
    </div>
  );
}
