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

const TITLE = "How to Wash Your Car in Winter: Cold & Salt";
const H1 = "How to Wash Your Car in Winter (Cold, Salt & Freezing Temps)";
const CRUMB = "Winter washing";
const DESCRIPTION = "How to wash your car in winter: pick the right day and place, rinse road salt from the low areas first, dry seals and locks, and clear snow without scratching.";
const COVER = asset("generated/how-to-wash-your-car-in-winter-hero.png");
const HERO_ALT = "Rinsing road salt from a car's lower panels and wheel arch at a winter self-serve wash";
const INLINE_IMAGE = asset("generated/how-to-wash-your-car-in-winter-salt-low.png");
const INLINE_ALT = "Car silhouette with the lower panels and wheel arches highlighted under the words Salt hides low. Rinse there first.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.winterWash },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.winterWash,
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
    q: "Is it OK to wash your car when it's below freezing?",
    a: "It's better to wait for an above-freezing day and wash during the warmest part of it. Then dry the door seals and locks thoroughly so nothing freezes shut.",
  },
  {
    q: "How often should you wash your car in winter?",
    a: "It depends on how much salt and slush you drive through. See how often you should wash your car for more.",
  },
  {
    q: "Should I wash the undercarriage in winter?",
    a: "Yes. Salt collects underneath and in the wheel arches, so rinse those areas first.",
  },
  {
    q: "Can I pour hot water on an icy windshield?",
    a: "No. A sudden temperature change can crack the glass. Use the defroster and a soft snow brush instead.",
  },
  {
    q: "How do I wash a ceramic coated car in winter?",
    a: "The same way as any car: gentle soap, rinse the salt off first, and dry thoroughly.",
  },
];

const TOC = [
  { href: "#why", label: "Why Winter Washing Matters" },
  { href: "#day-and-place", label: "Pick the Right Day and Place" },
  { href: "#steps", label: "Winter Wash Steps" },
  { href: "#snow-and-ice", label: "Removing Snow and Ice" },
  { href: "#coated-car", label: "Wash a Ceramic Coated Car in Winter" },
  { href: "#protection", label: "Topping Up Protection in Winter" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_PLACES = [
  {
    option: "Garage or sheltered driveway",
    goodFor: "Out of the wind; time to dry doors and seals",
    watchOut: "Drainage, and water freezing on the driveway",
  },
  {
    option: "Self-serve wash bay",
    goodFor: "Undercarriage rinse; walls block the wind",
    watchOut: "Shared brushes can hold grit, so skip them on paint",
  },
  {
    option: "Touchless automatic wash",
    goodFor: "Quick salt removal when hand washing isn't practical",
    watchOut: "Detergents may be harsher; drips can freeze in door gaps afterward",
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

export default function HowToWashYourCarInWinterPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.winterWash }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
          faqLd(FAQ),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#16120f 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="DURABILITY & WEATHER"
          tagColor={color.orange}
          tagLabel="Winter washing"
          title={H1}
          lede={DESCRIPTION}
          readTime="6 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            Knowing how to wash your car in winter is mostly about three things: timing, getting the salt off the parts you can't see, and making sure nothing freezes afterward. Road salt and slush don't stay on the doors where you'd notice them. They pack into the lower panels, the wheel arches, and the underside. Wash on the wrong day and you can end up with doors frozen shut, locks that won't turn, and a thin sheet of ice where the rinse water ran. This guide covers when and where to wash, what changes from a normal wash, how to clear snow and ice without scratching the paint, and what to check before you add protection.
          </p>

          <section id="why" style={section}>
            <h2 style={h2Balance}>Why Winter Washing Matters</h2>
            <p style={body}>
              In winter, the road itself gets onto your car. Salt, de-icing brine, and slush splash up and collect along the rocker panels, inside the wheel arches, behind the bumpers, and underneath the car. Letting that mixture sit and dry on the car for weeks isn't a good idea, and the areas where it collects are exactly the ones a quick glance misses.
            </p>
            <p style={body}>
              If you want to know how salt and wet weather affect a protective coating specifically, see <Link href={routes.rainDamageCoating} className="us-text-link">does rain damage ceramic coating</Link>.
            </p>
          </section>

          <section id="day-and-place" style={section}>
            <h2 style={h2Balance}>How to Wash Your Car in Winter: Pick the Right Day and Place</h2>
            <p style={body}>
              Timing does a lot of the work. When you can, choose a day that's above freezing and wash during the warmest part of the day, so the water has a chance to run off and the car can be dried before anything freezes. Avoid windy days too: wind makes the water on the car freeze faster and makes drying harder.
            </p>
            <p style={body}>
              Where you wash matters as much as when:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A garage or sheltered driveway</strong> keeps wind off the car and gives you time to dry it properly.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A self-serve wash bay</strong> is often the easiest option in winter. Many have an undercarriage rinse, and the bay walls block the wind.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A touchless automatic wash</strong> is a convenient way to get salt off when washing at home isn't practical. It's not risk-free for protective layers, though; see <Link href={routes.autoWashCoating} className="us-text-link">does an automatic car wash remove ceramic coating</Link>.
              </li>
            </ul>
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Option</span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Good for</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Watch out for</span>
              </div>
              {TABLE_PLACES.map((row) => (
                <Fragment key={row.option}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.option}</div>
                  <div style={tableCell}>{row.goodFor}</div>
                  <div style={tableCell}>{row.watchOut}</div>
                </Fragment>
              ))}
            </div>
          </section>

          <section id="steps" style={section}>
            <h2 style={h2Balance}>Winter Wash Steps: What Changes From a Normal Wash</h2>
            <p style={body}>
              The basic hand wash doesn't change in winter. For the full routine, see <Link href={routes.washCoatedCar} className="us-text-link">how to wash a ceramic coated car</Link>. What follows is only what's different when there's salt on the road and ice in the forecast.
            </p>

            <h3 style={h3}>1. Rinse the Salt Off First, Starting Low</h3>
            <p style={body}>
              Start where the salt is: the undercarriage, the wheel arches, the rocker panels, and the area behind the bumpers. Rinse those thoroughly before you move to the rest of the car. At a self-serve bay, use the undercarriage setting if there is one. At home, work the hose along the low areas from below, then rinse the whole car from the top down.
            </p>
            <figure style={{ margin: 0 }}>
              <img
                src={INLINE_IMAGE}
                alt={INLINE_ALT}
                style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "contain", background: color.raised }}
              />
            </figure>

            <h3 style={h3}>2. Wash Gently, Top Down</h3>
            <p style={body}>
              Use a gentle car wash soap and wash from the roof down, rinsing your mitt often. Salt crystals can scratch just like sand, so make sure the loose salt and grit are rinsed off before a mitt touches the paint.
            </p>

            <h3 style={h3}>3. Never Pour Hot Water on Frozen Glass</h3>
            <p style={body}>
              It's tempting to clear an icy windshield with a kettle, but a sudden temperature change can crack the glass. Use the defroster, clear loose snow with a soft snow brush, and wait for the ice to soften before you clear it.
            </p>

            <h3 style={h3}>4. Dry Everything, Especially Door Jambs, Seals and Locks</h3>
            <p style={body}>
              Winter drying goes beyond the paint. Dry the door jambs, the rubber door seals, the lock cylinders, the fuel door, and the fold of the side mirrors. Water left in those spots is what freezes doors shut and locks solid overnight. Open and close each door a couple of times after drying so the seals don't stick. For drying technique in general, see <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>.
            </p>
          </section>

          <section id="snow-and-ice" style={section}>
            <h2 style={h2Balance}>Removing Snow and Ice Without Scratching the Paint</h2>
            <p style={body}>
              Snow removal is where a lot of winter scratches start. Use a soft-bristled snow brush and push the snow off and away from the car rather than scrubbing it across the paint. Keep the ice scraper on the glass; it has no place on painted panels.
            </p>
            <p style={body}>
              Clear the roof first. It's safer for you and for the drivers behind you, and it keeps snow from sliding onto the windows you've just cleared. On the glass, let the defroster do most of the work instead of forcing the scraper through thick ice. If the wipers are frozen to the windshield, don't pull them free; wait until the defroster has released them.
            </p>
          </section>

          <section id="coated-car" style={section}>
            <h2 style={h2Balance}>How to Wash a Ceramic Coated Car in Winter</h2>
            <p style={body}>
              The principles don't change for a coated car: use a gentle soap, rinse the salt off first, and dry thoroughly. Avoid harsh degreasers or aggressive cleaners to shift road grime; gentle, frequent washing usually does the job with less wear on the coating.
            </p>
            <p style={body}>
              Any protective layer tends to wear faster in winter, when salt, grit, and constant wet weather are working on it. That's normal, and it's why regular gentle washes matter more than a single deep clean. For a simple year-round routine, see <Link href={routes.coatingMaintenance} className="us-text-link">ceramic coating maintenance</Link>.
            </p>
          </section>

          <section id="protection" style={section}>
            <h2 style={h2Balance}>Topping Up Protection in Winter: Check the Label First</h2>
            <p style={body}>
              If you want to add protection during winter, start with the product's label. Whether a product can be applied in cold weather depends on that product, so check before you plan a winter application.
            </p>
            <p style={body}>
              APGO makes a silicone-based spray glaze, not a ceramic coating. APGO Atomic Colored Glaze (D204) is applied after the car is washed and completely dried. After buffing, APGO recommends keeping the car dry for 24 hours for the best result: no washing, and ideally no rain. D204 lasts up to about 6 months (180 days). APGO Atomic Glaze Coating (D215) is applied after washing and rinsing, while the paint is still wet: spray it onto the wet paint, spread it with a damp application cloth, towel-dry the car, then buff with a clean coral-fleece microfiber towel. D215 lasts up to about 4 months (120 days).
            </p>
            <p style={body}>
              Whether D204 or D215 can be applied in winter or cold weather: check the current label or contact APGO support. Both durability figures are ceilings, not promises, and road salt and winter weather can make the real-world time shorter. The routines are in <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link> and <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link>, or you can <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link>.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Pick your moment, rinse the salt from the low areas first, wash gently from the top down, and dry everything, including the seals and locks. Clear snow with a soft brush and keep the scraper off the paint. If you want to top up protection in winter, read the product's label before you start.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["rainDamageCoating", "autoWashCoating", "afterWashing"]} />
      </main>
    </div>
  );
}
