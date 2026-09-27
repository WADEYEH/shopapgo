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

const TITLE = "How to Wash a Ceramic Coated Car at Home";
const H1 = "How to Wash a Ceramic Coated Car at Home";
const CRUMB = "Wash a coated car";
const DESCRIPTION = "How to wash a ceramic coated car at home: shade and cool paint, a top-down pre-rinse, wheels first, pH-neutral shampoo and two buckets, then a final rinse.";
const COVER = asset("generated/how-to-wash-a-ceramic-coated-car-hero.png");
const HERO_ALT = "Foam sliding down a dark car door during a hand wash in morning light";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.washCoatedCar },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.washCoatedCar,
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
    q: "What's the best way to wash a ceramic coated car?",
    a: "A gentle hand wash at home: pre-rinse, clean the wheels first, then wash the body from the top down with a mitt and pH-neutral shampoo, and finish with a thorough rinse.",
  },
  {
    q: "Can I take a ceramic coated car through an automatic car wash?",
    a: "You can, but brushes, strong detergents, and frequent visits usually wear the protection down faster. For details, see does an automatic car wash remove ceramic coating.",
  },
  {
    q: "What soap is safe for a ceramic coated car?",
    a: "A mild, pH-neutral car shampoo. Avoid strong or household cleaners.",
  },
  {
    q: "How soon can I wash after applying a ceramic spray?",
    a: "Check that product's label. Our guide on how long to wait to wash after a spray explains what to look for.",
  },
  {
    q: "Do I need to wash the car after it rains?",
    a: "Not necessarily right away, but don't let dirty rain residue or road salt dry and sit on the paint. For more, read does rain damage ceramic coating.",
  },
];

const TOC = [
  { href: "#different", label: "What Makes It Different" },
  { href: "#need", label: "What You'll Need" },
  { href: "#steps", label: "Step by Step" },
  { href: "#wet-product", label: "Where a Wet-Application Product Fits" },
  { href: "#mistakes", label: "Mistakes That Wear a Coating Faster" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_MISTAKES = [
  {
    habit: "Dry-wiping dust",
    why: "Drags grit across the paint",
    instead: "Wash and rinse; don't just wipe",
  },
  {
    habit: "Reusing a dropped mitt",
    why: "Picks up grit from the ground",
    instead: "Swap in a clean mitt",
  },
  {
    habit: "One bucket and one mitt for everything",
    why: "Spreads wheel grime and grit to the paint",
    instead: "Separate wheel tools; use two buckets",
  },
  {
    habit: "Harsh or household cleaners",
    why: "Can strip protection faster",
    instead: "Use a pH-neutral car shampoo",
  },
  {
    habit: "Washing on hot paint",
    why: "Soap and water dry on the surface",
    instead: "Wash in the shade on cool paint",
  },
  {
    habit: "Letting the car air-dry",
    why: "Can leave mineral spots",
    instead: "Dry with a clean towel after the final rinse",
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

export default function HowToWashCeramicCoatedCarPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.washCoatedCar }),
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
          tagLabel="Wash routine"
          title={H1}
          lede={DESCRIPTION}
          readTime="6 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            A coating makes a car easier to wash, but washing it the wrong way is also the fastest way to wear that coating down. This guide shows how to wash a ceramic coated car by hand at home, from the pre-rinse to the final rinse; drying is covered in a separate guide, and we note where a wet-application product fits. The same gentle method works for spray products and professional coatings alike, though if a shop gave you written care terms for a professional coating, follow those. APGO comes up once, after the wash steps, and its products are a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="different" style={section}>
            <h2 style={h2Balance}>What Makes Washing a Coated Car Different</h2>
            <p style={body}>
              A coating helps dirt release more easily and rinse off faster. What wears it down is friction and harsh chemistry: scrubbing, gritty tools, and strong cleaners. So the goal of every step below is simple: less friction and gentler cleaners.
            </p>
            <p style={body}>
              That's also the best way to wash a ceramic coated car in a nutshell. The best method isn't the one that scrubs hardest. It's the one that keeps your tools clean and your shampoo mild, and lets water do as much of the work as possible.
            </p>
          </section>

          <section id="need" style={section}>
            <h2 style={h2Balance}>What You'll Need</h2>
            <p style={body}>
              You don't need anything exotic, just the right basics:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>pH-neutral car shampoo.</strong> It cleans without the harshness of strong or household cleaners.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Wash mitts.</strong> One or two soft mitts for the body, plus a separate brush or mitt reserved for the wheels.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Two buckets.</strong> One for soapy water and one for rinsing the mitt; a grit guard in each is a helpful option.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A hose.</strong> A pressure washer works too, used gently and according to its instructions.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A clean drying towel.</strong> You'll need it right after the final rinse, though drying itself is covered elsewhere.
              </li>
            </ul>
          </section>

          <section id="steps" style={section}>
            <h2 style={h2Balance}>How to Wash a Ceramic Coated Car, Step by Step</h2>
            <p style={body}>
              Five steps take you from a dusty car to a clean, rinsed one.
            </p>

            <h3 style={h3}>1. Pick Shade and Cool Paint</h3>
            <p style={body}>
              Wash in the shade, on paint that isn't hot to the touch. On a hot panel, shampoo and water can dry on the surface before you rinse them off, leaving marks that are harder to deal with than the dirt you started with.
            </p>

            <h3 style={h3}>2. Pre-Rinse From the Top Down</h3>
            <p style={body}>
              Start with plain water. Rinse the whole car from the roof down to knock off loose dust and grit before anything touches the paint. Every bit of grit you rinse away now is grit your mitt won't drag across the surface later. If you use a pressure washer, keep it gentle and follow the equipment's instructions.
            </p>

            <h3 style={h3}>3. Clean the Wheels and Tires First</h3>
            <p style={body}>
              Wheels are the dirtiest part of the car, loaded with brake dust and road grime. Clean them before the body, using a separate brush or mitt and separate water, so none of that grime ends up on your paint. If you use a wheel cleaner, follow that product's label.
            </p>

            <h3 style={h3}>4. Wash Top-Down With a Mitt and pH-Neutral Shampoo</h3>
            <p style={body}>
              Work from the roof down, one panel at a time, using light, straight passes rather than hard circles. Save the lower panels for last, because they carry the most dirt.
            </p>
            <p style={body}>
              The two-bucket method helps here. Keep one bucket of shampoo solution and one of clean rinse water. After each panel, rinse the mitt in the clean bucket to release grit before you load it with shampoo again. That keeps the dirt from one panel from being carried to the next.
            </p>
            <p style={body}>
              If your mitt hits the ground, swap it for a clean one; don't keep washing with it. And don't substitute dish soap or other household cleaners for car shampoo.
            </p>

            <h3 style={h3}>5. Final Rinse, and Stop Here</h3>
            <p style={body}>
              Rinse from the top down until every trace of shampoo is gone, paying extra attention to panel gaps, badges, and trim edges where suds like to hide.
            </p>
            <p style={body}>
              That's the end of the wash. Drying the car, checking the finish, and deciding whether to apply a product today are covered in <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>.
            </p>
          </section>

          <section id="wet-product" style={section}>
            <h2 style={h2Balance}>After the Final Rinse: Where a Wet-Application Product Fits</h2>
            <p style={body}>
              Some protection products are designed to go on right after the final rinse, while the paint is still wet, which is one more reason to rinse thoroughly.
            </p>
            <p style={body}>
              APGO Atomic Glaze Coating (D215) is one of them. It's a silicone-based spray glaze applied after washing and rinsing, while the paint is still wet. "Wet" here means freshly washed and rinsed; it doesn't mean wet from rain or still dusty. You spread it with a damp application cloth, towel-dry the car, and then buff with a clean coral-fleece microfiber towel. The details are in <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link>, and you can compare <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link> options side by side.
            </p>
            <p style={body}>
              If you've just applied any spray product and are still inside its waiting period, see <Link href={routes.waitToWash} className="us-text-link">how long to wait before washing after a spray</Link>.
            </p>
          </section>

          <section id="mistakes" style={section}>
            <h2 style={h2Balance}>Mistakes That Wear a Coating Faster</h2>
            <p style={body}>
              Most wear comes from a handful of habits. Here's what to swap them for:
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Habit</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Why it wears the coating</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Do this instead</span>
              </div>
              {TABLE_MISTAKES.map((row) => (
                <Fragment key={row.habit}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.habit}</div>
                  <div style={tableCell}>{row.why}</div>
                  <div style={tableCell}>{row.instead}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              For the bigger picture of keeping a coating in shape between washes, see <Link href={routes.coatingMaintenance} className="us-text-link">ceramic coating maintenance</Link>.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Can I take a ceramic coated car through an automatic car wash?"
                ? <>You can, but brushes, strong detergents, and frequent visits usually wear the protection down faster. For details, see <Link href={routes.autoWashCoating} className="us-text-link">does an automatic car wash remove ceramic coating</Link>.</>
                : item.q === "How soon can I wash after applying a ceramic spray?"
                ? <>Check that product's label. Our guide on <Link href={routes.waitToWash} className="us-text-link">how long to wait to wash after a spray</Link> explains what to look for.</>
                : item.q === "Do I need to wash the car after it rains?"
                ? <>Not necessarily right away, but don't let dirty rain residue or road salt dry and sit on the paint. For more, read <Link href={routes.rainDamageCoating} className="us-text-link">does rain damage ceramic coating</Link>.</>
                : item.a
            }))} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Washing a coated car comes down to less friction and gentler cleaners: pre-rinse, wheels first, pH-neutral shampoo, top-down passes, and a thorough final rinse. Stop there, then dry the car and decide on any next product using the after-washing guide.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["afterWashing", "autoWashCoating", "rainDamageCoating"]} />
      </main>
    </div>
  );
}
