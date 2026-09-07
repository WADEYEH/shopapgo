import Link from "next/link";
import GuideHeader from "@/components/us/guides/GuideHeader";
import GuideFooter from "@/components/us/guides/GuideFooter";
import ArticleHead from "@/components/us/guides/ArticleHead";
import HeroFigure from "@/components/us/guides/HeroFigure";
import ArticleBody from "@/components/us/guides/ArticleBody";
import OnThisPage from "@/components/us/guides/OnThisPage";
import DashList from "@/components/us/guides/DashList";
import FaqList from "@/components/us/guides/FaqList";
import GuideLinkCard from "@/components/us/guides/GuideLinkCard";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, faqLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Balance, h2Faq, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "What to do after washing your car";
const LEDE =
  "A simple paint-care routine. After the final rinse, focus on three things: keeping the paint clean, removing the water, and following the correct directions for any care product you choose to use.";
// Full lede (196 chars): trimming at the first sentence boundary would leave a meaningless description.
const DESCRIPTION = LEDE;
const HERO = asset("application/d215-step-1.webp");

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.afterWashing },
  openGraph: { title: TITLE, description: DESCRIPTION, url: routes.afterWashing, images: [HERO] },
};

const FAQ = [
  {
    q: "Can I just let the car air-dry?",
    a: "Leaving rinse water to evaporate can result in visible spotting. Using a suitable drying towel gives you a way to remove that water, especially when warm conditions would otherwise make it dry quickly. If you are using a product intended for wet application, complete that application stage first and follow its drying instructions.",
  },
  {
    q: "Should I wax the car after every wash?",
    a: "Not automatically. Follow the reapplication guidance for your chosen wax or protective treatment. Do not assume that adding another layer—or a different product—after every wash is necessary or compatible.",
  },
  {
    q: "Does the car need to be completely dry before applying paint protection?",
    a: "It depends on the product. Some routines begin on freshly rinsed, wet paint; others require the vehicle to be completely dry. Check before you start rather than treating all spray products the same way.",
  },
  {
    q: "Can I use the same towel for drying and buffing?",
    a: "Treat them as separate jobs. If the finishing instructions require a clean, dry towel, a water-saturated drying towel is not ready for that step. Have the necessary cloths prepared before applying the product.",
  },
];

const TOC = [
  { href: "#ready", label: "1. Check that the car is ready for towel contact" },
  { href: "#decide", label: "2. Decide whether you are applying a product today" },
  { href: "#dry", label: "3. Dry the car with a clean, suitable towel" },
  { href: "#inspect", label: "4. Inspect the finish before adding more product" },
  { href: "#finish", label: "5. Complete the product's finishing and aftercare steps" },
  { href: "#faq", label: "Common questions after washing" },
  { href: "#apgo", label: "Where APGO fits into your wash" },
];

const routineCard = (accent) => ({
  background: color.raised,
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  borderTop: `4px solid ${accent}`,
});

export default function AfterWashingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd data={[articleLd({ headline: TITLE, description: LEDE, image: HERO, route: routes.afterWashing }), faqLd(FAQ)]} />
      <GuideHeader />
      <main>
        <ArticleHead
          gradient="linear-gradient(160deg,#12151a 0%,#080A0C 55%)"
          crumb="Basics"
          tag="BASICS"
          tagColor={color.tertiary}
          tagLabel="Wash routine"
          title={TITLE}
          lede={LEDE}
          readTime="5 min read"
        />

        <HeroFigure src={HERO} alt="Rinsing a car after washing" caption="Real footage · APGO" />

        <ArticleBody>
          <OnThisPage items={TOC} />

          <p style={lead}>
            You do not need to turn every wash into a full detailing session. A useful routine can be straightforward—and if you are
            applying a product, check whether it belongs on wet or dry paint before reaching for your drying towel.
          </p>

          <section id="ready" style={section}>
            <h2 style={h2Balance}>1. Check that the car is ready for towel contact</h2>
            <p style={body}>
              Before drying or applying anything, make sure the shampoo has been rinsed away and there is no visible dirt or grit left
              on the paint.
            </p>
            <p style={body}>
              If you missed a dirty area, clean and rinse it properly. Do not use a drying towel to scrub away the dirt you missed
              during washing.
            </p>
            <p style={body}>
              Check your towels, too. A clean car still needs clean tools: grit or sand can scratch the finish, and towels should be
              stored where they will not collect dust and dirt.{" "}
              <a
                href="https://www.acg.aaa.com/connect/blogs/4c/auto/how-to-protect-your-cars-paint-diy-car-washes"
                target="_blank"
                rel="noopener noreferrer"
              >
                AAA's DIY car-washing guidance
              </a>
            </p>
          </section>

          <section id="decide" style={section}>
            <h2 style={h2Balance}>2. Decide whether you are applying a product today</h2>
            <p style={body}>Before drying, read the directions for the product you intend to use.</p>
            <DashList
              items={[
                {
                  color: color.wet,
                  children: (
                    <span>
                      <strong style={strong}>If it is designed for wet paint:</strong> apply it at the specified stage after rinsing,
                      then follow its drying and finishing instructions.
                    </span>
                  ),
                },
                {
                  color: color.dry,
                  children: (
                    <span>
                      <strong style={strong}>If it requires dry paint:</strong> dry the vehicle completely before application.
                    </span>
                  ),
                },
                {
                  color: color.tertiary,
                  children: (
                    <span>
                      <strong style={strong}>If you are not applying a product:</strong> continue with drying and a final inspection.
                    </span>
                  ),
                },
              ]}
            />
            <p style={body}>
              "Spray-on" does not describe a complete application method. It does not tell you whether the surface should be wet,
              whether the product needs rinsing, or whether you need to buff afterward.
            </p>
            <p style={body}>
              Also consider what is already on your car. Do not assume a new product is compatible with an existing wax, sealant,
              coating, wrap, or specialty finish. Check the relevant directions before combining treatments.
            </p>
          </section>

          <section id="dry" style={section}>
            <h2 style={h2Balance}>3. Dry the car with a clean, suitable towel</h2>
            <p style={body}>
              Use a clean automotive drying towel to remove the remaining water. When it becomes too saturated to dry effectively,
              switch to another clean towel or follow the towel manufacturer's care instructions.
            </p>
            <p style={body}>
              Where possible, work in the shade and avoid hot paint. Heat can cause water and cleaning solutions to dry quickly,
              leaving spots or residue. Removing the water rather than leaving it to evaporate helps reduce that risk.{" "}
              <a href="https://www.midstates.aaa.com/automotive/10-car-wash-dos-and-donts" target="_blank" rel="noopener noreferrer">
                AAA's car-washing do's and don'ts
              </a>
            </p>
            <p style={body}>Drying and buffing are different jobs:</p>
            <DashList
              items={[
                {
                  children: (
                    <span>
                      <strong style={strong}>Drying</strong> removes water from the vehicle.
                    </span>
                  ),
                },
                {
                  children: (
                    <span>
                      <strong style={strong}>Spreading</strong> distributes an applied product.
                    </span>
                  ),
                },
                {
                  children: (
                    <span>
                      <strong style={strong}>Buffing</strong> completes the finishing step when the product's instructions call for
                      it.
                    </span>
                  ),
                },
              ]}
            />
            <p style={body}>
              Prepare the cloths your chosen routine requires. A towel already saturated with rinse water should not be treated as a
              clean, dry finishing towel.
            </p>
          </section>

          <figure style={{ margin: 0 }}>
            <img
              src={asset("application/d215-step-4.webp")}
              alt="Drying a hood with a clean towel"
              style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "cover" }}
            />
            <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
              Drying and buffing are separate jobs—keep the towels separate too.
            </figcaption>
          </figure>

          <section id="inspect" style={section}>
            <h2 style={h2Balance}>4. Inspect the finish before adding more product</h2>
            <p style={body}>Once the car is dry, take a moment to look over the paint.</p>
            <p style={body}>
              Check for remaining droplets, missed dirt, product residue, or marks that were already present before washing.
            </p>
            <p style={body}>
              If something does not look right, identify the issue before reaching for another product. A dirty patch, a water spot,
              and a scratch are different problems; do not assume the same spray will address all three.
            </p>
            <p style={body}>
              Avoid repeatedly rubbing a stubborn mark with a drying towel or covering it with more product. Follow an appropriate,
              surface-compatible treatment—or ask for advice if you are unsure what the mark is.
            </p>
          </section>

          <section id="finish" style={section}>
            <h2 style={h2Balance}>5. Complete the product's finishing and aftercare steps</h2>
            <p style={body}>
              If you applied a paint-care product, finish its full routine. Depending on the product, that may include spreading,
              removing excess, drying, or buffing.
            </p>
            <p style={body}>Then check its aftercare directions:</p>
            <DashList
              items={[
                { children: "Does it recommend keeping the surface dry for a period?" },
                { children: "Is there guidance about the next wash?" },
                { children: "When is another application appropriate?" },
                { children: "Are there restrictions on combining it with other products?" },
              ]}
            />
            <p style={body}>
              These instructions are product-specific. A waiting period or reapplication schedule for one product should not
              automatically be applied to another.
            </p>
            <p style={body}>
              A routine wash also does not automatically mean that every protective product needs to be reapplied. Follow the
              maintenance guidance for the product already on your vehicle.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>Common questions after washing</h2>
            <FaqList items={FAQ} />
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2}>Where APGO fits into your wash</h2>
            <p style={body}>If you want to add an APGO paint-care step, choose the application timing that fits your routine.</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
              }}
            >
              <div style={routineCard(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 28, lineHeight: 1, color: color.dry }}>After drying</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 18, textTransform: "uppercase" }}>Atomic Colored Glaze</span>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: color.secondary }}>
                  Apply to clean, completely dry paint, spread, and buff. APGO recommends thin application and keeping the car dry for
                  24 hours afterward for best results. It is not recommended for application over an existing wax layer.
                </p>
                <Link href={routes.coloredGlaze} style={{ color: color.orange, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
                  Read the guide →
                </Link>
              </div>
              <div style={routineCard(color.wet)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 28, lineHeight: 1, color: color.wet }}>Before drying</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 18, textTransform: "uppercase" }}>Atomic Glaze Coating</span>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: color.secondary }}>
                  Apply to clean paint while it is still wet after rinsing. Spread with a damp application cloth, towel-dry the vehicle,
                  and finish by buffing with a clean coral-fleece microfiber towel.
                </p>
                <Link href={routes.glazeCoating} style={{ color: color.orange, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
                  Read the guide →
                </Link>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6, color: color.text, fontWeight: 600 }}>
              Both routines include a final buff. Wet application does not mean skipping that step.
            </p>
            <GuideLinkCard
              href={routes.wetOrDry}
              accent={color.orange}
              title="Compare APGO's wet- and dry-surface routines"
              meta="A side-by-side explanation of the tools and application sequence · 6 min read"
            />
          </section>

          <p style={finePrint}>
            This article is published by APGO. General washing advice does not replace your vehicle's care instructions or the
            directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["coloredGlaze", "glazeCoating", "wetOrDry"]} />
      </main>
      <GuideFooter />
    </div>
  );
}
