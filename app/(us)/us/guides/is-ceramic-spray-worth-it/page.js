import { Fragment } from "react";
import Link from "next/link";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import FaqList from "@/components/us/guides/FaqList";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd, faqLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Balance, h2Faq, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "Is Ceramic Spray Worth It? An Honest Look";
const H1 = "Is Ceramic Spray Worth It? An Honest Look for Everyday Drivers";
const CRUMB = "Is ceramic spray worth it?";
const DESCRIPTION = "Is ceramic spray worth it? It depends on how you wash, the time you'll spend after a wash, and what you expect from it. See when it pays off and when it won't.";
const COVER = asset("generated/is-ceramic-spray-worth-it-hero.png");
const HERO_ALT = "Driver holding a microfiber towel beside a freshly washed car in a driveway at dusk";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.isSprayWorthIt },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.isSprayWorthIt,
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
    q: "Are ceramic sprays good?",
    a: "They can be, for drivers who hand-wash, reapply when needed, and expect easier washing and gloss rather than repairs.",
  },
  {
    q: "Is ceramic spray good for car paint?",
    a: "Used as labeled on clean paint, it adds a thin, renewable protective layer. It doesn't fix existing defects.",
  },
  {
    q: "Is ceramic spray worth it compared with wax?",
    a: "It depends on your routine. See car wax vs spray ceramic coating for the side-by-side.",
  },
  {
    q: "Is ceramic spray worth it if I use automatic car washes?",
    a: "Less so if you won't reapply, since frequent automatic washes can wear protection down faster. See does an automatic car wash remove ceramic coating.",
  },
  {
    q: "Is it worth putting on a new car?",
    a: "That's its own question. See should you ceramic coat a new car.",
  },
];

const TOC = [
  { href: "#short-answer", label: "The Short Answer" },
  { href: "#what-you-get", label: "What You Actually Get" },
  { href: "#real-cost", label: "The Real Cost Is Time" },
  { href: "#worth-it", label: "When It's Worth It" },
  { href: "#not-worth-it", label: "When It Probably Isn't" },
  { href: "#another-option", label: "Another Option" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_DECISION = [
  { situation: "How you wash", worth: "By hand, at home", not: "Mostly tunnel washes" },
  { situation: "Time after a wash", worth: "Happy to spend a little extra", not: "Want to be done when the car is dry" },
  { situation: "Durability expectation", worth: "Fine with reapplying when it fades", not: "Want years from one application" },
  { situation: "Existing coatings or wax", worth: "Clean paint, or willing to prep", not: "Unknown coating you'd rather not touch" },
  { situation: "What you expect it to fix", worth: "Nothing; you want gloss and easier washing", not: "Scratches, swirls, or chips" },
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

const bulletList = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 };
const bulletItem = { ...body, margin: 0, padding: "0 0 0 20px", position: "relative" };
const bullet = { position: "absolute", left: 0, color: color.orange };

export default function IsCeramicSprayWorthItPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.isSprayWorthIt }),
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
          tagLabel="Worth it for you"
          title={H1}
          lede={DESCRIPTION}
          readTime="6 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            Is ceramic spray worth it? For some drivers, yes; for others, it's time and effort that won't pay off. The answer has less to do with the bottle than with you: how you wash your car, how much time you'll spend after a wash, and what you expect the product to do. This guide walks through those questions using your own habits, so you can decide for yourself. It doesn't rank products and it doesn't talk prices. APGO's own products, which come up later, are a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="short-answer" style={section}>
            <h2 style={h2Balance}>Is Ceramic Spray Worth It? The Short Answer</h2>
            <p style={body}>
              It depends on three things: how you wash the car, whether you're willing to spend a little extra time after each wash, and whether your expectations are realistic. If all three line up, a ceramic spray can be a worthwhile part of your routine. If they don't, you'll likely end up disappointed, no matter which product you pick.
            </p>
            <p style={body}>
              Below you'll find what a ceramic spray typically does, what it really costs you, and two short lists: when it's worth it and when it probably isn't.
            </p>
          </section>

          <section id="what-you-get" style={section}>
            <h2 style={h2Balance}>What You Actually Get From a Ceramic Spray</h2>
            <p style={body}>
              Set your expectations by what these products are designed to do, not by the boldest line on the label. Results vary with the product, the prep, and how the car is washed and stored, but in general you can expect three things:
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Easier washing.</strong> A ceramic spray typically leaves the surface slicker, so dirt tends to cling less and rinses off more easily at the next wash.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Gloss.</strong> Most people buy it for the look: paint usually appears glossier and more reflective after application.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Changed water behavior.</strong> Ceramic-category products are commonly marketed on how water behaves on the treated surface, and many tend to make water bead up or sheet off more readily than on bare paint.
              </li>
            </ul>
            <p style={body}>
              So, is ceramic spray good for car paint? Used as labeled on clean paint, it adds a thin protective layer you can renew. It doesn't repair the paint underneath. It also won't fix scratches, it isn't permanent, and it isn't a physical shield against chips; for the full picture, see <Link href={routes.whatIsSprayCeramic} className="us-text-link">what spray ceramic coating is</Link>.
            </p>
          </section>

          <section id="real-cost" style={section}>
            <h2 style={h2Balance}>The Real Cost Is Time, Not Just the Bottle</h2>
            <p style={body}>
              The price tag is only part of the cost. The bigger part, and the one people tend to underestimate, is time. A spray is quick compared with a full coating job, but quick isn't the same as free.
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Every application comes after a wash.</strong> You'll need to set aside extra time on top of washing and drying the car, every time you apply it.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>It wears, so you'll reapply.</strong> Washing and weather gradually wear down any spray layer, so you'll be reapplying based on how the surface looks and feels. Our guide on <Link href={routes.howOftenReapply} className="us-text-link">how often to apply ceramic spray coating</Link> covers how to tell when it's time.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>The first time can take longer.</strong> If there's old wax or an unknown product on the paint, you may need to deal with it before your first application, which adds to the time.
              </li>
            </ul>
            <p style={body}>
              If what you really want is one job that's done and then left alone for years, that's a different kind of product and a different commitment. See <Link href={routes.diyVsPro} className="us-text-link">DIY ceramic coating vs professional</Link> if that's the direction you're leaning.
            </p>
          </section>

          <section id="worth-it" style={section}>
            <h2 style={h2Balance}>When Ceramic Spray Is Worth It</h2>
            <p style={body}>
              A ceramic spray tends to make sense when most of these describe you:
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                You wash the car yourself, by hand.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                You're willing to spend a little more time after a wash to finish the job.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                You're comfortable with protection measured in months rather than years, and you'll reapply when the surface starts to look or feel tired.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                There's no unknown coating on the paint, or you're willing to deal with it first.
              </li>
            </ul>
            <p style={body}>
              The more of these fit, the more likely it's worth it. Notice that none of them is about the car itself. A daily driver parked outside can benefit as much as a weekend car, as long as the routine behind it is realistic. The deciding factor is usually the habit, not the vehicle.
            </p>
          </section>

          <section id="not-worth-it" style={section}>
            <h2 style={h2Balance}>When It Probably Isn't Worth It</h2>
            <p style={body}>
              On the other hand, a ceramic spray probably isn't the right fit if:
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>You want one application to last for years.</strong> That's a different format with a different prep load; see <Link href={routes.sprayVsCoating} className="us-text-link">ceramic spray vs ceramic coating</Link>.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>You expect it to remove scratches or stop rock chips.</strong> A spray layer isn't designed to do either; our guide on <Link href={routes.coatingScratches} className="us-text-link">whether a ceramic coating prevents scratches</Link> explains what a coating can and can't do.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>You mostly use a tunnel car wash and don't plan to reapply.</strong> Frequent automatic washes can wear protection down faster; see <Link href={routes.autoWashCoating} className="us-text-link">does an automatic car wash remove ceramic coating</Link>.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>You don't want to deal with old wax or an unknown product</strong> already on the paint.
              </li>
            </ul>
            <p style={body}>
              Driving a brand-new car? That question has its own answers; see should you ceramic coat a new car.
            </p>
            <p style={body}>
              Here's the same decision at a glance:
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
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Your situation</span>
              </div>
              <div style={tableHead(color.wet)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Leans worth it</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>Leans not worth it</span>
              </div>
              {TABLE_DECISION.map((row) => (
                <Fragment key={row.situation}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.situation}</div>
                  <div style={tableCell}>{row.worth}</div>
                  <div style={tableCell}>{row.not}</div>
                </Fragment>
              ))}
            </div>
          </section>

          <section id="another-option" style={section}>
            <h2 style={h2Balance}>If You Mainly Want "Wash, Finish, Done": Another Option</h2>
            <p style={body}>
              For some drivers, the real appeal isn't ceramic at all. It's the convenience of a quick finishing step right after a wash that you can simply redo later. If that's what you're after, you don't necessarily need a ceramic product.
            </p>
            <p style={body}>
              APGO makes a silicone-based spray glaze. It isn't a ceramic coating, and it isn't a type of ceramic spray. APGO Atomic Colored Glaze (D204) goes on after the car is washed and completely dried, and it lasts up to about 6 months (180 days). That's a ceiling, not a promise. For upkeep, you can apply another thin layer once the car is washed and fully dried; it's optional, and a thicker coat isn't better. D204 doesn't fill or remove existing scratches or swirl marks.
            </p>
            <p style={body}>
              APGO Atomic Glaze Coating (D215) goes on after washing and rinsing, while the paint is still wet: you spray it on, spread it with a damp application cloth, towel-dry the car, then buff with a clean coral-fleece microfiber towel. It lasts up to about 4 months (120 days), which is also a ceiling. The two are alternative routines, not a layering system, so contact APGO before combining them.
            </p>
            <p style={body}>
              To see which one suits the way you wash, read <Link href={routes.wetOrDry} className="us-text-link">APGO's wet vs dry glaze routines</Link>, or <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link>.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              If you recognize yourself in the "worth it" list, a ceramic spray is worth trying. If you don't, there's no reason to force it. Already decided to buy? Our guide on <Link href={routes.chooseCoatingSpray} className="us-text-link">how to choose a ceramic coating spray</Link> covers what to check on the label. Still comparing protection types? Start with <Link href={routes.paintProtectionTypes} className="us-text-link">types of car paint protection</Link>. Another option is a silicone-based spray glaze; you can <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link>.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["waxVsSprayCoating", "diyVsPro", "chooseCoatingSpray"]} />
      </main>
    </div>
  );
}
