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

const TITLE = "How to Choose a Ceramic Coating Spray: What to Check";
const H1 = "How to Choose a Ceramic Coating Spray: What to Check Before You Buy";
const CRUMB = "Choosing a coating spray";
const DESCRIPTION = "How to choose a ceramic coating spray: match the label to how you wash. Check wet or dry use, listed surfaces, durability as a ceiling and what's on your paint.";
const COVER = asset("generated/how-to-choose-a-ceramic-coating-hero.png");
const HERO_ALT = "Hand holding a blank instruction card in a home garage with a clean car in the background";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.chooseCoatingSpray },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.chooseCoatingSpray,
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
    q: "Is there one ceramic spray that's right for every car?",
    a: "No. The right choice is the one whose label matches your wash routine, your surfaces, and what's already on your paint.",
  },
  {
    q: "What should I look for in a ceramic spray?",
    a: "Wet or dry application, listed surfaces, durability read as a ceiling, compatibility with existing products, prep and keep-dry requirements, and clear instructions with real support.",
  },
  {
    q: "Is a longer durability claim always better?",
    a: "Not necessarily. It's an upper limit, and your routine and conditions decide how long it actually lasts.",
  },
  {
    q: "Can I put a ceramic spray over wax?",
    a: "Check that product's label. See can you apply ceramic coating over wax for how to decide.",
  },
  {
    q: "Does a bigger bottle mean more applications?",
    a: "No. How far a bottle goes depends on vehicle size, surface condition, and how the product is applied.",
  },
];

const TOC = [
  { href: "#start-with-routine", label: "Start With Your Routine" },
  { href: "#label-checklist", label: "The Label Checklist" },
  { href: "#apgo", label: "How APGO Reads Against This List" },
  { href: "#mistakes", label: "Common Buying Mistakes" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_CHECKLIST = [
  { checkpoint: "Application timing", look: "Dry paint or freshly rinsed wet paint", why: "It has to fit your wash routine" },
  { checkpoint: "Listed surfaces", look: "Which surfaces are named", why: "Unlisted surfaces are a guess" },
  { checkpoint: "Durability claim", look: 'Worded as "up to"', why: "Real life is usually shorter than the ceiling" },
  { checkpoint: "Compatibility", look: "What it says about wax or other products", why: "Not every product can go over another" },
  { checkpoint: "Prep & working window", look: "Required prep and how fast to buff", why: "A strict window needs small sections" },
  { checkpoint: "Keep-dry time", look: "How long to avoid water afterward", why: "Weather and wash plans need to fit" },
  { checkpoint: "Instructions & support", look: "Clear directions and a way to contact the maker", why: "You'll need answers if something goes wrong" },
  { checkpoint: "Bottle size", look: "Volume, read alongside how it's applied", why: "Size doesn't equal number of applications" },
];

const TABLE_APGO = [
  { checkpoint: "Product type", d204: "Silicone-based spray glaze", d215: "Silicone-based spray glaze" },
  { checkpoint: "Application timing", d204: "After the car is washed and completely dried", d215: "On wet, freshly washed and rinsed paint" },
  { checkpoint: "Listed surfaces", d204: "Paint, wraps, glass, wheels (on a windshield, remove the oil film first)", d215: "Paint, wraps" },
  { checkpoint: "Durability ceiling", d204: "Up to about 6 months (180 days)", d215: "Up to about 4 months (120 days)" },
  { checkpoint: "Over wax", d204: "Not recommended over an existing wax layer", d215: "Check the current label or contact APGO support" },
  { checkpoint: "Bottle size", d204: "300 mL / 10.1 fl oz (size doesn't equal applications)", d215: "200 mL / 6.8 fl oz (size doesn't equal applications)" },
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
const tableGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 2,
  background: color.hairline,
  border: `1px solid ${color.hairline}`,
  fontSize: 15,
  lineHeight: 1.4,
  overflow: "auto",
};
const tableHeadText = { fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" };

const bulletList = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 };
const bulletItem = { ...body, margin: 0, padding: "0 0 0 20px", position: "relative" };
const bullet = { position: "absolute", left: 0, color: color.orange };

export default function HowToChooseACeramicCoatingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.chooseCoatingSpray }),
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
          tagLabel="Label checklist"
          title={H1}
          lede={DESCRIPTION}
          readTime="6 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            Knowing how to choose a ceramic coating spray comes down to reading the label against your own routine, not chasing the loudest claim on the bottle. Two products can both say "ceramic" and still ask for very different things: one wants a bone-dry car, another goes on wet; one lists glass and wheels, another only paint. This guide gives you a general checklist to read any label with. It doesn't name brands or rank products. APGO's own products, which come up later, are a silicone-based spray glaze, not a ceramic coating. If you're still deciding whether this kind of product is right for you at all, start with our guide on <Link href={routes.isSprayWorthIt} className="us-text-link">is ceramic spray worth it</Link>.
          </p>

          <section id="start-with-routine" style={section}>
            <h2 style={h2Balance}>How to Choose a Ceramic Coating: Start With Your Routine</h2>
            <p style={body}>
              Before you compare labels, look at how you actually take care of the car. Do you hand-wash at home, or mostly use an automatic wash? After a wash, do you have time to finish the job, or do you want to be done once the car is dry? And how often are you realistically willing to redo it?
            </p>
            <p style={body}>
              Those answers narrow the field faster than any feature list. There's no single best ceramic spray for cars; the best one is the one whose label fits your routine.
            </p>
            <p style={body}>
              If you want the basics first, see <Link href={routes.whatIsSprayCeramic} className="us-text-link">what spray ceramic coating is</Link>, and for how sprays differ from bottled coatings, see <Link href={routes.sprayVsCoating} className="us-text-link">ceramic spray vs ceramic coating</Link>.
            </p>
          </section>

          <section id="label-checklist" style={section}>
            <h2 style={h2Balance}>What to Look For in a Ceramic Spray: The Label Checklist</h2>
            <p style={body}>
              Here's what to look for in a ceramic spray, one label question at a time.
            </p>

            <h3 style={h3}>1. Wet or Dry Application?</h3>
            <p style={body}>
              Some products need completely dry paint. Others are designed to go on right after the final rinse, while the car is still wet. Neither is better in general; pick the one that fits the way you already wash. For where each type fits after a wash, see <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>.
            </p>

            <h3 style={h3}>2. Which Surfaces Does the Label List?</h3>
            <p style={body}>
              Glass, wheels, and wraps are common extras, but only use a product on surfaces its label actually lists. If a surface isn't listed, don't assume it's fine.
            </p>

            <h3 style={h3}>3. Read Durability Claims as a Ceiling</h3>
            <p style={body}>
              A durability claim on the label is typically the most you can expect under good conditions, not a guarantee. How you wash, the weather, and where the car is parked can all shorten it. It's more useful to plan on reapplying when the surface tells you to; see <Link href={routes.howOftenReapply} className="us-text-link">how often to apply ceramic spray coating</Link>.
            </p>

            <h3 style={h3}>4. Will It Work With What's Already on Your Paint?</h3>
            <p style={body}>
              If there's wax, a sealant, or an unknown product on the paint, check what the label says about applying over it. Don't assume any product can simply be layered on top of another. Our guide on <Link href={routes.coatingOverWax} className="us-text-link">can you apply ceramic coating over wax</Link> walks through the decision.
            </p>

            <h3 style={h3}>5. Prep Requirements and Working Window</h3>
            <p style={body}>
              Check how much prep the label asks for, such as iron removal, clay, or wax removal, and how strict its working window is, meaning how soon you need to spread and buff after spraying. The stricter the window, the more it helps to work in small sections. For prep in general, see <Link href={routes.prepForSpray} className="us-text-link">how to prep your car for ceramic spray</Link>.
            </p>

            <h3 style={h3}>6. How Long Must It Stay Dry Afterward?</h3>
            <p style={body}>
              Many products need to stay dry for a while after application, and the length varies by label. Check the weather and your next wash before you start, not after. Our guide on <Link href={routes.waitToWash} className="us-text-link">how long to wait before washing after a spray finish</Link> covers the planning.
            </p>

            <h3 style={h3}>7. Clear Instructions and Real Support</h3>
            <p style={body}>
              A good label tells you plainly which surfaces the product is for, when to apply it, and what to avoid. Just as important: is there a way to reach the maker if something goes wrong or the label doesn't answer your question?
            </p>

            <h3 style={h3}>8. Bottle Size Isn't the Same as Coverage</h3>
            <p style={body}>
              A bigger bottle doesn't automatically mean more applications. How far a bottle goes depends on the size of the vehicle, the condition of the surface, and how the product is meant to be applied.
            </p>
            <p style={body}>
              Here's the checklist at a glance:
            </p>
            <div style={tableGrid}>
              <div style={tableHead(color.tertiary)}>
                <span style={tableHeadText}>Checkpoint</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={tableHeadText}>What to look for on the label</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={tableHeadText}>Why it matters</span>
              </div>
              {TABLE_CHECKLIST.map((row) => (
                <Fragment key={row.checkpoint}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.checkpoint}</div>
                  <div style={tableCell}>{row.look}</div>
                  <div style={tableCell}>{row.why}</div>
                </Fragment>
              ))}
            </div>
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2Balance}>Not Set on Ceramic? How APGO's Silicone-Based Spray Glaze Reads Against This List</h2>
            <p style={body}>
              If you don't specifically need a ceramic product, there's another category to consider. APGO makes a silicone-based spray glaze. It isn't a ceramic coating, and APGO doesn't make ceramic chemistry claims for it. Here's how its two products read against some of the general checkpoints above; the table below sums it up.
            </p>
            <p style={body}>
              <strong style={strong}>Application timing.</strong> APGO Atomic Colored Glaze (D204) is applied after the car is washed and completely dried. APGO Atomic Glaze Coating (D215) is applied after washing and rinsing, while the paint is still wet: spray it onto the wet paint, spread it with a damp application cloth, towel-dry the car, then buff with a clean coral-fleece microfiber towel.
            </p>
            <p style={body}>
              <strong style={strong}>Listed surfaces.</strong> D204 is suitable for paint, wraps, glass, and wheels; on a windshield, remove the oil film first, because on a windshield that hasn't been de-filmed, the result won't be clean. D215 is suitable for paint and wraps only. For any other surface, check the current label or contact APGO support.
            </p>
            <p style={body}>
              <strong style={strong}>Durability as a ceiling.</strong> D204 lasts up to about 6 months (180 days), and D215 lasts up to about 4 months (120 days). Both are ceilings, not promises.
            </p>
            <p style={body}>
              <strong style={strong}>Compatibility.</strong> APGO doesn't recommend applying D204 over an existing wax layer. For D215 over wax, check the current label or contact APGO support.
            </p>
            <div style={tableGrid}>
              <div style={tableHead(color.tertiary)}>
                <span style={tableHeadText}>Checkpoint</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={tableHeadText}>APGO Atomic Colored Glaze (D204)</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={tableHeadText}>APGO Atomic Glaze Coating (D215)</span>
              </div>
              {TABLE_APGO.map((row) => (
                <Fragment key={row.checkpoint}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.checkpoint}</div>
                  <div style={tableCell}>{row.d204}</div>
                  <div style={tableCell}>{row.d215}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              D204 and D215 are alternative routines, not a two-product layering system, so contact APGO before combining them. To see which one fits your wash, read <Link href={routes.wetOrDry} className="us-text-link">APGO's wet vs dry glaze routines</Link>, or <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link>.
            </p>
          </section>

          <section id="mistakes" style={section}>
            <h2 style={h2Balance}>Common Buying Mistakes</h2>
            <p style={body}>
              Watch for these:
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Buying on the loudest claim.</strong> Choosing by the biggest word on the bottle instead of the application and surface directions.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Assuming unlisted surfaces are fine.</strong> Using a product on glass, wheels, or wraps when the label doesn't list them.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Treating durability as a promise.</strong> Reading an "up to" figure as the minimum you'll get.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Assuming it can go over anything.</strong> Applying straight over old wax or an unknown product without checking the label.
              </li>
            </ul>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Start with your own wash routine, then go through the label one checkpoint at a time. There's no universal winner, only the product whose directions fit how you actually care for your car. If you don't need a ceramic product, another option is a silicone-based spray glaze.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["isSprayWorthIt", "coatingOverWax", "prepForSpray"]} />
      </main>
    </div>
  );
}
