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

const TITLE = "How to Remove Wax Before Ceramic Coating";
const H1 = "How to Remove Wax Before Ceramic Coating";
const CRUMB = "Remove wax first";
const DESCRIPTION = "How to remove wax before ceramic coating or a spray finish: gentle-to-heavy options, how to test first and protect trim, and how to check the wax is gone.";
const COVER = asset("generated/how-to-remove-wax-before-ceramic-coating-hero.png");
const HERO_ALT = "Hand wiping a car door with microfiber under raking garage light";
const INLINE_IMAGE = asset("generated/how-to-remove-wax-before-ceramic-coating-3-signs.png");

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.removeWaxFirst },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.removeWaxFirst,
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
    q: "Can I use dish soap to strip wax off a car?",
    a: "It isn't recommended. Use a wax-stripping car wash or a panel-prep product made for automotive paint, and follow its label.",
  },
  {
    q: "Will a regular car wash remove wax?",
    a: "Usually not completely. A mild, pH-neutral car shampoo is designed to clean without stripping protection, so it isn't built to remove wax.",
  },
  {
    q: "Do I need to polish to remove wax?",
    a: "Usually not. Polishing is the heaviest option, and it removes a thin layer of the surface along with the wax.",
  },
  {
    q: "What if there's an old ceramic or spray coating instead of wax?",
    a: "This guide covers wax only. For an old coating or an unknown product, ask that product's maker or contact APGO support.",
  },
  {
    q: "Can I just apply ceramic coating over the wax?",
    a: "That's a separate decision; our coating-over-wax checklist walks through it.",
  },
];

const TOC = [
  { href: "#why", label: "Why Wax Has to Come Off" },
  { href: "#signs", label: "Signs Wax May Still Be On" },
  { href: "#options", label: "Gentle to Heavy Options" },
  { href: "#precautions", label: "Test First and Protect Trim" },
  { href: "#confirm", label: "Confirm the Wax Is Gone" },
  { href: "#next", label: "What to Do Next" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_OPTIONS = [
  {
    option: "Wax-stripping car wash",
    strength: "Gentlest",
    best: "A single, ordinary layer of wax",
    watch: "Rinse thoroughly; follow the label",
  },
  {
    option: "Panel-prep wipe-down",
    strength: "Moderate",
    best: "After washing, panel by panel, to lift remaining residue",
    watch: "Use a product made for automotive paint; keep it off unpainted trim",
  },
  {
    option: "Polishing",
    strength: "Heaviest",
    best: "You're already planning to correct scratches or swirls",
    watch: "Removes a thin layer of the surface along with the wax",
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

export default function HowToRemoveWaxBeforeCeramicCoatingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.removeWaxFirst }),
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
          tagLabel="Wax removal"
          title={H1}
          lede={DESCRIPTION}
          readTime="7 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            You waxed the car last month, and this weekend you want to switch to a spray finish. The first thing in your way is the old wax. This guide covers how to remove wax before ceramic coating or any spray product: the gentle-to-heavy options, how to test and protect trim, and how to check that the wax is actually gone. Whether you need to remove it at all is a separate decision, covered in <Link href={routes.coatingOverWax} className="us-text-link">can you apply ceramic coating over wax</Link>; here we assume you've decided it has to come off. This guide deals with wax only, not old coatings or unknown products. Where APGO comes up, note that its products are a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="why" style={section}>
            <h2 style={h2Balance}>Why the Wax Has to Come Off First</h2>
            <p style={body}>
              A new protective product is designed to go onto clean paint. Wax is a sacrificial layer that sits in between, and when you spray over it, the common results are uneven application, haze, and a finish that doesn't last as long as it should.
            </p>
            <p style={body}>
              APGO is a good example of a maker that says so directly: APGO does not recommend applying Atomic Colored Glaze (D204), a silicone-based spray glaze, over an existing wax layer.
            </p>
          </section>

          <section id="signs" style={section}>
            <h2 style={h2Balance}>Signs Wax May Still Be on Your Paint</h2>
            <p style={body}>
              None of these is proof on its own, but together they're a reasonable guide:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Your maintenance history.</strong> You waxed recently, or you bought the car after it was detailed and don't know what was used.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>How water behaves.</strong> On a freshly washed car, water forms especially tight, round, dense beads. Spray protection repels water too, though, so treat this as a clue rather than a verdict.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>How the paint feels and looks when you wipe it.</strong> A clean microfiber towel drags or feels greasy, or you see uneven gloss or smeared residue in good light.
              </li>
            </ul>
            <figure style={{ margin: 0 }}>
              <img
                src={INLINE_IMAGE}
                alt="Signs wax may still be on your car paint"
                style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "contain", background: color.raised }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                Clues, not proof: check all three before you choose a removal method.
              </figcaption>
            </figure>
          </section>

          <section id="options" style={section}>
            <h2 style={h2Balance}>How to Remove Wax Before Ceramic Coating: Gentle to Heavy Options</h2>
            <p style={body}>
              When it comes to how to remove wax from car paint, work from gentle to heavy. If a gentler option does the job, there's no reason to jump to a stronger one.
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Option</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>How strong</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Best when</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Watch out for</span>
              </div>
              {TABLE_OPTIONS.map((row) => (
                <Fragment key={row.option}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.option}</div>
                  <div style={tableCell}>{row.strength}</div>
                  <div style={tableCell}>{row.best}</div>
                  <div style={tableCell}>{row.watch}</div>
                </Fragment>
              ))}
            </div>

            <h3 style={h3}>Option 1: A Wax-Stripping Car Wash</h3>
            <p style={body}>
              If you're wondering how to strip wax off a car with the least effort, start here. A wax-stripping car wash is a shampoo formulated to break down wax. Wash the car the way you normally would, following that product's label, then rinse thoroughly. It suits a car with a single, ordinary layer of wax and anyone who wants to start with the mildest approach. The wash routine itself is covered in <Link href={routes.washCoatedCar} className="us-text-link">how to wash a ceramic coated car</Link>.
            </p>
            <p style={body}>
              Skip dish soap; use a product designed for automotive paint instead.
            </p>

            <h3 style={h3}>Option 2: A Panel-Prep Wipe-Down</h3>
            <p style={body}>
              After washing, a panel-prep product can lift the oils and wax residue a wash leaves behind. Work one panel at a time with two clean towels: one to wipe the product across the panel, and a second to pick up what it loosens. Use a product made for automotive paint and follow its label; this guide doesn't give mixing ratios for any solvent.
            </p>

            <h3 style={h3}>Option 3: Polishing (the Heaviest Option)</h3>
            <p style={body}>
              Polishing does remove wax, but it removes a very thin layer of the surface along with it. That makes it a poor choice purely for wax removal. It usually only makes sense when you were already planning to correct scratches or swirl marks. If you haven't polished paint before, leave this step to someone experienced.
            </p>
          </section>

          <section id="precautions" style={section}>
            <h2 style={h2Balance}>Test First and Protect Your Trim</h2>
            <p style={body}>
              Before you work on the whole car, keep these precautions in mind:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Test a small spot first.</strong> Try any stripping or prep product on an inconspicuous area before you commit to a full panel.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Keep products off trim.</strong> Don't let wax-stripping or prep products sit on unpainted plastic or rubber trim; follow the product's label.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Check special surfaces.</strong> For vinyl wrap or any unusual surface, read that surface's care instructions first.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Work in the shade.</strong> Keep the car out of direct sun and work on paint that isn't hot to the touch.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Use clean tools.</strong> Clean towels and a clean wash mitt keep grit from being dragged across the paint.
              </li>
            </ul>
          </section>

          <section id="confirm" style={section}>
            <h2 style={h2Balance}>How to Confirm the Wax Is Gone</h2>
            <p style={body}>
              Once the car is washed, rinsed, and dried again, check it three ways:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Look at the gloss.</strong> In good light, the finish should look even, with no streaks, smears, or patchy spots.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Watch the water.</strong> Water behavior usually changes once wax is gone. Beads may look less round and tight, but treat this as a clue, not proof.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Feel the wipe.</strong> A clean towel should glide without a greasy or oily drag.
              </li>
            </ul>
            <p style={body}>
              Be honest about the limits here. None of these is a lab test, and removing the wax doesn't guarantee the paint is compatible with any particular product. The label on the product you plan to use has the final say. If you're unsure, ask that product's maker, and for APGO products, contact APGO support.
            </p>
          </section>

          <section id="next" style={section}>
            <h2 style={h2Balance}>What to Do Next</h2>
            <p style={body}>
              With the wax gone, finish the rest of your prep, including washing, decontamination, and drying or leaving the paint wet as your label says; see <Link href={routes.prepForSpray} className="us-text-link">how to prep your car for ceramic spray</Link>. Then apply your product according to its label.
            </p>
            <p style={body}>
              If you're using APGO Atomic Colored Glaze (D204), a silicone-based spray glaze applied after the car is washed and completely dried, follow <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link>. D204 and APGO Atomic Glaze Coating (D215), a silicone-based spray glaze applied to wet paint, are alternative routines, not a two-product layering system, so contact APGO before combining them. You can compare both on <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link> page.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Can I just apply ceramic coating over the wax?"
                ? <>That's a separate decision; our <Link href={routes.coatingOverWax} className="us-text-link">coating-over-wax checklist</Link> walks through it.</>
                : item.a
            }))} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Remove wax from gentle to heavy: a wax-stripping car wash first, a panel-prep wipe-down if residue remains, and polishing only if you were already planning to correct the paint. Test first, protect your trim, confirm with light and touch, then follow the label of the product you're applying next. If you're still deciding whether to move from wax to a spray finish at all, see <Link href={routes.waxVsSprayCoating} className="us-text-link">car wax vs spray ceramic coating</Link>.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["coatingOverWax", "waxVsSprayCoating", "coloredGlaze"]} />
      </main>
    </div>
  );
}
