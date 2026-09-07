import { Fragment } from "react";
import GuideHeader from "@/components/us/guides/GuideHeader";
import GuideFooter from "@/components/us/guides/GuideFooter";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import DashList from "@/components/us/guides/DashList";
import Callout from "@/components/us/guides/Callout";
import FaqList from "@/components/us/guides/FaqList";
import GuideLinkCard from "@/components/us/guides/GuideLinkCard";
import EndCtaBand from "@/components/us/guides/EndCtaBand";
import JsonLd, { articleLd, faqLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { container, h2, h2Balance, h2Faq, h3, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "APGO paint protection: wet or dry application?";
const LEDE = "Atomic Colored Glaze or Atomic Glaze Coating? Start with your wash routine. The clearest difference is when you apply them.";
const HERO = asset("application/d204-step-1.webp");

export const metadata = {
  title: TITLE,
  description: LEDE,
  alternates: { canonical: routes.wetOrDry },
  openGraph: { title: TITLE, description: LEDE, url: routes.wetOrDry, images: [HERO] },
};

const FAQ = [
  {
    q: "Do both products need buffing?",
    a: "Yes. Atomic Colored Glaze is buffed after spreading. Atomic Glaze Coating is spread on wet paint, followed by towel-drying and a final buff.",
  },
  {
    q: "Should I use both during the same wash?",
    a: "These are presented as alternative application routines, not a two-product layering system. Contact APGO before combining them.",
  },
  {
    q: "Can I use them over wax or another coating?",
    a: "APGO does not recommend applying Atomic Colored Glaze over an existing wax layer. Do not assume that guidance for one product applies to the other, or that either product is compatible with every wax, sealant, or coating. Check the current product directions and contact APGO about your existing surface treatment before applying.",
  },
  {
    q: "Can I use them on trim, wheels, and glass?",
    a: "Yes—both can be used across the exterior: paint, chrome, plastic trim, mirror housings, piano-black trim, wheels, and glass. On the front windshield, only Atomic Colored Glaze is recommended, and only after removing any oil film.",
  },
  {
    q: 'Does "wet application" mean I can skip washing?',
    a: "No. Atomic Glaze Coating is applied after the vehicle has been washed and the shampoo rinsed away. Wet paint still needs to be clean paint.",
  },
];

// Comparison table cells.
const COMPARE = [
  ["Application surface", "Clean, completely dry paint", "Clean paint, still wet after rinsing"],
  ["Main sequence", "Spray → spread → buff", "Spray → spread → towel-dry → buff"],
  ["Spreading tool", "Application cloth", "Damp application cloth"],
  ["Final step", "Buff with a clean coral-fleece microfiber towel", "After drying, buff with a clean coral-fleece microfiber towel"],
  ["Where you can use it", "Whole exterior, including the windshield (remove oil film first)", "Whole exterior, except the front windshield"],
  ["Bottle size", "300 mL", "200 mL"],
];

const heroCaption = (accent) => ({
  position: "absolute",
  left: 12,
  bottom: 12,
  fontFamily: CONDENSED,
  fontWeight: 800,
  fontSize: 28,
  color: accent,
  letterSpacing: ".04em",
  textShadow: "0 2px 12px rgba(0,0,0,.8)",
});
const tableHead = (accent) => ({
  background: color.bg,
  padding: "14px 16px",
  borderTop: `4px solid ${accent}`,
  display: "flex",
  flexDirection: "column",
  gap: 2,
});
const tableRowLabel = {
  gridColumn: "1 / -1",
  background: color.raised,
  padding: "8px 16px",
  fontSize: 11,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: color.quiet2,
};
const tableCell = { background: color.bg, padding: "12px 16px" };
const marker = (accent) => ({ fontFamily: CONDENSED, fontWeight: 800, fontSize: 40, lineHeight: 1, color: accent, letterSpacing: ".04em" });

export default function WetOrDryPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd data={[articleLd({ headline: TITLE, description: LEDE, image: HERO, route: routes.wetOrDry }), faqLd(FAQ)]} />
      <GuideHeader />
      <main>
        <ArticleHead
          gradient="linear-gradient(160deg,#16120f 0%,#080A0C 55%)"
          crumb="Compare"
          tag={
            <>
              <span style={{ color: color.dry }}>DRY</span>
              <span style={{ color: color.mutedLine }}> / </span>
              <span style={{ color: color.wet }}>WET</span>
            </>
          }
          tagLabel="Compare · Atomic series"
          title={TITLE}
          lede={LEDE}
          readTime="6 min read"
        />

        <div style={container}>
          <div style={{ margin: "clamp(-16px,-2vw,-28px) 0 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <figure style={{ margin: 0, position: "relative" }}>
              <img
                src={asset("application/d204-step-1.webp")}
                alt="Spraying Atomic Colored Glaze onto dry paint"
                style={{ display: "block", width: "100%", aspectRatio: "4/3", objectFit: "cover" }}
              />
              <figcaption style={heroCaption(color.dry)}>DRY</figcaption>
            </figure>
            <figure style={{ margin: 0, position: "relative" }}>
              <img
                src={asset("application/d215-step-3.webp")}
                alt="Spraying Atomic Glaze Coating onto wet paint"
                style={{ display: "block", width: "100%", aspectRatio: "4/3", objectFit: "cover" }}
              />
              <figcaption style={heroCaption(color.wet)}>WET</figcaption>
            </figure>
          </div>
          <div style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>Real application footage · APGO</div>
        </div>

        <ArticleBody>
          <p style={lead}>
            <strong style={strong}>
              Atomic Colored Glaze goes on clean, completely dry paint. Atomic Glaze Coating goes on clean paint that is still wet
              after rinsing. Both routines finish with buffing.
            </strong>
          </p>
          <p style={body}>
            If you prefer to dry the car completely before applying a product, choose the dry-surface routine. If you prefer to apply
            your product between rinsing and drying, choose the wet-surface routine.
          </p>

          <section id="compare" style={section}>
            <h2 style={h2}>Compare the two routines</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                fontSize: 15,
                lineHeight: 1.4,
              }}
            >
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 28, lineHeight: 1, color: color.dry }}>DRY</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Atomic Colored Glaze</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 28, lineHeight: 1, color: color.wet }}>WET</span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Atomic Glaze Coating</span>
              </div>
              {COMPARE.map(([label, dry, wet]) => (
                <Fragment key={label}>
                  <div style={tableRowLabel}>{label}</div>
                  <div style={tableCell}>{dry}</div>
                  <div style={tableCell}>{wet}</div>
                </Fragment>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: color.tertiary }}>
              The bottle size does not tell you how many applications you will get. This comparison does not assume equal product
              usage per vehicle.
            </p>
          </section>

          <section id="dry" style={section}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={marker(color.dry)}>DRY</span>
            </div>
            <h2 style={h2Balance}>Choose Atomic Colored Glaze if you prefer to apply after drying</h2>
            <p style={body}>Atomic Colored Glaze keeps product application separate from drying the car.</p>
            <p style={body}>
              Wash and rinse the vehicle, then dry it completely. Make sure the paint is free from grit and dirt before you begin
              spreading or buffing.
            </p>
            <p style={body}>
              Apply a small amount to a section of paint and spread it evenly. Continue section by section. You can buff after
              spreading each section, or—for a more efficient workflow—finish spreading across the car before buffing.
            </p>
            <h3 style={h3}>Less is more</h3>
            <p style={body}>
              Using more product is not the goal. A white haze during application indicates that you have applied too much; it is not
              a sign of a stronger protective layer.
            </p>
            <p style={body}>
              For best results, APGO recommends keeping the car dry for 24 hours after application and buffing. If it rains during
              that period, APGO's practical experience is that a visible difference is usually difficult to notice. You can reapply a
              thin amount after your next wash, once the car is clean and completely dry.
            </p>
            <Callout accent={color.dry}>
              <strong style={strong}>Before choosing this routine:</strong> APGO does not recommend applying Atomic Colored Glaze over
              an existing wax layer.
            </Callout>
            <GuideLinkCard
              href={routes.coloredGlaze}
              accent={color.dry}
              title="Read the Atomic Colored Glaze application guide"
              meta="Guide · 6 min read"
            />
          </section>

          <section id="wet" style={section}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={marker(color.wet)}>WET</span>
            </div>
            <h2 style={h2Balance}>Choose Atomic Glaze Coating if you prefer to apply before drying</h2>
            <p style={body}>Atomic Glaze Coating fits between the rinse and drying stages of your wash.</p>
            <p style={body}>
              Wash the vehicle and rinse away the shampoo. While the clean paint is still wet, spray the product and spread it evenly
              with a damp application cloth.
            </p>
            <p style={body}>
              Next, use a drying towel to remove the water. Finish by buffing with a separate, clean coral-fleece microfiber towel.
            </p>
            <h3 style={h3}>Wet application still includes a final buff</h3>
            <p style={body}>
              "Apply while wet" describes the condition of the paint when you start. It does not mean spraying onto a dirty, rain-wet
              car, rinsing the product off, or skipping the final buff.
            </p>
            <GuideLinkCard
              href={routes.glazeCoating}
              accent={color.wet}
              title="Read the Atomic Glaze Coating application guide"
              meta="Guide · 5 min read"
            />
          </section>

          <section id="cloths" style={section}>
            <h2 style={h2}>Prepare the right cloths</h2>
            <p style={body}>Both routines involve three separate jobs:</p>
            <DashList
              items={[
                {
                  children: (
                    <span>
                      <strong style={strong}>Drying:</strong> removing water from the vehicle.
                    </span>
                  ),
                },
                {
                  children: (
                    <span>
                      <strong style={strong}>Spreading:</strong> distributing the product with an application cloth.
                    </span>
                  ),
                },
                {
                  children: (
                    <span>
                      <strong style={strong}>Buffing:</strong> completing the finish with a clean coral-fleece microfiber towel.
                    </span>
                  ),
                },
              ]}
            />
            <p style={body}>
              With Atomic Colored Glaze, you dry the vehicle before applying the product. With Atomic Glaze Coating, you dry it after
              spreading the product.
            </p>
            <p style={body}>
              Keep your cloths clean and their roles separate. Check the selected product offer for included accessories; do not
              assume every preparation item comes with the bottle.
            </p>
          </section>

          <section id="where" style={section}>
            <h2 style={h2}>Where you can use them</h2>
            <p style={body}>
              Both products work across the exterior—paint, chrome trim, plastic trim, mirror housings, piano-black trim, wheels, and
              glass. The one place they differ is the <strong style={strong}>front windshield</strong>.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16 }}>
              <Callout accent={color.dry}>
                <strong style={strong}>Atomic Colored Glaze:</strong> can be used on the windshield—remove any oil film first.
              </Callout>
              <Callout accent={color.wet}>
                <strong style={strong}>Atomic Glaze Coating:</strong> not recommended on the front windshield.
              </Callout>
            </div>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>Frequently asked questions</h2>
            <FaqList items={FAQ} />
          </section>

          <p style={finePrint}>
            This guide is published by APGO about APGO products. Follow the current directions for the specific product you are using.
          </p>
        </ArticleBody>

        <EndCtaBand
          heading="Pick the point in your wash where you want to apply."
          items={[
            {
              sku: "d204",
              title: "After drying",
              body: (
                <>
                  <span style={{ fontSize: 14, color: color.secondary, fontWeight: 600 }}>Atomic Colored Glaze</span>
                  <span style={{ fontSize: 13, color: color.tertiary, lineHeight: 1.4 }}>
                    For a separate application step on clean, completely dry paint.
                  </span>
                </>
              ),
              href: routes.coloredGlaze,
              cta: "Explore the dry-surface routine →",
            },
            {
              sku: "d215",
              title: "Before drying",
              body: (
                <>
                  <span style={{ fontSize: 14, color: color.secondary, fontWeight: 600 }}>Atomic Glaze Coating</span>
                  <span style={{ fontSize: 13, color: color.tertiary, lineHeight: 1.4 }}>
                    For application on freshly rinsed, wet paint, followed by drying and buffing.
                  </span>
                </>
              ),
              href: routes.glazeCoating,
              cta: "Explore the wet-surface routine →",
            },
          ]}
          note="U.S. launch preparation is underway. Explore the guides now; purchasing links will be added when the products are available."
        />
      </main>
      <GuideFooter />
    </div>
  );
}
