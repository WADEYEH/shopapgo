import ArticleHead from "@/components/us/guides/ArticleHead";
import HeroFigure from "@/components/us/guides/HeroFigure";
import ArticleBody from "@/components/us/guides/ArticleBody";
import Callout from "@/components/us/guides/Callout";
import StepRow from "@/components/us/guides/StepRow";
import ProductAside from "@/components/us/guides/ProductAside";
import MistakesList from "@/components/us/guides/MistakesList";
import FaqList from "@/components/us/guides/FaqList";
import GuideLinkCard from "@/components/us/guides/GuideLinkCard";
import EndCtaBand from "@/components/us/guides/EndCtaBand";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, faqLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Faq, section, lead, body, strong, finePrint, chip } from "@/components/us/guides/styles";

const TITLE = "How to apply APGO Atomic Glaze Coating";
const LEDE =
  "Apply it right after rinsing, while the paint is still wet—then towel-dry the car and finish with a coral-fleece buff. Here's the full routine, tool by tool.";
const HERO = asset("application/d215-step-3.webp");

export const metadata = {
  title: TITLE,
  description: LEDE,
  alternates: { canonical: routes.glazeCoating },
  openGraph: { title: TITLE, description: LEDE, url: routes.glazeCoating, images: [HERO] },
};

const FAQ = [
  {
    q: "Should the car be wet or dry before application?",
    a: "Wet. Apply Atomic Glaze Coating right after washing and rinsing, while the paint is still wet. Don't dry the car first.",
  },
  { q: "Should the application cloth be damp?", a: "Yes. Use a damp application cloth to spread the product over the wet paint." },
  {
    q: "Do I still need to dry the car?",
    a: "Yes. After spreading, towel-dry the car with a clean drying towel. Applying on wet paint doesn't remove the drying step—it just moves it after application.",
  },
  {
    q: "Do I need to buff after drying?",
    a: "Yes. Once the car is dry, buff with a clean coral-fleece microfiber towel. This is the final step.",
  },
  {
    q: "What's the difference between the application, drying, and buffing cloths?",
    a: "The damp application cloth spreads the product. The drying towel removes water from the car. The coral-fleece towel buffs the dry paint at the end. Keep them separate.",
  },
  {
    q: "How does this routine differ from Atomic Colored Glaze?",
    a: "Colored Glaze goes on completely dry paint as its own step after the car is dried. Glaze Coating goes on wet paint straight after rinsing, then you dry and buff. Each product has its own guide—follow the one for the product you're using.",
  },
];

const MISTAKES = [
  {
    term: "Starting before the car is actually clean",
    desc: "Wash and rinse first. Grit left on the paint gets dragged around by every cloth that follows.",
  },
  { term: 'Treating "wet" as "any wet car"', desc: "Wet means freshly washed and rinsed—not rained on, not dusty. Wash first, then apply." },
  {
    term: "Mixing up the three cloths",
    desc: "Damp application cloth to spread, drying towel to dry, coral-fleece towel to buff. Each does one job.",
  },
  { term: "Stopping after drying", desc: "Towel-drying isn't the finish. Buff with the coral-fleece towel once the car is dry." },
  {
    term: "Following the Colored Glaze routine",
    desc: "Colored Glaze is applied to dry paint. Glaze Coating is applied to wet paint and has its own steps—don't carry the dry-paint routine over.",
  },
];

const TOC = [
  { href: "#need", label: "1. What you need" },
  { href: "#before", label: "2. Before you start" },
  { href: "#where", label: "3. Where you can use it" },
  { href: "#steps", label: "4. The application routine" },
  { href: "#mistakes", label: "5. Common mistakes" },
  { href: "#faq", label: "6. FAQ" },
  { href: "#dry", label: "7. Product details and related guides" },
];

const SURFACES = ["Paint", "Chrome trim", "Plastic trim", "Mirror housings", "Piano-black trim", "Wheels", "Side and rear glass"];

const needRow = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: 14,
  padding: "14px 0",
  borderBottom: `1px solid ${color.border}`,
  fontSize: 15,
  lineHeight: 1.45,
};
const needNum = { fontFamily: CONDENSED, fontWeight: 800, fontSize: 22, color: color.wet, lineHeight: 1, width: 30 };

const PLACEHOLDER_LABEL = "Buffing the dry paint with a clean coral-fleece microfiber towel · real footage needed";

export default function GlazeCoatingPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd data={[articleLd({ headline: TITLE, description: LEDE, image: HERO, route: routes.glazeCoating }), faqLd(FAQ)]} />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(200deg,#121a0e 0%,#080A0C 55%)"
          crumb="Glaze Coating · WET"
          tag="WET"
          tagColor={color.wet}
          tagLabel="Atomic Glaze Coating · D215"
          title={TITLE}
          lede={LEDE}
          readTime="5 min read"
        />

        <HeroFigure
          src={HERO}
          alt="Spraying APGO Atomic Glaze Coating onto a hood that is still wet after rinsing"
          caption="Real application footage · APGO"
        />

        <ArticleBody toc={TOC}>

          <p style={lead}>
            APGO Atomic Glaze Coating is applied <strong style={strong}>after washing, while the paint is still wet</strong>. The
            routine is: wash and rinse, spray onto the wet paint, spread with a damp application cloth, towel-dry the car, then buff
            with a coral-fleece microfiber towel. Applying on wet paint saves you the separate drying step before application—it
            doesn't skip the drying or the final buff.
          </p>

          <section id="need" style={{ ...section, gap: 18 }}>
            <h2 style={h2}>1. What you need</h2>
            <p style={body}>Three cloths do three different jobs. Keeping them separate is most of what makes this routine work.</p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", borderTop: `1px solid ${color.border}` }}>
              <li style={needRow}>
                <span style={needNum}>—</span>
                <span>
                  <strong style={strong}>APGO Atomic Glaze Coating</strong>, 200 mL / 6.8 fl oz
                </span>
              </li>
              <li style={needRow}>
                <span style={needNum}>01</span>
                <span>
                  <strong style={strong}>A damp application cloth</strong> — for spreading the product evenly over the wet paint.
                </span>
              </li>
              <li style={needRow}>
                <span style={needNum}>02</span>
                <span>
                  <strong style={strong}>A clean drying towel</strong> suitable for car paint — for towel-drying the water off the car.
                </span>
              </li>
              <li style={needRow}>
                <span style={needNum}>03</span>
                <span>
                  <strong style={strong}>A clean coral-fleece microfiber towel</strong> — for the final buff, after the car is dry.
                </span>
              </li>
            </ul>
            <span style={{ fontSize: 13, color: color.tertiary, lineHeight: 1.45 }}>
              These are the items you'll need on hand. They aren't included with the bottle; what's offered alongside Glaze Coating in
              the US will be shown on the product page when it's available.
            </span>
          </section>

          <section id="before" style={section}>
            <h2 style={h2}>2. Before you start</h2>
            <p style={body}>
              <strong style={strong}>Wash the car and rinse off all the soap.</strong> Check that there's no grit, sand, or dirt left
              on the paint before you touch it with a cloth—anything still on the surface can be dragged across the paint while you
              spread, dry, or buff. Your application cloth and both towels should be clean, too.
            </p>
            <p style={body}>
              "Wet" means <strong style={strong}>freshly washed and rinsed</strong>. It doesn't mean spraying onto a car that's wet
              from rain or still has dust on it.
            </p>
            <p style={body}>
              Unlike Atomic Colored Glaze, you don't dry the whole car before applying. Leave the rinse water on the paint and go
              straight to application.
            </p>
            <Callout accent={color.orange}>
              Skip the front windshield—Glaze Coating isn't recommended there. See "Where you can use it" below.
            </Callout>
          </section>

          <section id="where" style={section}>
            <h2 style={h2}>3. Where you can use it</h2>
            <p style={body}>Atomic Glaze Coating can be used across the exterior—paint and the other materials around it.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SURFACES.map((s) => (
                <span key={s} style={chip}>
                  {s}
                </span>
              ))}
            </div>
            <Callout accent={color.wet}>
              <strong style={strong}>Not for the front windshield.</strong> We don't recommend using Glaze Coating on the windshield.
              Everywhere else on the exterior is fine.
            </Callout>
          </section>

          <section id="steps" style={{ ...section, gap: 20 }}>
            <h2 style={h2}>4. The application routine</h2>
            <p style={body}>
              Five steps, three cloths. The tool changes at each step, so it's worth reading through once before you start.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <StepRow accent={color.wet} title="01 · Wash and rinse" src={asset("application/d215-step-1.webp")} alt="Rinsing the car after washing">
                Wash the car as usual and rinse all the soap off. Leave the water on the paint—don't dry it yet.
              </StepRow>
              <StepRow
                accent={color.wet}
                title="02 · Apply to wet paint"
                src={asset("application/d215-step-3.webp")}
                alt="Spraying Glaze Coating onto the wet hood"
              >
                Spray Atomic Glaze Coating onto the clean, still-wet paint, working one section at a time.
              </StepRow>
              <StepRow
                accent={color.wet}
                title="03 · Spread with a damp application cloth"
                src={asset("application/d215-step-2.webp")}
                alt="Spreading the product over wet paint with a damp application cloth"
              >
                Spread the product evenly across the section with the damp application cloth. This is the application cloth's only
                job—don't use the drying towel here.
              </StepRow>
              <StepRow
                accent={color.wet}
                title="04 · Towel-dry"
                src={asset("application/d215-step-4.webp")}
                alt="Towel-drying the hood with a clean drying towel"
              >
                Switch to the drying towel and dry the water off the car. You're not done yet—there's one more step.
              </StepRow>
              <StepRow
                accent={color.wet}
                title="05 · Finish with a coral-fleece towel"
                media={
                  <div
                    role="img"
                    aria-label={PLACEHOLDER_LABEL}
                    style={{
                      width: "100%",
                      aspectRatio: "4/3",
                      background: "repeating-linear-gradient(135deg,#15181d 0 14px,#111419 14px 28px)",
                      border: `1px solid ${color.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
                        fontSize: 12,
                        letterSpacing: ".08em",
                        color: color.quiet2,
                        textTransform: "uppercase",
                        textAlign: "center",
                        padding: "0 16px",
                      }}
                    >
                      {PLACEHOLDER_LABEL}
                    </span>
                  </div>
                }
              >
                With the car dry, buff the paint with the clean coral-fleece microfiber towel. That's the finish.
              </StepRow>
            </div>
            <Callout accent={color.wet}>
              <strong style={strong}>The order matters:</strong> apply on wet paint → spread with the damp cloth → towel-dry → buff
              with coral fleece. Drying the car is not the last step.
            </Callout>
          </section>

          <section id="mistakes" style={section}>
            <h2 style={h2}>5. Common mistakes</h2>
            <MistakesList items={MISTAKES} />
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>6. FAQ</h2>
            <FaqList items={FAQ} />
          </section>

          <section id="dry" style={section}>
            <h2 style={h2}>7. Product details and related guides</h2>
            <p style={body}>
              Atomic Glaze Coating is 200 mL / 6.8 fl oz and is applied to wet paint. If you'd rather dry the car completely first and
              do a dedicated finish afterward, APGO's dry-surface product, Atomic Colored Glaze, has its own routine and guide. The
              instructions on this page are for Glaze Coating only.
            </p>
            <ProductAside sku="d215" alt="APGO Atomic Glaze Coating, 200 mL bottle and box" meta="200 mL / 6.8 fl oz · Apply before final drying" />
            <GuideLinkCard
              href={routes.coloredGlaze}
              accent={color.dry}
              word="DRY"
              title="How to apply APGO Atomic Colored Glaze"
              meta="Guide · 6 min read"
            />
          </section>

          <p style={finePrint}>
            This guide is written by APGO about an APGO product. Use only as directed and follow the current product label. Product
            details, availability, and ordering will be shown on the product page when the product is available in the US.
          </p>
        </ArticleBody>

        <EndCtaBand
          heading="Two routines. Pick the one you'll keep up."
          items={[
            {
              sku: "d215",
              title: "WET",
              body: <span style={{ fontSize: 13, color: color.tertiary }}>Atomic Glaze Coating · before final drying</span>,
              href: routes.compare,
              cta: "View product details →",
            },
            {
              sku: "d204",
              title: "DRY",
              body: <span style={{ fontSize: 13, color: color.tertiary }}>Atomic Colored Glaze · after drying</span>,
              href: routes.compare,
              cta: "View product details →",
            },
          ]}
        />

        <RelatedGuides items={["coloredGlaze", "wetOrDry", "afterWashing"]} />
      </main>
    </div>
  );
}
