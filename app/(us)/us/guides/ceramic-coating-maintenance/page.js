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

const TITLE = "Ceramic Coating Maintenance: A Simple Routine";
const H1 = "Ceramic Coating Maintenance: A Simple Routine That Keeps Spray Coatings Working";
const CRUMB = "Coating maintenance";
const DESCRIPTION = "Ceramic coating maintenance made simple: wash gently, dry the car, clear contamination fast, watch water behavior and gloss, and top up as your label says.";
const COVER = asset("generated/ceramic-coating-maintenance-hero.png");
const HERO_ALT = "Gleaming car in a driveway on a relaxed morning with water beading on the hood";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.coatingMaintenance },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.coatingMaintenance,
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
    q: "How do you maintain a ceramic spray coating?",
    a: "Wash gently, dry the car with a clean towel, remove contamination quickly, watch water behavior and gloss as you wash, and top up or reapply the way your label says. The routine above covers each step.",
  },
  {
    q: "What soap should I use on a ceramic coated car?",
    a: "A mild, pH-neutral car shampoo. Avoid strong degreasers and household cleaners.",
  },
  {
    q: "Can I take a ceramic coated car through an automatic car wash?",
    a: "You can, but brushes, strong detergents, and frequent visits usually wear the protection down faster. Our automatic car wash guide explains what to watch for.",
  },
  {
    q: "How long does a spray coating last with good maintenance?",
    a: "It depends on the product's label. APGO's D204 lasts up to about 6 months and D215 up to about 4 months, and both are ceilings rather than promises. Washing habits and weather decide where you land; see how often to apply ceramic spray coating.",
  },
  {
    q: "Should I wax over a spray coating?",
    a: "Check the current label for your spray product, or contact APGO support before adding wax over an APGO glaze.",
  },
];

const TOC = [
  { href: "#what-it-means", label: "What Maintenance Means" },
  { href: "#routine", label: "A Simple Routine" },
  { href: "#checklist", label: "Checklist at a Glance" },
  { href: "#avoid", label: "What to Avoid" },
  { href: "#apgo", label: "If You Use APGO" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_CHECKLIST = [
  {
    task: "Gentle hand wash",
    when: "Every wash",
    why: "Removes grit without stripping or scratching the finish",
    deeper: { text: "how to wash a ceramic coated car at home", route: routes.washCoatedCar },
  },
  {
    task: "Dry with a clean towel",
    when: "Every wash",
    why: "Prevents mineral water spots",
    deeper: { text: "What to do after washing your car", route: routes.afterWashing },
  },
  {
    task: "Remove droppings, bugs and sap",
    when: "As soon as you spot them",
    why: "The longer they sit, the harder they are to remove",
    deeper: { text: "What rain and road salt do to a spray coating", route: routes.rainDamageCoating },
  },
  {
    task: "Check water behavior and gloss",
    when: "Every wash",
    why: "Tells you how the finish is holding up",
    deeper: { text: "How often to apply ceramic spray coating", route: routes.howOftenReapply },
  },
  {
    task: "Top up or reapply",
    when: "Per your product's label",
    why: "Restores performance once the signals stack up",
    deeper: null,
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

export default function CeramicCoatingMaintenancePage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.coatingMaintenance }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
          faqLd(FAQ),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#16120f 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="WASH & CARE"
          tagColor={color.orange}
          tagLabel="Maintenance routine"
          title={H1}
          lede={DESCRIPTION}
          readTime="7 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            On the day you apply it, water beads up and rolls off the paint beautifully. A few washes later, the beading looks flatter. That usually isn't the product suddenly failing. It's everyday wear: how you wash, how you dry, and what gets left sitting on the paint. Good ceramic coating maintenance slows that wear down. This page gives you a one-page routine, and each step links to a guide that goes deeper. The habits apply to spray products in general, whether spray ceramic or spray glaze, since both do best with gentle care. Top-up and reapply rules, though, always come from your own product's label. APGO's products, which come up later, are a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="what-it-means" style={section}>
            <h2 style={h2Balance}>What Ceramic Coating Maintenance Actually Means</h2>
            <p style={body}>
              Maintenance doesn't make a protective layer stronger. What it does is cut out unnecessary wear, so the layer keeps performing for as long as it realistically can. No protection is permanent, and no routine turns a months-scale product into a years-scale one.
            </p>
            <p style={body}>
              If you're wondering how to maintain ceramic spray coating compared with a professional coating, the everyday habits are the same: wash gently and deal with contamination quickly. The difference shows up when performance fades. A spray product is something you can top up or reapply yourself, while a professional coating is maintained under the shop's written terms.
            </p>
            <p style={body}>
              Whatever you use, the product label or the shop's terms come first. A general routine like this one fills in the everyday habits around them.
            </p>
          </section>

          <section id="routine" style={section}>
            <h2 style={h2Balance}>A Simple Ceramic Coating Maintenance Routine</h2>
            <p style={body}>
              Five habits make up the whole routine. None of them takes long, and together they do most of the work of keeping a spray finish looking its best.
            </p>

            <h3 style={h3}>Wash Gently, With a Mild Car Shampoo</h3>
            <p style={body}>
              Use a mild, pH-neutral car shampoo and a clean wash mitt. Skip strong degreasers, harsh household cleaners, and stiff brushes, which strip and scratch rather than clean. Wash often enough that dirt doesn't sit and bake onto the paint. There's no magic number; it depends on how you drive and where you park.
            </p>
            <p style={body}>
              The step-by-step wash itself is covered in <Link href={routes.washCoatedCar} className="us-text-link">how to wash a ceramic coated car at home</Link>. If you rely on drive-through washes, know that brushes, strong detergents, and repeated friction tend to wear a spray finish down faster; our guide on <Link href={routes.autoWashCoating} className="us-text-link">does an automatic car wash remove ceramic coating</Link> explains why.
            </p>

            <h3 style={h3}>Dry It Instead of Letting It Air-Dry</h3>
            <p style={body}>
              Water left to evaporate on paint leaves its minerals behind as spots. Dry the car with a clean towel suitable for car paint instead of letting it air-dry or driving it dry. For towel choice and technique, see <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>.
            </p>

            <h3 style={h3}>Clean Off Contamination Quickly</h3>
            <p style={body}>
              Bird droppings, bug splatter, and tree sap get harder to remove the longer they sit, and they can be tough on the finish underneath. When you spot them, soften them first with water or a car-safe cleaner, give that a moment to work, then lift them off gently with a clean microfiber towel. Never scrub them off dry, which drags grit across the paint.
            </p>
            <p style={body}>
              Rain residue and winter road salt are a related but separate problem. For those, read <Link href={routes.rainDamageCoating} className="us-text-link">what rain and road salt do to a spray coating</Link>.
            </p>

            <h3 style={h3}>Watch the Paint's Signals as You Wash</h3>
            <p style={body}>
              Every wash is a free inspection. While you work, pay attention to how water behaves on the paint and how the gloss looks. Which changes matter, and when they add up to a redo, is covered in detail in our guide to <Link href={routes.howOftenReapply} className="us-text-link">signs it's time to reapply</Link>.
            </p>

            <h3 style={h3}>Top Up or Reapply the Way Your Label Says</h3>
            <p style={body}>
              When and how to top up or reapply comes from your product's label. Don't spray a heavier coat "for insurance," and don't reapply on a fixed calendar without looking at the paint.
            </p>
            <p style={body}>
              For APGO users, here's what that looks like. APGO Atomic Colored Glaze (D204) is a silicone-based spray glaze, not a ceramic coating. Once the car is washed and fully dried, you can apply another thin layer as upkeep. It's optional, not required at every wash, and a thicker coat isn't better. The full routine is in <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link>. For APGO Atomic Glaze Coating (D215), follow the current label for when to reapply.
            </p>
            <p style={body}>
              D204 lasts up to about 6 months (180 days), and D215 lasts up to about 4 months (120 days). Both figures are ceilings, not promises. How long your finish actually lasts depends on how you wash, your weather, and where the car is parked. For the first wash after a fresh application, see <Link href={routes.waitToWash} className="us-text-link">how long to wait before washing after a spray finish</Link>.
            </p>
          </section>

          <section id="checklist" style={section}>
            <h2 style={h2Balance}>Your Maintenance Checklist at a Glance</h2>
            <p style={body}>
              Here's the whole routine in one table, with a link for each step.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                fontSize: 15,
                lineHeight: 1.4,
                overflow: "auto",
              }}
            >
              <div style={tableHead(color.tertiary)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Task</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>When</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Why it matters</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Go deeper</span>
              </div>
              {TABLE_CHECKLIST.map((row) => (
                <Fragment key={row.task}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.task}</div>
                  <div style={tableCell}>{row.when}</div>
                  <div style={tableCell}>{row.why}</div>
                  <div style={tableCell}>
                    {row.deeper ? (
                      <Link href={row.deeper.route} className="us-text-link">{row.deeper.text}</Link>
                    ) : (
                      "Your product's label or guide"
                    )}
                  </div>
                </Fragment>
              ))}
            </div>
          </section>

          <section id="avoid" style={section}>
            <h2 style={h2Balance}>What to Avoid</h2>
            <p style={body}>
              A few habits undo good maintenance faster than anything else:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Harsh cleaners.</strong> Strong, high-alkaline, or household degreasing products can strip a spray finish.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Dirty or dry wiping.</strong> Rubbing grime off with a dirty or dry cloth drags grit across the paint.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Hot paint and direct sun.</strong> Washing or applying product on a hot panel in full sun makes it hard to get an even result.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Spraying extra to "boost" protection.</strong> A heavier coat is usually just harder to buff and more likely to haze. If you already see haze or streaks, see <Link href={routes.streaksHighSpots} className="us-text-link">fixing streaks or haze from a spray finish</Link>.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Layering over old wax or unknown products.</strong> Don't assume products stack. Check the label or ask the maker. APGO's D204 and D215 are alternative routines, not a two-product layering system, so contact APGO before combining or alternating them.
              </li>
            </ul>
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2Balance}>If You Use APGO's Silicone-Based Spray Glaze</h2>
            <p style={body}>
              Each of APGO's two products is a silicone-based spray glaze, not a ceramic coating. Atomic Colored Glaze (D204) goes on after the car is washed and completely dried. Atomic Glaze Coating (D215) goes on after washing and rinsing, while the paint is still wet. Pick the one that fits the way you already wash, and the habits on this page apply to either. For the wet routine, see <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link>, or <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link> options side by side.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Can I take a ceramic coated car through an automatic car wash?"
                ? <>You can, but brushes, strong detergents, and frequent visits usually wear the protection down faster. Our <Link href={routes.autoWashCoating} className="us-text-link">automatic car wash guide</Link> explains what to watch for.</>
                : item.q === "How long does a spray coating last with good maintenance?"
                ? <>It depends on the product's label. APGO's D204 lasts up to about 6 months and D215 up to about 4 months, and both are ceilings rather than promises. Washing habits and weather decide where you land; see <Link href={routes.howOftenReapply} className="us-text-link">how often to apply ceramic spray coating</Link>.</>
                : item.a
            }))} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Good ceramic coating maintenance is boring on purpose: wash gently, dry the car, don't let contamination sit, and watch the signals before you top up. Follow your product's label for everything else. If you're still choosing a finish to maintain, <Link href={routes.compare} className="us-text-link">compare APGO's spray glaze routines</Link>.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["howOftenReapply", "autoWashCoating", "rainDamageCoating"]} />
      </main>
    </div>
  );
}
