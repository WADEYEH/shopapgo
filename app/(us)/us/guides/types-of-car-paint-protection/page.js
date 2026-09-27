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

const TITLE = "Types of Car Paint Protection: Wax to PPF";
const H1 = "Types of Car Paint Protection: Wax, Sealant, Spray Glaze, Ceramic & PPF";
const CRUMB = "Types of paint protection";
const DESCRIPTION = "Compare the types of car paint protection: wax, sealant, spray glaze, spray ceramic, ceramic coating and PPF, by effort, how you renew it and who it suits.";
const COVER = asset("generated/types-of-car-paint-protection-hero.png");
const HERO_ALT = "Glossy car hood with water beads in a driveway at golden hour";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.paintProtectionTypes },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.paintProtectionTypes,
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
    q: "What is the best way to protect car paint?",
    a: "There is no single best option. Match your choice to how much time you will spend after a wash, how often you are willing to redo it, and what you want protection from. The four questions above will narrow it down.",
  },
  {
    q: "Is spray glaze the same as spray ceramic coating?",
    a: "No. They are different categories, and a silicone-based spray glaze is not a ceramic product. If a glaze routine is what you want, APGO's silicone-based spray glaze comes in a dry-application version (D204) and a wet-application version (D215).",
  },
  {
    q: "Which type of paint protection lasts the longest?",
    a: "The heavier commitments, professional coatings and PPF, are generally the ones sold as long-term protection, but check the maker's label or the shop's written terms for what is actually covered. Spray glazes are redoable routines instead. APGO's D204, for example, lasts up to about 6 months, and that figure is a ceiling, not a promise.",
  },
  {
    q: "Can I layer wax, sealant and a spray coating together?",
    a: "Don't assume you can. Check each product's label or ask its maker. APGO does not recommend applying D204 over an existing wax layer. Our coating-over-wax checklist helps you decide what to do first.",
  },
];

const TOC = [
  { href: "#at-a-glance", label: "Types at a Glance" },
  { href: "#six-options", label: "The Six Options, Explained" },
  { href: "#how-to-choose", label: "How to Choose" },
  { href: "#common-ground", label: "What Every Type Has in Common" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_GLANCE = [
  {
    option: "Car wax",
    whatItIs: "A traditional paste or liquid layer on top of the paint",
    effort: "Hands-on: apply, wait, wipe off, often panel by panel",
    renew: "Reapply at home, usually more often than the other options",
    bestFor: "Owners who enjoy waxing as a ritual",
  },
  {
    option: "Paint sealant",
    whatItIs: "A synthetic polymer layer applied much like wax",
    effort: "Similar to wax",
    renew: "Reapply at home, typically less often than wax",
    bestFor: "Drivers who want a step up from wax without a coating",
  },
  {
    option: "Spray glaze",
    whatItIs: "A thin spray-on finishing layer added after a wash",
    effort: "Quick, after a wash",
    renew: "Redo at home when it fades",
    bestFor: "Drivers who want an easy, repeatable finishing step",
  },
  {
    option: "Spray ceramic coating",
    whatItIs: "A spray-on product sold on ceramic chemistry",
    effort: "Spray, spread, buff; rules vary by brand",
    renew: "Redo at home per the label",
    bestFor: "DIYers who want a ceramic product without a full coating job",
  },
  {
    option: "Liquid or pro ceramic coating",
    whatItIs: "A bottled coating applied by you or a detailer",
    effort: "Heavy: thorough prep and a strict application process",
    renew: "Years-scale package; check the maker's or shop's terms",
    bestFor: "Owners willing to invest in prep or pay a shop",
  },
  {
    option: "Paint protection film (PPF)",
    whatItIs: "A clear physical film applied over the paint",
    effort: "Shop install",
    renew: "Handled by the installer",
    bestFor: "Owners most concerned about chips and scuffs",
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

export default function TypesOfCarPaintProtectionPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.paintProtectionTypes }),
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
          tagLabel="Paint protection"
          title={H1}
          lede={DESCRIPTION}
          readTime="8 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            The car is clean, and the shelf in front of you is full of words: wax, sealant, glaze, ceramic, film. This guide puts the main types of car paint protection on one page so you can see what each one is, how much work it takes, how you renew it, and who it suits. Think of it as a map of your car paint protection options, not a product review and not an application tutorial. Where two options deserve a closer head-to-head, we link to the guide that covers it. APGO comes up in one place, the spray glaze section: APGO makes a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="at-a-glance" style={section}>
            <h2 style={h2Balance}>Types of Car Paint Protection at a Glance</h2>
            <p style={body}>
              The descriptions are qualitative on purpose. Results depend on the product, the prep, and how the car is washed and stored, so the table leaves out months, years, and prices.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>What it is</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Effort to apply</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>How you renew it</span>
              </div>
              <div style={tableHead(color.tertiary)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Best for</span>
              </div>
              {TABLE_GLANCE.map((row) => (
                <Fragment key={row.option}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.option}</div>
                  <div style={tableCell}>{row.whatItIs}</div>
                  <div style={tableCell}>{row.effort}</div>
                  <div style={tableCell}>{row.renew}</div>
                  <div style={tableCell}>{row.bestFor}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              Broadly, the options that ask for the biggest up-front commitment, such as careful prep or a shop appointment, are the ones sold as longer-term protection, while the at-home options are built to be refreshed. None of them is permanent, and none of them means you can stop washing the car.
            </p>
          </section>

          <section id="six-options" style={section}>
            <h2 style={h2}>The Six Options, Explained</h2>
            <p style={body}>
              Each option below answers the same three questions: what it is, how much work it takes, and who it fits.
            </p>

            <h3 style={h3}>Car Wax</h3>
            <p style={body}>
              Car wax is the classic finish: a paste or liquid you apply, let sit, and wipe off, often one panel at a time. It gives paint a warm, deep look, but it is a sacrificial layer, so it usually asks for more frequent touch-ups than the other options here. Wax suits people who treat waxing as a hobby and happily set aside a block of time for it. If you are weighing it against a quicker spray finish, our <Link href={routes.waxVsSprayCoating} className="us-text-link">car wax vs spray ceramic coating</Link> guide compares the time and steps side by side.
            </p>

            <h3 style={h3}>Paint Sealant</h3>
            <p style={body}>
              A paint sealant is a synthetic polymer layer. You apply it much like wax, spreading it on and wiping it off, but sealants are generally positioned as longer-lasting than traditional wax. They fit drivers who want fewer redos than wax asks for, without stepping up to a coating.
            </p>

            <h3 style={h3}>Spray Glaze</h3>
            <p style={body}>
              Spray glaze is a light finishing step you add after a wash: you spray it on, spread it, and buff it to a thin layer. Because it is meant to be redone, it does not need a dedicated day on the calendar. Traditional glazes are generally about appearance, adding gloss and a slick feel; for the full definition, see our guide to <Link href={routes.whatIsCarGlaze} className="us-text-link">what car glaze actually is</Link>.
            </p>
            <p style={body}>
              Both of <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link> products sit in this category. APGO Atomic Colored Glaze (D204) is a silicone-based spray glaze applied after the car is washed and completely dried. It lasts up to about 6 months (180 days), which is a ceiling rather than a promise, and it is suitable for paint, wraps, glass, and wheels. APGO Atomic Glaze Coating (D215) is a silicone-based spray glaze applied after washing and rinsing, while the paint is still wet. It lasts up to about 4 months (120 days), and it is suitable for paint and wraps. Despite the word "Coating" in its name, D215 is a glaze, not a ceramic coating.
            </p>
            <p style={body}>
              The two are alternative routines, not a layering system, so contact APGO before combining them. APGO also does not recommend applying D204 over an existing wax layer. Not sure which fits your wash? See our guide to <Link href={routes.wetOrDry} className="us-text-link">choosing between APGO's wet and dry glaze routines</Link>.
            </p>

            <h3 style={h3}>Spray Ceramic Coating</h3>
            <p style={body}>
              Spray ceramic coating is the spray-on branch of the ceramic category. These products are marketed on ceramic chemistry, which is typically silica-based, and they usually go on the same way: spray, spread, buff. The exact form and rules depend on each brand's label, and so does how long a given product lasts. They suit DIYers who want a ceramic product without booking a full coating job. For a fuller explanation, see our guide on <Link href={routes.whatIsSprayCeramic} className="us-text-link">what spray ceramic coating is</Link>.
            </p>
            <p style={body}>
              Spray glaze and spray ceramic are different categories, even when the application looks similar. A silicone-based spray glaze is not a ceramic product. For timing either way, see <Link href={routes.howOftenReapply} className="us-text-link">how often to reapply a spray coating</Link>.
            </p>

            <h3 style={h3}>Liquid or Professional Ceramic Coating</h3>
            <p style={body}>
              This is the bottled, liquid form of ceramic coating. You can apply it yourself with a DIY kit or have a detailer do it. Either way, the prep is demanding and the application process is less forgiving than a spray. Durability is often sold as a years-scale package, so check that maker's label or the shop's written terms rather than assuming a number. It fits owners who will invest in careful prep, or who would rather pay a shop to own it. If you are deciding who should do the work, see <Link href={routes.diyVsPro} className="us-text-link">DIY ceramic coating vs professional</Link>. The practical differences between the spray and liquid forms are covered in <Link href={routes.sprayVsCoating} className="us-text-link">ceramic spray vs ceramic coating</Link>.
            </p>

            <h3 style={h3}>Paint Protection Film (PPF)</h3>
            <p style={body}>
              Paint protection film is a clear, physical film applied over the paint, usually by a professional installer. Its main job is to take physical hits such as rock chips, scrapes, and scuffs, which a wipe-on layer is not designed to stop, and it is the most involved option here. PPF is also not the same thing as a vinyl wrap: a wrap is mainly about color and style, while PPF is a protective film. Before adding any spray product on top of film, check that product's label or ask its maker.
            </p>
          </section>

          <section id="how-to-choose" style={section}>
            <h2 style={h2Balance}>How to Choose the Best Way to Protect Car Paint</h2>
            <p style={body}>
              There is no single best way to protect car paint for every driver. The right choice depends more on your habits than on any label, so answer these four questions honestly:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>How much time will you spend after each wash?</strong> If it is a few minutes, a spray finish fits. If you enjoy a longer session, wax or sealant can work. If you would rather hand the job to someone else, look at a professional coating or PPF.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>How often are you willing to redo it?</strong> The at-home options are built to be repeated when they fade. Professional coatings and film are longer-term commitments with a bigger up-front ticket.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>What matters most to you?</strong> Gloss and appearance, easier washing, and protection from physical impacts are different goals, and they point to different options.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>What is already on the paint?</strong> Old wax or an unknown product changes what you can put on next, so find out before you add anything.
              </li>
            </ul>
            <p style={body}>
              That last question matters because protection products are not automatically compatible. Don't assume you can stack one on another. Follow each product's label, and ask the maker if you are unsure. APGO does not recommend applying D204 over an existing wax layer, and D204 and D215 are alternative routines rather than a two-product system. If wax is already on the paint, read <Link href={routes.coatingOverWax} className="us-text-link">can you apply ceramic coating over wax</Link> before you choose your next step.
            </p>
          </section>

          <section id="common-ground" style={section}>
            <h2 style={h2Balance}>What Every Type of Paint Protection Has in Common</h2>
            <p style={body}>
              Every option on this list shares a few ground rules:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>They all need clean paint.</strong> Every option works best on a properly washed, contaminant-free surface. Prep is a topic of its own, covered in <Link href={routes.prepForSpray} className="us-text-link">how to prep your car for a spray finish</Link>.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>None of them is permanent.</strong> How long any layer holds up depends on how you wash the car, your climate, and where it is parked.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Protection is not repair.</strong> A protective layer will not erase existing scratches, swirl marks, or oxidation. Correcting those is a separate job.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>The label wins.</strong> Any general guide, this one included, comes second to the directions on your product.
              </li>
            </ul>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Is spray glaze the same as spray ceramic coating?"
                ? <>No. They are different categories, and a silicone-based spray glaze is not a ceramic product. If a glaze routine is what you want, <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link> comes in a dry-application version (D204) and a wet-application version (D215).</>
                : item.q === "Can I layer wax, sealant and a spray coating together?"
                ? <>Don't assume you can. Check each product's label or ask its maker. APGO does not recommend applying D204 over an existing wax layer. Our <Link href={routes.coatingOverWax} className="us-text-link">coating-over-wax checklist</Link> helps you decide what to do first.</>
                : item.a
            }))} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              The types of car paint protection form a spectrum, from finishes you refresh at home to film a shop installs. Start with your wash habits and your patience for redos, pick one option, and follow that product's label. If what you want is a quick finishing step you can repeat after a wash, <Link href={routes.compare} className="us-text-link">compare APGO's spray glaze routines</Link>.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["waxVsSprayCoating", "coatingOverWax", "diyVsPro"]} />
      </main>
    </div>
  );
}
