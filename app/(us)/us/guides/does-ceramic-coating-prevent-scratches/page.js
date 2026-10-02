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

const TITLE = "Does Ceramic Coating Prevent Scratches?";
const H1 = "Does Ceramic Coating Prevent Scratches? What a Coating Can and Can't Do";
const CRUMB = "Coating & scratches";
const DESCRIPTION = "Does ceramic coating prevent scratches? See which scratches a coating can help with, which it can't, like keys and rock chips, and what really prevents swirls.";
const COVER = asset("generated/does-ceramic-coating-prevent-scratches-hero.png");
const HERO_ALT = "Flashlight raking across a dark car door revealing fine swirl marks";
const INLINE_IMAGE = asset("generated/does-ceramic-coating-prevent-scratches-clean-tools.png");
const INLINE_ALT = "A clean folded microfiber towel next to a gritty one under the words Clean tools prevent swirls";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.coatingScratches },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.coatingScratches,
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
    q: "Does ceramic coating prevent swirl marks?",
    a: "It can make washing smoother, but clean tools and a careful wash method matter far more.",
  },
  {
    q: "Does ceramic coating prevent rock chips?",
    a: "No. A thin coating isn't impact protection. See types of car paint protection for thicker options.",
  },
  {
    q: "Will a ceramic spray hide existing scratches?",
    a: "No. It doesn't repair scratches, and polishing is what removes fine marks.",
  },
  {
    q: "Does a coating make my car scratch-proof?",
    a: "No. It's a thin layer that makes the surface slicker, not harder to damage.",
  },
];

const TOC = [
  { href: "#short-answer", label: "The Short Answer" },
  { href: "#scratch-types", label: "Not All Scratches Are the Same" },
  { href: "#can-and-cant", label: "What a Coating Can and Can't Do" },
  { href: "#swirl-marks", label: "Swirl Marks: Wash Method Matters More" },
  { href: "#rock-chips", label: "Rock Chips" },
  { href: "#fixes", label: "What Actually Fixes Scratches" },
  { href: "#apgo", label: "Where APGO Fits" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_SCRATCHES = [
  {
    type: "Swirl marks",
    how: "Grit dragged across paint during washing and drying",
    stops: "Can reduce wash drag, but doesn't stop it",
    helps: "Wash method and clean tools",
  },
  {
    type: "Deeper scratches",
    how: "Keys, branches, carts, bags",
    stops: "No",
    helps: "Polishing or a professional, depending on depth",
  },
  {
    type: "Rock chips",
    how: "Gravel or debris hitting at speed",
    stops: "No",
    helps: "A different protection category; see types of car paint protection",
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

export default function DoesCeramicCoatingPreventScratchesPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.coatingScratches }),
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
          tagLabel="Coating limits"
          title={H1}
          lede={DESCRIPTION}
          readTime="6 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            Does ceramic coating prevent scratches? Not in the way most people hope. A coating can make the paint slicker and easier to wash, which can mean fewer of the fine marks that come from washing, but it isn't armor. It won't stop a key, a rock, or a shopping cart, and it won't erase marks that are already there. This guide explains which kinds of scratches a coating can help with, which it can't, and what actually prevents or fixes each one. APGO's own products, which come up later, are a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="short-answer" style={section}>
            <h2 style={h2Balance}>Does Ceramic Coating Prevent Scratches? The Short Answer</h2>
            <p style={body}>
              Mostly no, with one useful exception. Thin protective layers, whether a spray or a liquid ceramic coating, typically make the surface slicker, so dirt tends to cling less and your wash mitt and towel glide instead of drag. That can help reduce the fine marring that builds up from washing and drying.
            </p>
            <p style={body}>
              What a thin layer can't do is stop key scratches, rock chips, or deeper scratches, and it won't repair damage that's already in the paint. Think of it as making the paint easier to care for, not harder to damage.
            </p>
          </section>

          <section id="scratch-types" style={section}>
            <h2 style={h2Balance}>Not All Scratches Are the Same</h2>
            <p style={body}>
              "Scratches" covers several different kinds of damage, and a coating relates to each one differently.
            </p>

            <h3 style={h3}>Swirl Marks and Fine Wash Marring</h3>
            <p style={body}>
              These are the fine, circular or web-like marks you see in direct sun or under a flashlight. They usually come from washing and drying: grit or dust gets dragged across the paint by a mitt, a towel, or a brush. They're shallow, but on a glossy finish they're very visible.
            </p>

            <h3 style={h3}>Deeper Scratches</h3>
            <p style={body}>
              These come from keys, branches, shopping carts, bikes, and bags, and you can often feel them with a fingernail. They go deeper than the fine marks above, beyond anything a thin protective layer is built to absorb.
            </p>

            <h3 style={h3}>Rock Chips</h3>
            <p style={body}>
              Rock chips are small, sharp craters where gravel or debris hit the paint at speed. They're impact damage, not friction, which is why they behave differently from every other kind of scratch.
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Scratch type</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>How it happens</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Does a thin coating stop it?</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>What actually helps</span>
              </div>
              {TABLE_SCRATCHES.map((row) => (
                <Fragment key={row.type}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.type}</div>
                  <div style={tableCell}>{row.how}</div>
                  <div style={tableCell}>{row.stops}</div>
                  <div style={tableCell}>{row.helps}</div>
                </Fragment>
              ))}
            </div>
          </section>

          <section id="can-and-cant" style={section}>
            <h2 style={h2Balance}>What a Coating Can and Can't Do</h2>

            <h3 style={h3}>What It Can Help With</h3>
            <p style={body}>
              A coating typically makes the surface slicker and easier to wash. Dirt tends to rinse off more readily, and a mitt or towel is less likely to catch and drag. Less drag during a wash can mean fewer new fine marks over time, as long as the wash itself is done carefully. That's a real benefit, but it's an indirect one: the coating makes good technique work better; it doesn't replace it.
            </p>

            <h3 style={h3}>What It Can't Do</h3>
            <p style={body}>
              It can't stop key scratches, rock chips, or deeper scratches. It doesn't fill or repair scratches or swirl marks that are already there, and it isn't permanent. For a fuller list of what spray coatings don't do, see <Link href={routes.whatIsSprayCeramic} className="us-text-link">what spray ceramic coating is</Link>.
            </p>
            <p style={body}>
              You'll also see hardness ratings printed on some ceramic-category labels. They're marketing and category claims, and a hardness number on a label doesn't mean the paint can't be scratched.
            </p>
          </section>

          <section id="swirl-marks" style={section}>
            <h2 style={h2Balance}>Does Ceramic Coating Prevent Swirl Marks? Your Wash Method Matters More</h2>
            <p style={body}>
              A coating can make washing smoother, but the thing that really decides whether you get swirl marks is how you wash and dry the car. Most swirls come from grit being dragged across the paint, and no coating stops that if the grit is still there.
            </p>
            <p style={body}>
              What actually helps:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Rinse first.</strong> Get loose sand and grit off before a mitt touches the paint.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Use clean tools.</strong> A clean mitt and clean towels, rinsed or swapped often, and never a towel that's been dropped.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Never wipe dry dirt.</strong> Dry-wiping dust off the paint is one of the quickest ways to create swirls.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Dry with light pressure.</strong> Let the towel absorb water rather than pressing it into the paint.
              </li>
            </ul>
            <p style={body}>
              For the full routine, see <Link href={routes.washCoatedCar} className="us-text-link">how to wash a ceramic coated car</Link>, and for drying technique, see <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>. Brush-style automatic washes are another common source of swirls; see <Link href={routes.autoWashCoating} className="us-text-link">does an automatic car wash remove ceramic coating</Link>.
            </p>
            <figure style={{ margin: 0 }}>
              <img
                src={INLINE_IMAGE}
                alt={INLINE_ALT}
                style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "contain", background: color.raised }}
              />
            </figure>
          </section>

          <section id="rock-chips" style={section}>
            <h2 style={h2Balance}>Does Ceramic Coating Prevent Rock Chips?</h2>
            <p style={body}>
              No. A rock chip is an impact, and a thin coating isn't impact protection. A layer that thin can't absorb a stone hitting the hood at highway speed, and chips tend to show up on the front bumper, hood, and mirrors of any car that sees regular highway driving.
            </p>
            <p style={body}>
              If rock chips are your main concern, drivers usually look at paint protection film, a thicker, physical film applied over the paint. To see how the main options compare, read <Link href={routes.paintProtectionTypes} className="us-text-link">types of car paint protection</Link>.
            </p>
          </section>

          <section id="fixes" style={section}>
            <h2 style={h2Balance}>Already Have Scratches? What Actually Fixes Them</h2>
            <p style={body}>
              Start by looking at the paint in good light, from a few angles, and running a fingernail gently across any mark you find. Fine marks that you can see but not feel are a different job from a scratch that catches your nail.
            </p>
            <p style={body}>
              A spray or coating won't remove scratches. Actually removing fine marks usually means polishing, which levels the surface around them. Polishing is a last resort, not a routine step. If you haven't done it before, or the scratches are deep, it's worth asking a professional.
            </p>
            <p style={body}>
              Not every mark you see after applying a product is a scratch. Streaks and high spots from application look different from swirls that were already there; see <Link href={routes.streaksHighSpots} className="us-text-link">how to fix streaks and high spots</Link>. Fine marks are also most visible on dark paint; our guide to ceramic coating on a black car covers how to check it.
            </p>
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2Balance}>Where APGO's Silicone-Based Spray Glaze Fits</h2>
            <p style={body}>
              APGO makes a silicone-based spray glaze, not a ceramic coating. APGO Atomic Colored Glaze (D204) doesn't fill or remove existing scratches or swirl marks. If the paint has them before you apply it, they'll still be there afterward.
            </p>
            <p style={body}>
              What APGO does stress for D204 is prep: check the paint for leftover grit, sand, or dust before you touch it with a cloth, and keep your cloth and towel clean. Anything left on the surface can be dragged across the paint while you spread or buff, and that's what causes fine scratches and swirl marks. For the full routine, see <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link>, or <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link>.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              A coating makes paint slicker and easier to wash; it doesn't make it scratch-proof. Your wash method decides whether you get swirl marks, rock chips call for a different kind of protection, and polishing is what removes existing marks. If you use APGO's D204, remember that it won't fill existing scratches, so clean prep matters.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["afterWashing", "autoWashCoating", "coloredGlaze"]} />
      </main>
    </div>
  );
}
