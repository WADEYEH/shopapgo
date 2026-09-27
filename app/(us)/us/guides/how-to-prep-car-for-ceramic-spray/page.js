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

const TITLE = "How to Prep Your Car for Ceramic Spray";
const H1 = "How to Prep Your Car for Ceramic Spray (Wash, Decon, Dry)";
const CRUMB = "Prep for ceramic spray";
const DESCRIPTION = "How to prep car for ceramic spray: wash, check for bonded contamination, decon only if needed, confirm there's no old wax, then dry or leave wet per your label.";
const COVER = asset("generated/how-to-prep-car-for-ceramic-spray-hero.png");
const HERO_ALT = "Freshly washed car in morning shade with water sheeting off the door";
const INLINE_IMAGE = asset("generated/how-to-prep-car-for-ceramic-spray-ready-check.png");

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.howToPrepCarForCeramicSpray },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.howToPrepCarForCeramicSpray,
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
    q: "Do I need to use an iron remover before ceramic coating?",
    a: "Not always. An iron remover is only needed when the paint shows signs of iron fallout, such as orange or brown specks or a rough feel after washing. If you use one, follow that product's label and rinse the car thoroughly afterward.",
  },
  {
    q: "Do I need to clay bar before a ceramic spray?",
    a: "Only if the paint still feels rough after a thorough wash. If it feels smooth, you can skip clay.",
  },
  {
    q: "Do I need to polish my car before applying ceramic spray?",
    a: "A spray finish usually doesn't require full-car polishing. Keep in mind that a spray won't remove existing scratches, so if you want those gone, that's a separate job.",
  },
  {
    q: "Can I apply a spray finish over wax?",
    a: "Don't assume you can. Confirm what's on the paint or remove it first. APGO does not recommend applying D204 over an existing wax layer. For the full decision, see can you apply ceramic coating over wax.",
  },
  {
    q: "Should the car be wet or dry before I spray?",
    a: "Follow your product's label. APGO's D204, a silicone-based spray glaze, goes on completely dry paint, while D215 goes on paint that is still wet from the final rinse. Our wet or dry application guide explains the difference.",
  },
];

const TOC = [
  { href: "#how-much-prep", label: "How Much Prep?" },
  { href: "#step-by-step", label: "Step by Step" },
  { href: "#surfaces", label: "Check Which Surfaces" },
  { href: "#skip-or-keep", label: "What You Can Skip" },
  { href: "#next-steps", label: "Ready to Apply?" },
  { href: "#faq", label: "FAQ" },
];

const TABLE_SKIP = [
  {
    step: "Wash & rinse",
    when: "Every time",
    skip: "No",
  },
  {
    step: "Contamination check",
    when: "Every time; it only takes a minute",
    skip: "No",
  },
  {
    step: "Iron remover",
    when: "Only if you see iron specks or the paint feels rough after washing",
    skip: "Yes, if the paint is clean and smooth",
  },
  {
    step: "Clay",
    when: "Only if the paint still feels rough after washing",
    skip: "Yes, if the paint feels smooth",
  },
  {
    step: "Wax check",
    when: "Whenever you're not sure what's on the paint",
    skip: "No",
  },
  {
    step: "Dry or leave wet",
    when: "Every time; follow your product's label",
    skip: "No",
  },
  {
    step: "Final inspection",
    when: "Every time",
    skip: "No",
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

export default function HowToPrepCarForCeramicSprayPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.howToPrepCarForCeramicSpray }),
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
          tagLabel="Before you spray"
          title={H1}
          lede={DESCRIPTION}
          readTime="8 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            The bottle says "easy," and the spraying part usually is. Whether the finish comes out even and holds up, though, is mostly decided before you pick up the bottle. This guide shows how to prep your car for ceramic spray with a simple ladder: wash, check for contamination, decontaminate only if you need to, confirm there's no old wax, dry the car or leave it wet as your label says, then inspect. It isn't an application guide for any one product. Once the prep is done, follow the directions on the bottle you're using. Where we mention APGO, keep in mind that its products are a silicone-based spray glaze, not a ceramic coating; the same prep ladder applies to them.
          </p>

          <section id="how-much-prep" style={section}>
            <h2 style={h2Balance}>How Much Prep Does a Ceramic Spray Actually Need?</h2>
            <p style={body}>
              A spray product needs paint that is clean, smooth, and free of old wax or unknown products. What it usually doesn't need is the full treatment a liquid coating job involves. Most advice on how to prep a car for ceramic coating is written for liquid or professional coatings, which typically call for more thorough work, often including machine polishing to correct the paint first. The exact requirements for those depend on the product or the shop.
            </p>
            <p style={body}>
              Keep one expectation in check: a spray won't remove existing scratches, swirl marks, or oxidation. Prep isn't about making old paint look new. It's about not adding new marks and making sure the product goes onto paint, not onto dirt or leftover product.
            </p>
          </section>

          <section id="step-by-step" style={section}>
            <h2 style={h2Balance}>How to Prep Your Car for Ceramic Spray, Step by Step</h2>
            <p style={body}>
              Work through these six steps in order. Most take only a few minutes, and you'll often skip step 3 entirely.
            </p>

            <h3 style={h3}>1. Wash the Car Thoroughly</h3>
            <p style={body}>
              Use a dedicated car shampoo and clean tools to lift grit, dust, and road film, then rinse until no soap is left. Soap residue sits between the paint and whatever you spray next, so the rinse matters as much as the wash. Give extra attention to the lower panels, the areas behind the wheels, and the edges around badges and trim, where dirt tends to hide.
            </p>
            <p style={body}>
              The wash routine itself, from the pre-rinse to the order you work around the car, is a topic of its own. We cover it in <Link href={routes.howToWashCeramicCoatedCar} className="us-text-link">how to wash a ceramic coated car</Link>.
            </p>

            <h3 style={h3}>2. Feel and Look for Bonded Contamination</h3>
            <p style={body}>
              Once the paint is clean, check whether anything is still stuck to it. Run clean fingertips lightly across a horizontal panel such as the hood or roof. If it feels gritty or rough instead of glassy, something is bonded to the surface. Some people slip their hand into a thin plastic bag first, which makes roughness easier to feel.
            </p>
            <p style={body}>
              Then look at the paint in good light. Tiny orange or brown specks are often iron fallout. Dark spots low on the sides are usually tar, and sticky, glossy droplets are usually tree sap. If the paint feels smooth and looks clean, you can skip straight to step 4.
            </p>

            <h3 style={h3}>3. Decontaminate Only If You Need To</h3>
            <p style={body}>
              Decontamination fixes a problem you found in step 2. It isn't a required part of every spray session.
            </p>
            <p style={body}>
              <strong style={strong}>Iron remover.</strong> An iron remover is made to dissolve embedded iron particles, the kind of fallout from brake dust and industrial sources that a normal wash won't lift. Using an iron remover before ceramic coating or any spray finish makes sense if the car racks up highway miles or you spot brown or orange specks, especially on panels near the wheels. Follow that product's label for how to use it, then rinse the car thoroughly before you move on.
            </p>
            <p style={body}>
              <strong style={strong}>Clay.</strong> A clay bar or clay mitt lifts bonded contamination you can still feel after washing. Use plenty of lubricant and light pressure, and let the clay glide rather than scrub. Because clay works by friction, it can leave faint marring on some paint, which may need attention before you add a finish. Clay technique is a deeper topic than this guide covers, so keep it light and only use it where the paint actually feels rough.
            </p>

            <h3 style={h3}>4. Make Sure There's No Old Wax on the Paint</h3>
            <p style={body}>
              A spray finish is designed to go onto clean paint. When old wax sits in between, the common results are uneven application, haze, and a finish that doesn't last as long as it should.
            </p>
            <p style={body}>
              If you don't know what's on the paint, maybe because you bought the car used or can't remember the last product you applied, treat that as a question to answer first rather than something to spray over. Our <Link href={routes.coatingOverWax} className="us-text-link">coating-over-wax checklist</Link> helps you decide what to do, and the removal itself is covered in <Link href={routes.howToRemoveWaxBeforeCeramicCoating} className="us-text-link">how to remove wax before ceramic coating</Link>.
            </p>
            <p style={body}>
              For APGO products specifically, APGO does not recommend applying Atomic Colored Glaze (D204) over an existing wax layer. If the car already carries some other spray product, or you're not sure what it is, check the current label or contact APGO support before you apply an APGO glaze.
            </p>

            <h3 style={h3}>5. Dry the Car, or Leave It Wet, Based on Your Product's Label</h3>
            <p style={body}>
              "Spray-on" doesn't describe a single method. Some products go on fully dried paint. Others are designed to go on right after the rinse, while the paint is still wet. Read the label before you reach for the drying towel, because this is the step where people most often follow the wrong routine.
            </p>
            <p style={body}>
              APGO's two products show both sides. APGO Atomic Colored Glaze (D204) is a silicone-based spray glaze that goes on after the car is washed and completely dried. APGO Atomic Glaze Coating (D215) is also a silicone-based spray glaze, but it goes on after washing and rinsing, while the paint is still wet. "Wet" here means freshly washed and rinsed. It doesn't mean wet from rain or still dusty.
            </p>
            <p style={body}>
              If your product calls for a dry car, our guide on <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link> covers drying without adding marks. If you're still deciding between the two approaches, compare <Link href={routes.wetOrDry} className="us-text-link">APGO's wet vs dry glaze routines</Link>.
            </p>

            <h3 style={h3}>6. Inspect the Paint in Good Light Before You Spray</h3>
            <p style={body}>
              Before the first spray, walk around the car and look at the paint from a few angles in soft, even light. You're looking for leftover water drops (if your product needs a dry car), spots the wash missed, residue from an old product, and fine scratches that were already there.
            </p>
            <p style={body}>
              Be realistic about what you find. Dirt, water spots, and scratches are three different problems. Dirt means another pass with the wash. Mineral water spots and existing scratches need their own fixes, and no spray finish should be expected to handle all three.
            </p>
            <p style={body}>
              Work in the shade, on paint that isn't hot to the touch. If you end up with streaks or haze after applying, see our guide to <Link href={routes.ceramicSprayStreaksHighSpots} className="us-text-link">fixing streaks or high spots after a spray finish</Link>.
            </p>
            <figure style={{ margin: 0 }}>
              <img
                src={INLINE_IMAGE}
                alt="Is your paint ready? Clean, smooth and wax-free"
                style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "contain", background: color.raised }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                Clean, smooth, wax-free: check all three before the first spray.
              </figcaption>
            </figure>
          </section>

          <section id="surfaces" style={section}>
            <h2 style={h2Balance}>Check Which Surfaces Your Product Allows</h2>
            <p style={body}>
              Prep also means confirming that every surface you plan to spray is one the current label allows. Stick to what's listed rather than assuming a spray works everywhere on the car.
            </p>
            <p style={body}>
              For <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link>, the surfaces are:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Atomic Colored Glaze (D204):</strong> paint, wraps, glass, and wheels. On the front windshield, remove any oil film first.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Atomic Glaze Coating (D215):</strong> paint and wraps. It is not recommended on the front windshield.
              </li>
            </ul>
            <p style={body}>
              Here, "wraps" means vinyl wrap. For any surface not on the list, check the current label or contact APGO support before you spray.
            </p>
          </section>

          <section id="skip-or-keep" style={section}>
            <h2 style={h2Balance}>What You Can Skip, and What You Can't</h2>
            <p style={body}>
              Not every step is needed every time. The decontamination steps depend on what you find, while cleaning, the wax check, and following the label never go away. Full paint correction usually isn't part of spray prep at all.
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Prep step</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>When you need it</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Can you skip it?</span>
              </div>
              {TABLE_SKIP.map((row) => (
                <Fragment key={row.step}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.step}</div>
                  <div style={tableCell}>{row.when}</div>
                  <div style={tableCell}>{row.skip}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              One more item belongs in the "can't skip" column: clean tools. A dirty wash mitt, drying towel, or application cloth can drag grit across paint you just spent time prepping.
            </p>
          </section>

          <section id="next-steps" style={section}>
            <h2 style={h2Balance}>Ready to Apply? Next Steps</h2>
            <p style={body}>
              Once the paint is prepped, switch to the directions for the product you're using. If that's APGO:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                For the dry routine, see <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link>.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                For the wet routine, see <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link>.
              </li>
            </ul>
            <p style={body}>
              D204 and D215 are alternative routines, not a two-product layering system, so contact APGO before combining them. If you haven't picked one yet, <Link href={routes.compare} className="us-text-link">compare APGO's spray glaze routines</Link>.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Can I apply a spray finish over wax?"
                ? <>Don't assume you can. Confirm what's on the paint or remove it first. APGO does not recommend applying D204 over an existing wax layer. For the full decision, see <Link href={routes.coatingOverWax} className="us-text-link">can you apply ceramic coating over wax</Link>.</>
                : item.q === "Should the car be wet or dry before I spray?"
                ? <>Follow your product's label. APGO's D204, a silicone-based spray glaze, goes on completely dry paint, while D215 goes on paint that is still wet from the final rinse. Our <Link href={routes.wetOrDry} className="us-text-link">wet or dry application</Link> guide explains the difference.</>
                : item.a
            }))} />
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["coatingOverWax", "wetOrDry", "coloredGlaze"]} />
      </main>
    </div>
  );
}
