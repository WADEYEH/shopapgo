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

const TITLE = "Exterior Car Detailing Steps: The Right Order";
const H1 = "Exterior Car Detailing Steps: The Right Order From Wheels to Protection";
const CRUMB = "Exterior detailing steps";
const DESCRIPTION = "Exterior car detailing steps in the right order: wheels first, top-down wash, decontaminate if needed, rinse, dry, inspect, protect, then glass and trim.";
const COVER = asset("generated/exterior-car-detailing-steps-hero.png");
const HERO_ALT = "Wet, freshly cleaned wheel in the foreground of a car being washed in a driveway";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.detailingSteps },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.detailingSteps,
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
    q: "What is the correct order for exterior car detailing?",
    a: "Wheels and tires, pre-rinse, top-down wash, decontamination if needed, final rinse, dry, inspect, protect, then glass and a final check.",
  },
  {
    q: "Should I wash the wheels before or after the body?",
    a: "Before, so grime and cleaner spray don't land on panels you've already washed.",
  },
  {
    q: "Do I need to clay the car every time I detail it?",
    a: "No. Clay is usually only needed when the paint still feels rough after washing. See how to prep your car for ceramic spray for how to check.",
  },
  {
    q: "When do I apply protection, while the car is wet or after it's dry?",
    a: "It depends on the product label. Wet-application products go on after the final rinse, and dry-application products go on after full drying and inspection.",
  },
  {
    q: "Should glass be cleaned first or last?",
    a: "Last, so overspray and drips from other steps don't undo it. Remove the oil film from the windshield before applying any glass product.",
  },
];

const TOC = [
  { href: "#why-order", label: "Why the Order Matters" },
  { href: "#at-a-glance", label: "The Steps at a Glance" },
  { href: "#steps", label: "The Steps, in Order" },
  { href: "#full-vs-quick", label: "Full Detail vs Quick Wash" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_STEPS = [
  { step: "1. Wheels & tires", what: "Removes the heaviest grime first", optional: "No", deeper: "—" },
  { step: "2. Pre-rinse", what: "Floats off loose grit before contact", optional: "No", deeper: "—" },
  { step: "3. Hand wash (top-down)", what: "Cleans roof to rocker panels, dirtiest last", optional: "No", deeper: "How to wash a ceramic coated car" },
  { step: "4. Decontaminate", what: "Removes bonded contamination washing leaves behind", optional: "Yes, if paint still feels rough", deeper: "How to prep your car for ceramic spray" },
  { step: "5. Final rinse (+ wet-application products)", what: "Clears soap residue; wet-application products go on here", optional: "No", deeper: "How to apply APGO Atomic Glaze Coating" },
  { step: "6. Dry", what: "Removes all water, including drips", optional: "No", deeper: "What to do after washing your car" },
  { step: "7. Inspect", what: "Catches missed spots and residue", optional: "No (polishing is)", deeper: "—" },
  { step: "8. Protect (dry-application products)", what: "Adds protection to clean, inspected paint", optional: "No", deeper: "How to apply APGO Atomic Colored Glaze" },
  { step: "9. Glass", what: "Cleans glass after the messy steps", optional: "No", deeper: "Ceramic coating on a windshield" },
  { step: "10. Trim, tires & final check", what: "Clears residue, catches drips", optional: "No", deeper: "—" },
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
const numberedList = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 };
const numberedItem = { ...body, display: "flex", gap: 12 };
const number = { fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, color: color.orange, flex: "none", width: 24 };

export default function ExteriorCarDetailingStepsPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.detailingSteps }),
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
          tagLabel="Full exterior order"
          title={H1}
          lede={DESCRIPTION}
          readTime="7 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            The exterior car detailing steps are simple once you know the logic: dirtiest parts first, protection last. Most mistakes come from doing the right things in the wrong order. Wash the body before the wheels, and the grime and cleaner you scrub off the wheels can splash right back onto panels you just cleaned. Put protection on before you've checked the paint, and you may seal leftover dirt or residue under it. This guide gives you the full order, and each step points to a deeper guide when you want the details.
          </p>

          <section id="why-order" style={section}>
            <h2 style={h2Balance}>Why the Order Matters</h2>
            <p style={body}>
              Three simple principles decide where every step goes:
            </p>
            <ol style={numberedList}>
              <li style={numberedItem}>
                <span style={number}>1</span>
                <span><strong style={strong}>Dirtiest first.</strong> Wheels and tires usually carry the heaviest grime and brake dust. Clean them first, so splatter from scrubbing lands on paint you haven't washed yet.</span>
              </li>
              <li style={numberedItem}>
                <span style={number}>2</span>
                <span><strong style={strong}>Top-down.</strong> Wash the body from the roof down, so dirty water runs toward areas you still have to wash.</span>
              </li>
              <li style={numberedItem}>
                <span style={number}>3</span>
                <span><strong style={strong}>Protection last.</strong> Whatever you use, whether wax, sealant, a spray glaze, or a ceramic product, it belongs on clean paint you've already inspected. Wet-application products go on right after the final rinse; dry-application products go on after the car is fully dry.</span>
              </li>
            </ol>
            <p style={body}>
              For more on that wet-versus-dry split, see <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>.
            </p>
          </section>

          <section id="at-a-glance" style={section}>
            <h2 style={h2Balance}>Exterior Car Detailing Steps at a Glance</h2>
            <p style={body}>
              If you've ever wondered how to detail a car exterior step by step without backtracking, this is the order to follow. Three steps are optional and depend on the condition of the car and what's already on the paint: decontamination, wax removal, and polishing.
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
                <span style={tableHeadText}>Step</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={tableHeadText}>What it does</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={tableHeadText}>Optional?</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={tableHeadText}>Go deeper</span>
              </div>
              {TABLE_STEPS.map((row) => (
                <Fragment key={row.step}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.step}</div>
                  <div style={tableCell}>{row.what}</div>
                  <div style={tableCell}>{row.optional}</div>
                  <div style={tableCell}>{row.deeper}</div>
                </Fragment>
              ))}
            </div>
          </section>

          <section id="steps" style={section}>
            <h2 style={h2Balance}>The Steps, in Order</h2>

            <h3 style={h3}>1. Wheels and Tires</h3>
            <p style={body}>
              Start with the wheels and tires, using a dedicated brush and a wheel cleaner used as its label directs. Keep those tools separate from the ones you use on the paint. If the wheels are hot from driving, let them cool before you spray anything on them.
            </p>

            <h3 style={h3}>2. Pre-Rinse the Whole Car</h3>
            <p style={body}>
              Rinse the whole car before you touch it with a mitt. Floating off loose grit first reduces the chance of dragging it across the paint. Of all the exterior car wash steps, this is the easiest one to skip and one of the most worthwhile to keep.
            </p>

            <h3 style={h3}>3. Hand Wash, Top Down</h3>
            <p style={body}>
              Wash from the roof down and leave the dirtiest lower panels for last. Rinse your wash mitt often so it isn't carrying grit from one panel to the next. Bucket setup and mitt technique are covered in <Link href={routes.washCoatedCar} className="us-text-link">how to wash a ceramic coated car</Link>. If you sometimes use an automatic wash instead, it can wear protection down faster than a gentle hand wash; see <Link href={routes.autoWashCoating} className="us-text-link">does an automatic car wash remove ceramic coating</Link>.
            </p>

            <h3 style={h3}>4. Decontaminate If Needed (Iron Remover or Clay)</h3>
            <p style={body}>
              After washing, run your fingertips lightly over the paint. If it still feels rough, bonded contamination is likely, and that's when an iron remover or a clay bar, used as its label directs, can help. If the paint already feels smooth, you can usually skip this step. How to check and what to do in what order is covered in <Link href={routes.prepForSpray} className="us-text-link">how to prep your car for ceramic spray</Link>, and our guide on <Link href={routes.clayBarFirst} className="us-text-link">clay bar before ceramic coating</Link> goes deeper on claying. If you're switching protection products and there's old wax on the paint, removing it is part of prep too; see <Link href={routes.removeWaxFirst} className="us-text-link">how to remove wax before ceramic coating</Link>.
            </p>

            <h3 style={h3}>5. Final Rinse: Where Wet-Application Products Go</h3>
            <p style={body}>
              Give the whole car a thorough final rinse so no soap or cleaner residue is left behind. Some protection products are designed to go on freshly washed, still-wet paint, following their label. If you use one of those, this is its place in the order: after the final rinse and before drying.
            </p>
            <p style={body}>
              APGO Atomic Glaze Coating (D215) is one of these. It's a silicone-based spray glaze applied after washing and rinsing, while the paint is still wet: you spray it onto the wet paint, spread it with a damp application cloth, towel-dry the car, then buff with a clean coral-fleece microfiber towel. "Wet" here means freshly washed and rinsed, not wet from rain. D215's approved surfaces are paint and wraps only. For the full routine, see <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link>.
            </p>

            <h3 style={h3}>6. Dry the Car</h3>
            <p style={body}>
              Dry the whole car with clean, absorbent towels. Include the places that keep dripping, such as door jambs, mirrors, and the gaps around the trunk, since water left to dry on its own can leave spots. For drying technique and which towel does what, see our guide to drying and finishing after a wash.
            </p>

            <h3 style={h3}>7. Inspect in Good Light</h3>
            <p style={body}>
              Before anything else goes on the paint, look at it in natural light or with a flashlight held at a low angle. Deal with missed spots, leftover residue, and water marks now. Polishing is optional, and many spray protection products don't require it. Correcting scratches and swirl marks is a separate job from protecting the paint.
            </p>

            <h3 style={h3}>8. Apply Protection (Dry-Application Products Go Here)</h3>
            <p style={body}>
              Wax, sealant, spray glaze, and ceramic products each have their own label, and each should be applied the way that label says. Dry-application products belong here, once the car is completely dry and you've inspected it. No protection layer lasts forever, so plan to refresh it when the surface tells you it's time; our guide on <Link href={routes.howOftenReapply} className="us-text-link">how often to reapply a spray finish</Link> covers the signs.
            </p>
            <p style={body}>
              APGO Atomic Colored Glaze (D204) is a silicone-based spray glaze applied after the car is washed and completely dried, so this is where it goes. APGO doesn't recommend applying D204 over an existing wax layer. D204 and D215 are alternative routines, not a two-layer system, so contact APGO before combining them. The steps are in <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link>, and if you're not sure whether the wet or dry routine suits your wash, see <Link href={routes.wetOrDry} className="us-text-link">APGO's wet vs dry glaze routines</Link> or <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link>.
            </p>

            <h3 style={h3}>9. Glass</h3>
            <p style={body}>
              Clean the glass near the end with a glass cleaner, so drips and overspray from the other steps don't undo your work. If you plan to put any protection product on glass, first confirm that its label lists glass. The windshield also tends to build up an oil film, and whatever you apply to it is hard to get clean and even until that film is removed.
            </p>
            <p style={body}>
              APGO's D204 can be used on glass; on the front windshield, remove any oil film first, because on a windshield that hasn't been de-filmed, the result won't be clean. D215's approved surfaces are paint and wraps only, so for any glass, including the front windshield, check the current label or contact APGO support. Our guide to <Link href={routes.windshieldCoating} className="us-text-link">ceramic coating on a windshield</Link> covers glass prep in detail.
            </p>

            <h3 style={h3}>10. Trim, Tires and a Final Walk-Around</h3>
            <p style={body}>
              Check unpainted plastic trim for leftover wax remover, cleaner, or polish residue, and wipe off anything you find with a clean, damp cloth before it dries in. If you use a tire dressing, apply it last, so it doesn't sling onto freshly finished paint. Then walk around the car once more to catch water trails from mirrors and gaps, product residue, and any spot you missed.
            </p>
          </section>

          <section id="full-vs-quick" style={section}>
            <h2 style={h2Balance}>Full Detail vs Quick Wash: Which Steps to Keep</h2>
            <p style={body}>
              On a quick wash day, you can usually skip decontamination, wax removal, and polishing; those are for when the paint needs them.
            </p>
            <p style={body}>
              Some steps are worth keeping every time:
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Wheels first</strong>, so their grime never lands on clean paint.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Top-down washing</strong>, so dirty water runs toward unwashed areas.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>A thorough final rinse</strong>, so no soap or cleaner dries on the paint.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Complete drying</strong>, or, if you use a wet-application product, following its order: apply after the final rinse, then dry.
              </li>
            </ul>
            <p style={body}>
              When to put protection back on depends on the product and how the paint is holding up, not on a fixed number of washes.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Dirtiest first, protection last. Every step has its place, and protection only goes on a clean surface you've inspected. Once the car is done, keeping it that way is mostly about regular, gentle washing; see <Link href={routes.coatingMaintenance} className="us-text-link">ceramic coating maintenance</Link> for a simple routine. APGO's silicone-based spray glaze comes in a wet routine and a dry routine, and steps 5 and 8 show where each one fits.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["prepForSpray", "clayBarFirst", "afterWashing"]} />
      </main>
    </div>
  );
}
