import GuideHeader from "@/components/us/guides/GuideHeader";
import GuideFooter from "@/components/us/guides/GuideFooter";
import ArticleHead from "@/components/us/guides/ArticleHead";
import HeroFigure from "@/components/us/guides/HeroFigure";
import ArticleBody from "@/components/us/guides/ArticleBody";
import OnThisPage from "@/components/us/guides/OnThisPage";
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
import { color } from "@/lib/us/tokens";
import { h2, h2Faq, section, lead, body, strong, finePrint, chip, label } from "@/components/us/guides/styles";

const TITLE = "How to apply APGO Atomic Colored Glaze";
const LEDE =
  "The dry-surface routine, start to finish: how to prep the paint, how little product to use, when to buff, and what to do for the first 24 hours.";
const HERO = asset("application/d204-step-1.webp");

export const metadata = {
  title: TITLE,
  description: LEDE,
  alternates: { canonical: routes.coloredGlaze },
  openGraph: { title: TITLE, description: LEDE, url: routes.coloredGlaze, images: [HERO] },
};

const FAQ = [
  {
    q: "Can I apply it if the car is still a little damp?",
    a: "No. Colored Glaze is for completely dry paint. Finish drying the whole car first. If you'd rather work on wet paint, that's what Atomic Glaze Coating is for.",
  },
  {
    q: "How do I know if I've sprayed too much?",
    a: "A white haze on the section you're working is the tell. It means too much product on that spot—not a stronger result. For scale: 4–6 sprays covers a sedan's whole hood. Use a lighter mist on the next section.",
  },
  { q: "Do I have to wait before buffing?", a: "No waiting period is needed. You can buff right after spreading a section." },
  {
    q: "Can I spread the whole car first and buff everything at the end?",
    a: "Yes—that's how we'd do it to save time. Spray and spread one small section at a time until the car is done, then buff it all. Just don't spray the entire car before you start spreading, and don't leave it unbuffed until the next day.",
  },
  {
    q: "How long should I keep the car dry afterward?",
    a: "For the best result, avoid water—washing or rain—for 24 hours after you finish.",
  },
  {
    q: "What if it rains within the first 24 hours?",
    a: "In our experience it usually doesn't leave a visible difference. You don't need to redo it right away. At your next wash, clean and fully dry the car, then apply another thin layer.",
  },
  {
    q: "Can I use it again after every wash?",
    a: "Yes. Once the car is washed and fully dried, you can apply another thin layer as upkeep. It's optional, not required at every wash.",
  },
  { q: "Can I apply it over wax?", a: "We don't recommend it. Start with paint that has no wax on it." },
  {
    q: "Where on the car can I use it?",
    a: "Anywhere on the exterior: paint, chrome, plastic trim, mirror housings, piano-black trim, wheels, and glass. On the front windshield, remove any oil film first. Follow the current product label.",
  },
];

const MISTAKES = [
  {
    term: "Spraying too much",
    desc: "The most common one. A white haze while you work means too much product on that area. Remember the reference: 4–6 sprays for an entire sedan hood. Go lighter on the next section.",
  },
  {
    term: "Spraying the whole car before spreading",
    desc: "Spray and spread one small section at a time. Buffing can wait until the end; spreading can't.",
  },
  {
    term: "Starting on paint that isn't fully clean and dry",
    desc: "Leftover grit gets dragged across the paint and can leave fine scratches. Water thins the product as you spread.",
  },
  { term: "Applying over wax", desc: "Not recommended. Start with paint that's free of wax." },
  { term: "Working in the sun on a hot panel", desc: "Shade and cool paint make the routine easy and even." },
];

const TOC = [
  { href: "#less", label: "1. The one rule: less is more" },
  { href: "#need", label: "2. What you need" },
  { href: "#before", label: "3. Before you start" },
  { href: "#where", label: "4. Where you can use it" },
  { href: "#steps", label: "5. The routine: spray, spread, buff" },
  { href: "#after", label: "6. The first 24 hours" },
  { href: "#upkeep", label: "7. Using it again after each wash" },
  { href: "#mistakes", label: "8. Common mistakes" },
  { href: "#wet", label: "9. Prefer to apply while wet?" },
  { href: "#faq", label: "10. FAQ" },
];

const SURFACES = ["Paint", "Chrome trim", "Plastic trim", "Mirror housings", "Piano-black trim", "Wheels", "Glass"];

const needCard = { border: `1px solid ${color.border}`, padding: 18, display: "flex", flexDirection: "column", gap: 12 };
const needList = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 15, lineHeight: 1.45 };

export default function ColoredGlazePage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd data={[articleLd({ headline: TITLE, description: LEDE, image: HERO, route: routes.coloredGlaze }), faqLd(FAQ)]} />
      <GuideHeader />
      <main>
        <ArticleHead
          gradient="linear-gradient(160deg,#1a1214 0%,#080A0C 55%)"
          crumb="How to apply"
          tag="DRY"
          tagColor={color.dry}
          tagLabel="Atomic Colored Glaze · D204"
          title={TITLE}
          lede={LEDE}
          readTime="6 min read"
        />

        <HeroFigure
          src={HERO}
          alt="Spraying a light mist of APGO Atomic Colored Glaze onto a clean, dry hood panel"
          caption="Real application footage · APGO"
        />

        <ArticleBody>
          <OnThisPage items={TOC} />

          <p style={lead}>
            Atomic Colored Glaze is APGO's <strong style={strong}>dry-surface</strong> finish. You use it after the car has been washed
            and completely dried, as its own step. The routine stays simple—spray a small area, spread it, buff—but a few details
            make the difference between a clean, even result and a hazy one. This guide covers all of them.
          </p>

          <section id="less" style={section}>
            <h2 style={h2}>1. The one rule: less is more</h2>
            <p style={body}>
              Colored Glaze is meant to go on <strong style={strong}>thin and even</strong>. Spraying more doesn't make it work
              better—it makes it harder to spread and buff. If you see a <strong style={strong}>white haze</strong> forming as you
              work, that's the sign you've used too much on that area.
            </p>
            <Callout accent={color.dry}>
              <strong style={strong}>How much is "a little"?</strong> On a typical sedan, about 4–6 sprays covers the whole hood—and
              the hood is the biggest panel on the car. Scale down from there for doors and fenders. When in doubt, use less.
            </Callout>
          </section>

          <section id="need" style={{ ...section, gap: 18 }}>
            <h2 style={h2}>2. What you need</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16 }}>
              <div style={needCard}>
                <span style={label(color.dry)}>The product</span>
                <ul style={needList}>
                  <li>APGO Atomic Colored Glaze, 300 mL / 10.1 fl oz</li>
                </ul>
                <span style={{ ...label(color.orange), paddingTop: 6 }}>Optional add-on: application kit</span>
                <ul style={needList}>
                  <li>Coating cloth — for spreading the product evenly</li>
                  <li>Coral-fleece towel — for buffing after spreading</li>
                </ul>
                <span style={{ fontSize: 13, color: color.tertiary, lineHeight: 1.45 }}>
                  The kit is planned as a separate, optional purchase for the US and isn't included with the bottle. You can also use
                  your own clean cloths.
                </span>
              </div>
              <div style={needCard}>
                <span style={label(color.tertiary)}>Bring your own</span>
                <ul style={needList}>
                  <li>
                    A clean drying towel suitable for car paint, to dry the whole car after washing (this is separate from the buffing
                    towel)
                  </li>
                  <li>Your usual car-wash supplies</li>
                  <li>A shaded spot, and paint that's cool to the touch</li>
                </ul>
              </div>
            </div>
          </section>

          <section id="before" style={section}>
            <h2 style={h2}>3. Before you start</h2>
            <p style={body}>
              <strong style={strong}>Wash first, then dry completely.</strong> Check the paint for leftover grit, sand, or dust before
              you touch it with a cloth—anything left on the surface can be dragged across the paint while you spread or buff, and
              that's what causes fine scratches and swirl marks. Keep your application cloth and buffing towel clean for the same
              reason.
            </p>
            <p style={body}>
              <strong style={strong}>Skip it if there's wax on the paint.</strong> We don't recommend applying Colored Glaze over a car
              that still has a layer of wax.
            </p>
            <p style={body}>Work in the shade, out of direct sun, on paint that's cool to the touch.</p>
            <Callout accent={color.orange}>
              Colored Glaze doesn't fill or remove existing scratches or swirl marks. Prep is about not adding new ones.
            </Callout>
          </section>

          <section id="where" style={section}>
            <h2 style={h2}>4. Where you can use it</h2>
            <p style={body}>
              Atomic Colored Glaze can be used on the <strong style={strong}>whole exterior</strong>—not just the paint.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SURFACES.map((s) => (
                <span key={s} style={chip}>
                  {s}
                </span>
              ))}
            </div>
            <Callout accent={color.dry}>
              <strong style={strong}>Windshield:</strong> remove any oil film from the front windshield before applying. On a
              windshield that hasn't been de-filmed, the result won't be clean.
            </Callout>
          </section>

          <section id="steps" style={{ ...section, gap: 20 }}>
            <h2 style={h2}>5. The routine: spray, spread, buff</h2>
            <p style={body}>
              Work the car <strong style={strong}>one small section at a time</strong>: spray that section lightly, spread it, then
              move to the next. You can buff each section right after spreading, or—if you'd rather move faster—spread the whole car
              section by section and buff everything at the end.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <StepRow
                accent={color.dry}
                title="01 · Spray"
                src={asset("application/d204-step-1.webp")}
                alt="Spraying a light mist onto one small section of the panel"
              >
                A light mist over one small section. As a reference, 4–6 sprays is enough for a sedan's entire hood, so a door or
                fender needs less. If a white haze appears while you work, you've sprayed too much on that spot.
              </StepRow>
              <StepRow
                accent={color.dry}
                title="02 · Spread"
                src={asset("application/d204-step-2.webp")}
                alt="Spreading the product evenly across the section with a coating cloth"
              >
                Spread it evenly across that section with the coating cloth. Then spray the next section and repeat, working your way
                around the car.
              </StepRow>
              <StepRow
                accent={color.dry}
                title="03 · Buff"
                src={asset("application/d204-step-3.webp")}
                alt="Buffing the paint with a clean coral-fleece towel"
              >
                Buff with a clean, dry towel until the surface is clear. Do it section by section, or once the whole car has been
                spread—either works. Don't leave it unbuffed for extended periods or until the next day.
              </StepRow>
            </div>
            <Callout accent={color.orange}>
              <strong style={strong}>One thing to get right:</strong> "spread section by section, then buff the whole car" is not the
              same as "spray the whole car, then start spreading." Always spray and spread one small area at a time.
            </Callout>
          </section>

          <ProductAside sku="d204" alt="APGO Atomic Colored Glaze, 300 mL bottle and box" meta="300 mL / 10.1 fl oz · Apply after drying" />

          <section id="after" style={section}>
            <h2 style={h2}>6. The first 24 hours</h2>
            <p style={body}>
              For the best result, <strong style={strong}>keep the car dry for 24 hours</strong> after you finish buffing—no washing,
              and ideally no rain.
            </p>
            <p style={body}>
              If it does rain in that window, don't panic. In our own experience, a rain shower in the first day usually doesn't leave
              a visible difference in how the finish looks. There's no need to redo anything right away—just wait for your next wash,
              dry the car completely, and apply another thin layer then.
            </p>
          </section>

          <section id="upkeep" style={section}>
            <h2 style={h2}>7. Using it again after each wash</h2>
            <p style={body}>
              Colored Glaze can be part of your regular wash routine. Any time you've washed, cleaned, and fully dried the car, you can
              apply another <strong style={strong}>thin</strong> layer as upkeep. You don't have to reapply at every wash—it's an
              option, not a requirement—and a thicker coat in one session isn't better than a thin one.
            </p>
          </section>

          <section id="mistakes" style={section}>
            <h2 style={h2}>8. Common mistakes</h2>
            <MistakesList items={MISTAKES} />
          </section>

          <section id="wet" style={section}>
            <h2 style={h2}>9. Prefer to apply while wet?</h2>
            <p style={body}>
              If you'd rather not add a separate step after drying, APGO also makes a <strong style={strong}>wet-surface</strong>{" "}
              product—Atomic Glaze Coating (D215). It has its own routine and its own guide; the instructions on this page are for
              Colored Glaze only.
            </p>
            <GuideLinkCard
              href={routes.glazeCoating}
              accent={color.wet}
              word="WET"
              title="How to apply APGO Atomic Glaze Coating"
              meta="Guide · 5 min read"
            />
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>10. FAQ</h2>
            <FaqList items={FAQ} />
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
              sku: "d204",
              title: "DRY",
              body: <span style={{ fontSize: 13, color: color.tertiary }}>Atomic Colored Glaze · after drying</span>,
              href: routes.compare,
              cta: "View product details →",
            },
            {
              sku: "d215",
              title: "WET",
              body: <span style={{ fontSize: 13, color: color.tertiary }}>Atomic Glaze Coating · before final drying</span>,
              href: routes.compare,
              cta: "View product details →",
            },
          ]}
        />

        <RelatedGuides items={["glazeCoating", "wetOrDry", "afterWashing"]} />
      </main>
      <GuideFooter />
    </div>
  );
}
