import Link from "next/link";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import FaqList from "@/components/us/guides/FaqList";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd, faqLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color } from "@/lib/us/tokens";
import { h2, h2Balance, h2Faq, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "How Long to Wait to Wash After Ceramic Spray";
const H1 = "How Long After Ceramic Coating to Wash Your Car: Waiting Out a Fresh Spray";
const CRUMB = "Wait to wash";
const DESCRIPTION = "How long after ceramic coating to wash car? There's no universal wait, so check your label. What to look for, what to do if it rains, and your first wash.";
const COVER = asset("generated/how-long-to-wait-to-wash-after-ceramic-spray-hero.png");
const HERO_ALT = "Glossy dry car parked under a carport while light rain falls outside at dusk";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.howLongToWaitToWashAfterCeramicSpray },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.howLongToWaitToWashAfterCeramicSpray,
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
    q: "How long does ceramic spray take to cure?",
    a: "It depends on the product, so check your label; there's no general figure that applies to every spray. APGO gives its own guidance for its silicone-based spray glaze instead: a keep-dry recommendation for D204, and for D215, check the current label or contact APGO support.",
  },
  {
    q: "How long after ceramic coating can I drive in rain?",
    a: "Check the label on the product you used. For APGO's silicone-based spray glaze, D204, APGO recommends keeping the car dry for 24 hours after buffing and ideally out of the rain, though in APGO's experience rain in that window usually doesn't leave a visible difference. For D215, check the current label or contact APGO support.",
  },
  {
    q: "Can I take the car through an automatic car wash after applying a spray?",
    a: "Wait until your label's keep-dry period has passed. After that, brushes, strong detergents, and frequent visits usually wear a spray finish down faster; our automatic car wash guide explains why.",
  },
  {
    q: "I washed it too soon. Do I need to redo it?",
    a: "Not necessarily. Watch how water behaves and how the gloss looks over your next few washes, and top up according to the label if needed; our guide to signs it's time to reapply covers what to look for. With APGO's D204, you can simply apply another thin layer after your next wash, once the car is fully dry.",
  },
];

const TOC = [
  { href: "#short-answer", label: "The Short Answer" },
  { href: "#why-wait", label: "Why Products Ask You to Wait" },
  { href: "#what-to-check", label: "What to Check on Your Label" },
  { href: "#rain", label: "If It Rains or Gets Dirty" },
  { href: "#apgo", label: "What APGO Recommends" },
  { href: "#first-wash", label: "Your First Wash After the Wait" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

export default function HowLongToWaitToWashAfterCeramicSprayPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.howLongToWaitToWashAfterCeramicSpray }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
          faqLd(FAQ),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#16120f 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="PREP & APPLICATION"
          tagColor={color.orange}
          tagLabel="After applying"
          title={H1}
          lede={DESCRIPTION}
          readTime="6 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            You've just sprayed, spread, and buffed, and the car looks great. Then the forecast calls for rain tomorrow, or a bird flies over. If you're wondering how long after ceramic coating to wash your car, there's no universal number: the answer is on your product's label. This guide covers what to look for on that label and what to do if the car gets wet or dirty on day one. APGO comes up later, and its products are a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="short-answer" style={section}>
            <h2 style={h2Balance}>How Long After Ceramic Coating to Wash Your Car: The Short Answer</h2>
            <p style={body}>
              Every product has its own keep-dry or cure period, so the only reliable answer is the one printed on the product you used. Don't borrow the waiting time from a different bottle, even one that looks similar. A friend's product, a forum post, or a video about another brand can't tell you what your label says.
            </p>
          </section>

          <section id="why-wait" style={section}>
            <h2 style={h2Balance}>Why Products Ask You to Wait</h2>
            <p style={body}>
              A freshly applied layer needs some time to settle into place. With ceramic products, this is usually called curing. Washing, rubbing, or a heavy soaking during that window can affect the finish, which is why many labels ask you to hold off.
            </p>
            <p style={body}>
              So how long does ceramic spray take to cure? It varies by product, and this guide deliberately doesn't give a general figure. Check the label for yours.
            </p>
            <p style={body}>
              Keep the terms straight, too. "Cure" is the word ceramic products typically use. APGO gives its own guidance for its silicone-based spray glaze instead, covered below: a keep-dry recommendation for D204, and for D215, check the current label or contact APGO support.
            </p>
          </section>

          <section id="what-to-check" style={section}>
            <h2 style={h2Balance}>What to Check on Your Label, and While You Wait</h2>
            <p style={body}>
              Before you put the bottle away, read the label for these points:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>A keep-dry window.</strong> Does it recommend how long to keep the car dry after application?
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>First-wash instructions.</strong> Does it ask for anything specific at the first wash, such as a gentle hand wash?
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Rain, sprinklers, and dew.</strong> Does it say anything about incidental water?
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                <strong style={strong}>Top-up or reapply directions.</strong> What does it say about applying again later?
              </li>
            </ul>
            <p style={body}>
              While you wait, a few simple habits help:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                Park under cover if you can.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                Keep the car away from lawn sprinklers.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                Don't wipe dust off with a dry cloth.
              </li>
              <li style={{ ...body, margin: 0, padding: "0 0 0 20px", position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: color.orange }}>•</span>
                Keep an eye out for bird droppings, tree sap, and other contamination that sits and dries on the paint; the next section covers what to do about it.
              </li>
            </ul>
          </section>

          <section id="rain" style={section}>
            <h2 style={h2Balance}>If It Rains or the Car Gets Dirty on Day One</h2>
            <p style={body}>
              First, don't rush to wipe. Until your label says the car can be washed, avoid dry-wiping dust or rain marks, which can drag grit across the fresh layer.
            </p>
            <p style={body}>
              Once washing is allowed, clean the car gently. The full method is covered in <Link href={routes.howToWashCeramicCoatedCar} className="us-text-link">how to wash a ceramic coated car</Link>, and if you usually use a drive-through, read <Link href={routes.autoWashCoating} className="us-text-link">what an automatic car wash does to a spray coating</Link> first.
            </p>
            <p style={body}>
              Contamination that sits and dries, like bird droppings, is the exception worth watching. As soon as your product allows contact with water, soften it and lift it off gently rather than scrubbing. For how everyday rain, water spots, and road salt affect a protective layer over time, see <Link href={routes.rainDamageCoating} className="us-text-link">does rain damage ceramic coating</Link>.
            </p>
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2Balance}>What APGO Recommends for Its Silicone-Based Spray Glaze</h2>
            <p style={body}>
              What follows is APGO's recommendation for its own silicone-based spray glaze. It is not a general waiting time for ceramic sprays.
            </p>
            <p style={body}>
              <strong style={strong}>APGO Atomic Colored Glaze (D204)</strong> is a silicone-based spray glaze applied to dry paint. For the best result, APGO recommends that you keep the car dry for 24 hours after you finish buffing: no washing, and ideally no rain. If it does rain in that window, APGO's experience is that it usually doesn't leave a visible difference, and there's no need to redo anything right away. At your next wash, once the car is fully dry, you can apply another thin layer. The full routine is in <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link>.
            </p>
            <p style={body}>
              <strong style={strong}>APGO Atomic Glaze Coating (D215)</strong> is a silicone-based spray glaze applied to wet paint. For how long to keep the car dry after applying it, check the current label or contact APGO support. The routine is in <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link>.
            </p>
            <p style={body}>
              To see both side by side, compare <Link href={routes.compare} className="us-text-link">APGO's silicone-based spray glaze</Link>.
            </p>
          </section>

          <section id="first-wash" style={section}>
            <h2 style={h2Balance}>Your First Wash After the Wait</h2>
            <p style={body}>
              When the waiting period is over, keep the first wash gentle: a hand wash with a pH-neutral car shampoo and clean tools. The step-by-step method is in <Link href={routes.howToWashCeramicCoatedCar} className="us-text-link">how to wash a ceramic coated car at home</Link>, and the longer-term routine is covered in <Link href={routes.ceramicCoatingMaintenance} className="us-text-link">ceramic coating maintenance</Link>.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ.map((item) => ({
              q: item.q,
              a: item.q === "Can I take the car through an automatic car wash after applying a spray?"
                ? <>Wait until your label's keep-dry period has passed. After that, brushes, strong detergents, and frequent visits usually wear a spray finish down faster; our <Link href={routes.autoWashCoating} className="us-text-link">automatic car wash guide</Link> explains why.</>
                : item.q === "I washed it too soon. Do I need to redo it?"
                ? <>Not necessarily. Watch how water behaves and how the gloss looks over your next few washes, and top up according to the label if needed; our guide to <Link href={routes.howOftenReapply} className="us-text-link">signs it's time to reapply</Link> covers what to look for. With APGO's D204, you can simply apply another thin layer after your next wash, once the car is fully dry.</>
                : item.a
            }))} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              There's no universal waiting time: check the label on the bottle you used, and if the car gets wet or dirty on day one, don't rush to wipe it; wash gently once your label allows. For APGO's silicone-based spray glaze, D204 comes with a recommendation to keep the car dry for 24 hours, and for D215, check the current label or contact APGO support.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["howOftenReapply", "autoWashCoating", "rainDamageCoating"]} />
      </main>
    </div>
  );
}
