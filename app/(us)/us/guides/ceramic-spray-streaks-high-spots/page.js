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

const TITLE = "Ceramic Coating Streaks & High Spots: How to Fix";
const H1 = "Ceramic Coating Streaks, Haze or High Spots? How to Fix Them";
const CRUMB = "Streaks & high spots";
const DESCRIPTION = "Ceramic coating streaks, haze or high spots after a spray? Learn which problem you have, then fix it from gentle to heavy, starting with a clean re-buff.";
const COVER = asset("generated/ceramic-spray-streaks-high-spots-hero.png");
const HERO_ALT = "Raking light across a black hood as a microfiber towel wipes a faint smear clear";
const INLINE_IMAGE = asset("generated/ceramic-spray-streaks-high-spots-too-much-product.png");

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.streaksHighSpots },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.streaksHighSpots,
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
    q: "Will ceramic coating streaks go away on their own?",
    a: "Don't wait for them to. Re-buff with a clean, dry towel face first, and if they're still there, check the label or ask the product's maker.",
  },
  {
    q: "Why does my spray coating look hazy?",
    a: "The most common causes are too much product or a towel that's too wet or dirty. With APGO's D204, a silicone-based spray glaze, a white haze while you work means too much product, not stronger protection; see APGO's dry-surface glaze guide.",
  },
  {
    q: "Can I use IPA to remove streaks?",
    a: "Only if your product's label or its maker recommends it; this guide doesn't cover solvents. For APGO products, contact APGO support.",
  },
  {
    q: "Does polishing remove a spray coating?",
    a: "It can. With spray coatings in general, polishing usually takes off the protection on that area along with the residue, which is why it's a last resort, not a routine fix. For APGO products, ask APGO support first.",
  },
  {
    q: "Are these streaks or water spots?",
    a: "Water spots are usually round mineral marks; rinse with clean water and dry the car, as covered in drying the car properly. Streaks are drag marks from buffing, and re-buffing is the fix.",
  },
];

const TOC = [
  { href: "#tell", label: "How to Tell Which Problem" },
  { href: "#fix", label: "How to Fix Streaks" },
  { href: "#high-spots", label: "What About High Spots?" },
  { href: "#avoid", label: "How to Avoid Them Next Time" },
  { href: "#apgo", label: "If You're Using APGO" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_TELL = [
  {
    see: "Streaks",
    cause: "Residue that wasn't buffed evenly",
    first: "Re-buff with a clean, dry towel face",
  },
  {
    see: "Overall haze",
    cause: "Too much product, or a towel that's too wet or dirty",
    first: "Re-buff with a clean, dry towel face",
  },
  {
    see: "High spots",
    cause: "Product that wasn't leveled and dried thicker in one area",
    first: "Re-buff, then follow the steps below",
  },
  {
    see: "Water spots",
    cause: "Mineral residue from water drying on the paint",
    first: "Rinse with clean water and dry",
  },
  {
    see: "Swirls that were already there",
    cause: "Existing fine scratches, now easier to see",
    first: "A spray won't remove them",
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

export default function CeramicSprayStreaksHighSpotsPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.streaksHighSpots }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
          faqLd(FAQ),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#16120f 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="TROUBLESHOOTING"
          tagColor={color.orange}
          tagLabel="Fixing application issues"
          title={H1}
          lede={DESCRIPTION}
          readTime="7 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            You've sprayed and buffed, then you catch the paint at a different angle: faint lines, a cloudy patch, or one spot that looks darker than the rest. Ceramic coating streaks and haze are frustrating, but most of them are easy to fix if you start with the gentlest option. This guide focuses on spray products, both spray ceramics and spray glazes. It shows how to tell which problem you have and how to work from gentle to heavy fixes. APGO comes up later, and its products are a silicone-based spray glaze, not a ceramic coating. Whatever you're using, don't reach for more product or a polisher first.
          </p>

          <section id="tell" style={section}>
            <h2 style={h2Balance}>Streaks, Haze, High Spots or Something Else? How to Tell</h2>
            <p style={body}>
              Before you fix anything, look at the paint in a few different lights and from a few angles. Dirt, water spots, and scratches are different problems from streaks, and treating the wrong one wastes time.
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>What you see</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Likely cause</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>First thing to try</span>
              </div>
              {TABLE_TELL.map((row) => (
                <Fragment key={row.see}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.see}</div>
                  <div style={tableCell}>{row.cause}</div>
                  <div style={tableCell}>{row.first}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              <strong style={strong}>Streaks</strong> are lines or drag marks, usually leftover product that wasn't buffed evenly. <strong style={strong}>Overall haze</strong> is a cloudy, flattened look across a panel, most often from too much product or from buffing with a towel that's too wet or too dirty. <strong style={strong}>High spots</strong> are darker, thicker-looking patches with distinct edges; they're covered in their own section below. <strong style={strong}>Water spots</strong> are round marks or mineral residue, and they aren't a product problem at all: rinse with clean water and dry the car, as covered in <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>. <strong style={strong}>Swirls that were already there</strong> can look more obvious under a fresh glossy layer, and a spray product won't remove them.
            </p>
          </section>

          <section id="fix" style={section}>
            <h2 style={h2Balance}>How to Fix Ceramic Coating Streaks, From Gentle to Heavy</h2>
            <p style={body}>
              Work through these in order and stop as soon as the problem is gone.
            </p>

            <h3 style={h3}>1. Re-Buff With a Clean, Dry Towel Face</h3>
            <p style={body}>
              Fold your microfiber towel to a clean, dry face and buff the area again with light pressure. A towel that's too wet or too dirty is often the cause of the streak in the first place, so a fresh face matters. This first step is also the one that most often solves the problem.
            </p>

            <h3 style={h3}>2. Follow Your Product's Label to Rework or Reapply</h3>
            <p style={body}>
              If re-buffing doesn't help, check the label on the product you used. Some products allow a light reapplication on the affected area followed by an even buff; others give different directions. Follow the label rather than improvising a fix.
            </p>
            <p style={body}>
              For APGO's D204, a silicone-based spray glaze, you can apply another thin layer as upkeep once the car has been washed and fully dried. Whether it's appropriate to go straight over a hazy area is a different question, so check the current label or contact APGO support first.
            </p>

            <h3 style={h3}>3. Ask the Product Maker's Support</h3>
            <p style={body}>
              If the mark won't buff out and reapplying hasn't helped, contact the product's maker before trying anything stronger; for APGO products, that's APGO support. Don't reach for solvents or a polisher on your own. Use a solvent only if the product's label or its maker recommends it.
            </p>

            <h3 style={h3}>4. Polishing, Only as a Last Resort</h3>
            <p style={body}>
              Polishing can remove stubborn residue, but it also removes the protection on that area along with it, so the area will need to be protected again afterward. It's a general last resort, not a routine fix. If you've never polished paint before, leave it to someone experienced, and check with the product's maker first.
            </p>
          </section>

          <section id="high-spots" style={section}>
            <h2 style={h2Balance}>What About Ceramic Coating High Spots?</h2>
            <p style={body}>
              A high spot forms when product in one area isn't leveled and wiped off, then dries into a thicker, darker patch. High spots are more common with liquid ceramic coatings, whose application windows are strict. With spray products they're less common and usually come from too much product in one place.
            </p>
            <p style={body}>
              The fix follows the same ladder: re-buff, check the label, ask the maker, and only then consider polishing. A high spot that has already hardened is harder to deal with on your own. For more on how liquid coatings and sprays differ, see <Link href={routes.sprayVsCoating} className="us-text-link">ceramic spray vs ceramic coating</Link>.
            </p>
          </section>

          <section id="avoid" style={section}>
            <h2 style={h2Balance}>Why Streaks and Haze Happen, and How to Avoid Them Next Time</h2>
            <p style={body}>
              Most streaks and haze trace back to a few causes:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Too much product.</strong> More doesn't work better; it just makes the product harder to buff out.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A dirty or wet towel.</strong> Switch to a clean, dry towel face as soon as one loads up.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Sun and hot paint.</strong> On a hot panel, product can dry before you've buffed it evenly, so work in the shade.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Buffing too late.</strong> Buff when your product's label says to.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Paint that wasn't ready.</strong> Leftover dirt or contamination causes trouble, so see <Link href={routes.prepForSpray} className="us-text-link">how to prep your car for ceramic spray</Link>. So does old wax underneath; see <Link href={routes.removeWaxFirst} className="us-text-link">how to remove wax before ceramic coating</Link>.
              </li>
            </ul>
            <figure style={{ margin: 0 }}>
              <img
                src={INLINE_IMAGE}
                alt="Too much product leads to haze"
                style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "contain", background: color.raised }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                More product isn't more protection. It's more to buff out.
              </figcaption>
            </figure>
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2Balance}>If You're Using APGO's Silicone-Based Spray Glaze</h2>
            <p style={body}>
              APGO's two products are a silicone-based spray glaze, not a ceramic coating. Here's what APGO says that bears most directly on streaks and haze.
            </p>
            <p style={body}>
              <strong style={strong}>APGO Atomic Colored Glaze (D204)</strong> is meant to go on thin: about 4–6 sprays covers a sedan's whole hood. A white haze while you work means too much product on that spot, not a stronger layer. You can buff right after spreading, but don't leave it unbuffed for extended periods or until the next day, and spray and spread one small section at a time. Once the car is washed and fully dried, you can apply another thin layer as upkeep; it's optional, and a thicker coat isn't better. The full routine is in <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link>.
            </p>
            <p style={body}>
              <strong style={strong}>APGO Atomic Glaze Coating (D215)</strong> goes on after washing and rinsing, while the paint is still wet. You spread it with a damp application cloth, towel-dry the car, then buff with a clean coral-fleece microfiber towel, and that buff is the final step, not the towel-dry. The full routine is in <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link>.
            </p>
            <p style={body}>
              If haze won't buff out, or you're unsure whether to reapply, check the current label or contact APGO support. You can also compare <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link> routines side by side.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Why does my spray coating look hazy?"
                ? <>The most common causes are too much product or a towel that's too wet or dirty. With APGO's D204, a silicone-based spray glaze, a white haze while you work means too much product, not stronger protection; see <Link href={routes.coloredGlaze} className="us-text-link">APGO's dry-surface glaze guide</Link>.</>
                : item.q === "Are these streaks or water spots?"
                ? <>Water spots are usually round mineral marks; rinse with clean water and dry the car, as covered in <Link href={routes.afterWashing} className="us-text-link">drying the car properly</Link>. Streaks are drag marks from buffing, and re-buffing is the fix.</>
                : item.a
            }))} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Identify the problem first, then start with the gentlest fix: re-buff with a clean, dry towel face, check the label, ask the maker, and save polishing for last. Next time, go thin, work one section at a time, keep your towel clean and dry, and stay off hot paint.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["prepForSpray", "waitToWash", "coloredGlaze"]} />
      </main>
    </div>
  );
}
