import { Fragment } from "react";
import Link from "next/link";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import FaqList from "@/components/us/guides/FaqList";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd, faqLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Balance, h2Faq, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "What Is Car Glaze? Glaze vs Wax vs Sealant";
const H1 = "What Is Car Glaze? Glaze vs Wax vs Sealant, Explained";
const CRUMB = "What is car glaze";
const DESCRIPTION = "What is car glaze? See how traditional glaze differs from polish, wax and sealant, how glaze differs from ceramic, and what APGO means by a spray glaze.";
const COVER = asset("generated/what-is-car-glaze-hero.png");
const HERO_ALT = "Deep reflective car paint mirroring the sky at sunset";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.whatIsCarGlaze },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.whatIsCarGlaze,
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
    q: "Is car glaze better than wax?",
    a: "Traditionally, they do different things. Glaze is about appearance and wax is about protection, so the better choice depends on what you want from the product.",
  },
  {
    q: "Does car glaze protect paint?",
    a: "A traditional filler glaze usually offers limited protection. APGO's silicone-based spray glaze is rated to last up to about 6 months for D204 and about 4 months for D215, and those figures are ceilings, not promises.",
  },
  {
    q: "Does glaze hide scratches?",
    a: "A traditional glaze can make fine marks less visible for a while. APGO's D204 doesn't fill or remove existing scratches or swirl marks.",
  },
  {
    q: "Is \"Colored Glaze\" a tinted or colored product?",
    a: "No. \"Colored\" was translated from the product's Chinese name and refers to a glass-like glaze sheen, not a tint.",
  },
  {
    q: "Is glaze the same as ceramic coating?",
    a: "No. Glaze and ceramic are different categories, and APGO's products are a silicone-based spray glaze.",
  },
];

const TOC = [
  { href: "#what-is", label: "What Is Car Glaze?" },
  { href: "#vs-polish", label: "Glaze vs Polish" },
  { href: "#vs-wax-sealant", label: "Glaze vs Wax and Sealant" },
  { href: "#vs-ceramic", label: "Glaze vs Ceramic" },
  { href: "#apgo", label: "APGO's Spray Glaze" },
  { href: "#why-glaze", label: "Why APGO Calls It \"Glaze\"" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_COMPARE = [
  {
    product: "Polish",
    mainJob: "Removes a thin layer to correct defects",
    corrects: "Yes",
    protection: "None on its own",
  },
  {
    product: "Glaze (traditional)",
    mainJob: "Adds gloss and depth; fills fine marks temporarily",
    corrects: "No; it can hide them for a while",
    protection: "Limited",
  },
  {
    product: "Wax",
    mainJob: "Adds a glossy protective layer",
    corrects: "No",
    protection: "Sacrificial protective layer",
  },
  {
    product: "Sealant",
    mainJob: "Adds a synthetic protective layer",
    corrects: "No",
    protection: "Sacrificial protective layer, generally positioned as longer-lasting than wax",
  },
];

const TABLE_APGO = [
  {
    attr: "Type",
    d204: "Silicone-based spray glaze",
    d215: "Silicone-based spray glaze",
  },
  {
    attr: "Applied on",
    d204: "Completely dry paint, after washing",
    d215: "Wet paint, right after washing and rinsing",
  },
  {
    attr: "Bottle size",
    d204: "300 mL / 10.1 fl oz",
    d215: "200 mL / 6.8 fl oz",
  },
  {
    attr: "Durability",
    d204: "Up to about 6 months (180 days)",
    d215: "Up to about 4 months (120 days)",
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

export default function WhatIsCarGlazePage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.whatIsCarGlaze }),
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
          tagLabel="Understanding glaze"
          title={H1}
          lede={DESCRIPTION}
          readTime="7 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            In the US, "glaze" usually means a product that makes paint look great for a while but doesn't do much to protect it. Then you come across products that call themselves a glaze and mean something a little different. So what is car glaze, really? This guide starts with the traditional definition and how glaze differs from polish, wax, and sealant. Then it explains how glaze differs from ceramic, and why APGO, whose products are a silicone-based spray glaze, calls them "Glaze."
          </p>

          <section id="what-is" style={section}>
            <h2 style={h2Balance}>What Is Car Glaze?</h2>
            <p style={body}>
              Traditionally, car glaze is an appearance product. Many US detailing brands describe glaze as something that adds gloss and depth to paint, often using oils or fillers that temporarily make fine swirls and light scratches less visible. That's a description of the traditional category, not of any one product. The protection a traditional glaze offers is usually limited, which is why detailers have long topped it with a layer of wax or sealant.
            </p>
            <p style={body}>
              The word itself isn't standardized, though. Different brands use "glaze" for different things, so the product's own label tells you more than the category name does.
            </p>
          </section>

          <section id="vs-polish" style={section}>
            <h2 style={h2Balance}>Car Glaze vs Polish</h2>
            <p style={body}>
              Car glaze vs polish is the comparison people mix up most. A polish is abrasive: it removes a very thin layer of the surface to correct defects such as swirl marks and light scratches. A traditional glaze doesn't remove anything. It fills and enhances, and the effect is temporary. Once the fillers wash away, the defects underneath are still there.
            </p>
            <p style={body}>
              In a traditional detailing sequence, the order is polish first to correct, then an optional glaze to enhance, then wax or sealant to protect. That's also why a traditional glaze is sometimes used when someone wants paint to look its best quickly, without taking any clear coat off.
            </p>
          </section>

          <section id="vs-wax-sealant" style={section}>
            <h2 style={h2Balance}>Car Glaze vs Wax and Sealant</h2>
            <p style={body}>
              Wax and sealant have a different job: protection. Wax, in its natural or blended forms, and sealant, a synthetic polymer, both leave a sacrificial layer that wears away gradually as the car is washed and driven. A traditional glaze's role is appearance, and it usually relies on one of them for protection. Some modern products blur these lines by combining gloss and protection in one step, which is another reason to read the label rather than rely on the category name.
            </p>
            <p style={body}>
              Here's how the four traditional categories compare:
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                fontSize: 15,
                lineHeight: 1.4,
                overflow: "auto",
              }}
            >
              <div style={tableHead(color.tertiary)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Product (traditional categories)</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Main job</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Corrects defects?</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Protection role</span>
              </div>
              {TABLE_COMPARE.map((row) => (
                <Fragment key={row.product}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.product}</div>
                  <div style={tableCell}>{row.mainJob}</div>
                  <div style={tableCell}>{row.corrects}</div>
                  <div style={tableCell}>{row.protection}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              For a practical look at the time and steps involved in wax compared with a spray finish, see <Link href={routes.waxVsSprayCoating} className="us-text-link">car wax vs spray ceramic coating</Link>.
            </p>
          </section>

          <section id="vs-ceramic" style={section}>
            <h2 style={h2Balance}>Glaze vs Ceramic: Two Different Categories</h2>
            <p style={body}>
              Ceramic products, whether sprays or liquid coatings, are typically marketed on silica-based chemistry, and durability is usually their headline claim. How long a given ceramic product lasts depends on that product and on the prep, so its label is the place to check.
            </p>
            <p style={body}>
              Glaze is a separate category. The APGO products covered below are a silicone-based spray glaze, not a ceramic coating. For the full range of options beyond glaze and ceramic, see <Link href={routes.paintProtectionTypes} className="us-text-link">types of car paint protection</Link>.
            </p>
            <p style={body}>
              For how a ceramic spray compares with a liquid ceramic coating, see <Link href={routes.sprayVsCoating} className="us-text-link">ceramic spray vs ceramic coating</Link>.
            </p>
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2Balance}>APGO's Silicone-Based Spray Glaze</h2>
            <p style={body}>
              APGO makes two products in this category. Both are a silicone-based spray glaze. The main difference is where they fit in your wash.
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}></span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Atomic Colored Glaze (D204)</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Atomic Glaze Coating (D215)</span>
              </div>
              {TABLE_APGO.map((row) => (
                <Fragment key={row.attr}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.attr}</div>
                  <div style={tableCell}>{row.d204}</div>
                  <div style={tableCell}>{row.d215}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              Both durability figures are ceilings, not promises. D215 goes onto the still-wet paint: you spread it with a damp application cloth, towel-dry the car, then buff with a clean coral-fleece microfiber towel. The word "Coating" is part of D215's name; it doesn't mean the product is a ceramic coating. Bottle size also doesn't tell you how many applications you'll get from either one.
            </p>
            <p style={body}>
              The key difference from a traditional glaze is what D204 doesn't do: it doesn't fill or remove existing scratches or swirl marks. It isn't a filler glaze in the traditional sense.
            </p>
            <p style={body}>
              The two products are alternative routines, not a two-product layering system, so contact APGO before combining them. You can <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link> options, and for the routines themselves, see <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link> and <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link>. If you're unsure which suits you, start with <Link href={routes.wetOrDry} className="us-text-link">choosing between APGO's wet and dry glaze routines</Link>.
            </p>
            <p style={body}>
              Before you apply either one, see <Link href={routes.prepForSpray} className="us-text-link">how to prep your car for ceramic spray</Link>.
            </p>
          </section>

          <section id="why-glaze" style={section}>
            <h2 style={h2Balance}>Why APGO Calls It "Glaze"</h2>
            <p style={body}>
              The name Atomic Colored Glaze is a translation of the product's original Chinese name. In that name, "Colored" describes a glass-like, glazed sheen: the deep, glassy luster you'd expect from a glazed surface. It doesn't mean the product is tinted, adds color, or color-matches your paint, and it isn't meant to cover up marks. In short, the word describes the kind of sheen, not a color.
            </p>
            <p style={body}>
              "Glaze," in APGO's naming, refers to that glass-like finishing layer. It's a silicone-based spray glaze, not a ceramic coating. And unlike a traditional filler glaze, D204 doesn't fill or remove existing scratches or swirl marks, so the sheen comes from the finishing layer on paint that is already clean, not from hiding defects.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Does car glaze protect paint?"
                ? <><Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link> is rated to last up to about 6 months for D204 and about 4 months for D215, and those figures are ceilings, not promises. A traditional filler glaze usually offers limited protection.</>
                : item.a
            }))} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              In traditional usage, "glaze" means an appearance product that fills and enhances. APGO's "Glaze" means something narrower: a silicone-based spray glaze that leaves a glass-like finishing layer and isn't a ceramic coating, and D204 doesn't fill or remove existing scratches. Whatever the name on the bottle, read what the product says it does before deciding where it fits in your routine.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["paintProtectionTypes", "whatIsSprayCeramic", "coloredGlaze"]} />
      </main>
    </div>
  );
}
