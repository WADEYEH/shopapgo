import Link from "next/link";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import FaqList from "@/components/us/guides/FaqList";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd, faqLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color } from "@/lib/us/tokens";
import { h2, h2Balance, h2Faq, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "What Is Spray Ceramic Coating? How It Works";
const H1 = "What Is Spray Ceramic Coating? How It Works and What It Won't Do";
const CRUMB = "What is spray ceramic";
const DESCRIPTION = "What is spray ceramic coating? Learn how ceramic spray works on paint, what it won't do, like fix scratches or stop rock chips, and why the label matters most.";
const COVER = asset("generated/what-is-spray-ceramic-coating-hero.png");
const HERO_ALT = "Fine mist settling on dark glossy car paint in soft side light";
const INLINE_IMAGE = asset("generated/what-is-spray-ceramic-coating-does-wont.png");

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.whatIsSprayCeramic },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.whatIsSprayCeramic,
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
    q: "Is ceramic spray a real ceramic coating?",
    a: "It's the spray form of the ceramic category. Compared with a bottled liquid coating, it differs in form, prep, and what you can expect from it; ceramic spray vs ceramic coating walks through the differences.",
  },
  {
    q: "Does ceramic spray remove scratches?",
    a: "No. It isn't paint correction, so existing scratches and swirl marks stay where they are.",
  },
  {
    q: "How long does spray ceramic coating last?",
    a: "It depends on the product's label and on how you wash and where you drive. Watch the paint's signals to decide when to reapply a spray coating.",
  },
  {
    q: "Can you put ceramic spray over wax?",
    a: "Don't assume you can. Confirm what's on the paint or remove old wax first; our coating-over-wax checklist walks through the decision.",
  },
  {
    q: "Is ceramic spray better than wax?",
    a: "They're different finishing strategies with different trade-offs. Our car wax vs spray ceramic coating guide compares them.",
  },
];

const TOC = [
  { href: "#what-is", label: "What Is Spray Ceramic Coating?" },
  { href: "#how-it-works", label: "How Does Ceramic Spray Work?" },
  { href: "#wont-do", label: "What It Won't Do" },
  { href: "#methods", label: "\"Spray-On\" Doesn't Mean One Method" },
  { href: "#apgo", label: "Where APGO Fits" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

export default function WhatIsSprayCeramicCoatingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.whatIsSprayCeramic }),
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
          tagLabel="Understanding ceramics"
          title={H1}
          lede={DESCRIPTION}
          readTime="7 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            "Ceramic" is printed on almost everything in the car-care aisle now, from quick sprays to full kits. So what is spray ceramic coating, exactly, and how is it different from everything else wearing the same word? This guide explains what the category is, how it works on your paint, and, just as important, what it won't do. It isn't a product ranking or an application tutorial. It's a plain-English definition you can use before you buy anything or read another label. One note up front: APGO, which comes up near the end, makes a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="what-is" style={section}>
            <h2 style={h2Balance}>What Is Spray Ceramic Coating?</h2>
            <p style={body}>
              Spray ceramic coating is a ceramic-type paint protection product sold in spray form. You apply it to a clean car, spread it, and usually buff it, following the directions on the label. The goal is paint that feels slicker, sheds water more readily, stays cleaner between washes, and looks glossier. Most spray ceramics are designed for DIY use: a driver, a few clean towels, and some time after a regular wash, with no machine polisher or shop appointment required.
            </p>
            <p style={body}>
              If you've looked up what is ceramic spray for cars, you've probably seen the same idea under several names: ceramic spray, spray ceramic coating, ceramic detail spray, and more. The names aren't standardized, so the directions on a specific label tell you more than the name on the front of the bottle.
            </p>
            <p style={body}>
              Spray ceramics belong to the same broad family as bottled liquid ceramic coatings, but the form, the prep, and what you can expect from them are different. We compare the two directly in <Link href={routes.sprayVsCoating} className="us-text-link">ceramic spray vs ceramic coating</Link>. For where sprays sit among all the other ways to protect paint, see <Link href={routes.paintProtectionTypes} className="us-text-link">types of car paint protection</Link>.
            </p>
          </section>

          <section id="how-it-works" style={section}>
            <h2 style={h2Balance}>How Does Ceramic Spray Work?</h2>
            <p style={body}>
              The details vary by brand, but most products in the category work along the same lines:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A carrier plus protective ingredients.</strong> The liquid combines solvents or carriers with the protective ingredients. When you spray and spread it, the carrier evaporates and leaves a very thin film on top of the clear coat.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Ceramic-type chemistry.</strong> Products in the ceramic category are typically marketed on silica-based chemistry. The exact formula varies from brand to brand, and labels don't always spell it out.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A slicker surface.</strong> That thin film is designed to make the surface slicker, so water beads up or sheets off more easily and dirt has a harder time sticking. The practical payoff is easier washing and a boost in gloss.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A settling period.</strong> Many products ask you to keep the car dry, or let the layer cure, for a while after application. How long depends entirely on the product, so check its label.
              </li>
            </ul>
            <p style={body}>
              Read every claim in this category with "designed to" and "typically" in mind. Results depend on prep, washing habits, and weather, not only on what's in the bottle.
            </p>
            <p style={body}>
              Why does it wear off? The film is thin by design, which is what makes a spray quick to apply and easy to redo. That same thinness means washing, road grime, and weather gradually wear it away, so sprays are best treated as a repeatable routine rather than a one-time job.
            </p>
          </section>

          <section id="wont-do" style={section}>
            <h2 style={h2Balance}>What Spray Ceramic Coating Won't Do</h2>
            <p style={body}>
              This is where expectations and marketing most often drift apart. A spray ceramic coating:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Won't fix scratches, swirl marks, or oxidation.</strong> It isn't paint correction. Marks that were there before you sprayed will still be there afterward.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Won't last forever.</strong> Washing, weather, and friction wear it down gradually. When to redo it depends on the paint's signals and the label, not on a universal number; our guide on <Link href={routes.howOftenReapply} className="us-text-link">how often to apply ceramic spray coating</Link> covers the signals.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Won't make paint scratch-proof or chip-proof.</strong> It's a very thin film, not a physical barrier against rock chips or scrapes.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Usually isn't meant to go over old wax or unknown products.</strong> Confirm what's on the paint, or remove it, before you spray. For the full decision, see <Link href={routes.coatingOverWax} className="us-text-link">can you apply ceramic coating over wax</Link>.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Won't replace washing.</strong> A protected car still gets dirty. It just tends to wash clean more easily.
              </li>
            </ul>
            <p style={body}>
              How long any particular spray lasts is set by its own label and your conditions, which is why this guide doesn't quote a number.
            </p>
            <figure style={{ margin: 0 }}>
              <img
                src={INLINE_IMAGE}
                alt="What spray ceramic coating does and what it won't do"
                style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "contain", background: color.raised }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                A thin, redoable layer, not paint correction and not armor.
              </figcaption>
            </figure>
          </section>

          <section id="methods" style={section}>
            <h2 style={h2Balance}>"Spray-On" Doesn't Mean One Method</h2>
            <p style={body}>
              It's easy to assume every spray product works the same way. It doesn't. Some are applied to fully dried paint, while others are designed to go on right after the rinse, while the paint is still wet. Some need a buff and some don't. The words "spray-on" won't tell you whether the paint should be wet or dry, or whether to buff afterward. The same goes for surfaces: one label may list paint only, while another adds glass, trim, or wheels. Stick to what your label lists.
            </p>
            <p style={body}>
              So read the label before you open the bottle, and don't carry one product's routine over to another. For the moments between washing the car and applying anything, see <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>.
            </p>
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2Balance}>Want Something Simpler? Where APGO Fits</h2>
            <p style={body}>
              If what you want is a quick finishing step after a wash, and you don't specifically need a ceramic product, APGO makes a silicone-based spray glaze. It is not a ceramic coating, and it isn't part of the spray ceramic category.
            </p>
            <p style={body}>
              APGO Atomic Colored Glaze (D204) is applied after the car is washed and completely dried. APGO Atomic Glaze Coating (D215) is applied after washing and rinsing, while the paint is still wet; "Coating" is part of the product name, not a sign that it's a ceramic coating. D204 lasts up to about 6 months (180 days), and D215 lasts up to about 4 months (120 days). Both figures are ceilings, not promises.
            </p>
            <p style={body}>
              You can compare <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link> options side by side, and our guide to <Link href={routes.wetOrDry} className="us-text-link">APGO's wet vs dry glaze routines</Link> helps you pick between them. If you're curious what sets a glaze apart as a category, start with <Link href={routes.whatIsCarGlaze} className="us-text-link">what car glaze is</Link>.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Is ceramic spray a real ceramic coating?"
                ? <>It's the spray form of the ceramic category. Compared with a bottled liquid coating, it differs in form, prep, and what you can expect from it; <Link href={routes.sprayVsCoating} className="us-text-link">ceramic spray vs ceramic coating</Link> walks through the differences.</>
                : item.q === "How long does spray ceramic coating last?"
                ? <>It depends on the product's label and on how you wash and where you drive. Watch the paint's signals to decide <Link href={routes.howOftenReapply} className="us-text-link">when to reapply a spray coating</Link>.</>
                : item.q === "Can you put ceramic spray over wax?"
                ? <>Don't assume you can. Confirm what's on the paint or remove old wax first; our <Link href={routes.coatingOverWax} className="us-text-link">coating-over-wax checklist</Link> walks through the decision.</>
                : item.q === "Is ceramic spray better than wax?"
                ? <>They're different finishing strategies with different trade-offs. Our <Link href={routes.waxVsSprayCoating} className="us-text-link">car wax vs spray ceramic coating</Link> guide compares them.</>
                : item.a
            }))} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Spray ceramic coating is a thin, redoable layer designed to make paint slicker, easier to wash, and glossier. It won't fix scratches, it isn't permanent, and it shouldn't be stacked on whatever is already on the paint. Pick a product, then use it exactly the way its label says.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["sprayVsCoating", "prepForSpray", "waxVsSprayCoating"]} />
      </main>
    </div>
  );
}
