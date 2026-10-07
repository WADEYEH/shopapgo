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

const TITLE = "Can You Use Ceramic Coating on a Windshield?";
const H1 = "Can You Use Ceramic Coating on a Windshield? (And How to Prep the Glass)";
const CRUMB = "Coating on a windshield";
const DESCRIPTION = "Ceramic coating on windshield glass: check that the label lists glass, remove the oil film first, test a small area, and fix wiper chatter before you drive.";
const COVER = asset("generated/ceramic-coating-on-windshield-hero.png");
const HERO_ALT = "Folded microfiber towel resting on a clean, dry windshield in a dim garage";
const INLINE_IMAGE = asset("generated/ceramic-coating-on-windshield-defilm-first.png");
const INLINE_ALT = "Windshield split between a hazy filmed half and a clean half under the words De-film first";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: routes.windshieldCoating },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: routes.windshieldCoating,
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
    q: "Can you use ceramic spray on a windshield?",
    a: "Only if its label lists glass or the windshield, and only after the oil film has been removed.",
  },
  {
    q: "Can I use a paint coating on my windshield?",
    a: "Check the label first. Glass-specific products are formulated with wipers and visibility in mind, and paint products may not be.",
  },
  {
    q: "How do I remove oil film from a windshield?",
    a: "Clean the glass, then use a dedicated oil-film remover or glass polish as its label directs, and wipe the glass completely clean and dry.",
  },
  {
    q: "Why do my wipers chatter after I treated the glass?",
    a: "Common causes are leftover residue, uneven application, oil film that wasn't fully removed, or dirty or worn wiper blades.",
  },
  {
    q: "Can I use APGO Atomic Glaze Coating on my side windows?",
    a: "Its approved surfaces are paint and wraps only. For any glass, check the current label or contact APGO support.",
  },
];

const TOC = [
  { href: "#can-you", label: "Can You Coat a Windshield?" },
  { href: "#why-glass-different", label: "Why Glass Is Different" },
  { href: "#remove-oil-film", label: "Remove Oil Film First" },
  { href: "#checklist", label: "Prep the Glass: Checklist" },
  { href: "#apgo", label: "APGO's Spray Glaze on Glass" },
  { href: "#wiper-chatter", label: "Wiper Chatter or Smearing?" },
  { href: "#faq", label: "FAQ" },
  { href: "#bottom-line", label: "Bottom Line" },
];

const TABLE_GLASS = [
  { row: "Wiper contact", front: "Constant in wet weather", side: "Usually little or none on side glass; a rear wiper on some cars" },
  { row: "Visibility impact", front: "Directly in the driver's line of sight", side: "Mostly for mirrors, shoulder checks, and reversing" },
  { row: "Oil-film build-up", front: "Often the heaviest, from road spray and wipers", side: "Usually lighter" },
  { row: "What to check on the label", front: "That the windshield or glass is listed", side: "That glass is listed; don't assume all glass is covered" },
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
const tableHeadText = { fontFamily: CONDENSED, fontWeight: 700, fontSize: 16, textTransform: "uppercase" };

const bulletList = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 };
const bulletItem = { ...body, margin: 0, padding: "0 0 0 20px", position: "relative" };
const bullet = { position: "absolute", left: 0, color: color.orange };
const numberedList = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 };
const numberedItem = { ...body, display: "flex", gap: 12 };
const number = { fontFamily: CONDENSED, fontWeight: 800, fontSize: 20, color: color.orange, flex: "none", width: 24 };

export default function CeramicCoatingOnWindshieldPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: H1, description: DESCRIPTION, image: COVER, route: routes.windshieldCoating }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
          faqLd(FAQ),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#16120f 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="PAINT, VEHICLE & SURFACE"
          tagColor={color.orange}
          tagLabel="Glass prep"
          title={H1}
          lede={DESCRIPTION}
          readTime="6 min read"
          heroSrc={COVER}
          heroAlt={HERO_ALT}
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            Putting ceramic coating on a windshield is possible, but glass isn't paint: your wipers drag across it and your view depends on it. So the questions are a little different from the ones you ask about a hood or a door. This guide covers how to tell whether a product can go on glass at all, how to remove the oil film that builds up on a windshield, how the windshield differs from side and rear glass, and what to do if your wipers start chattering or smearing afterward. APGO's own products, which come up later, are a silicone-based spray glaze, not a ceramic coating.
          </p>

          <section id="can-you" style={section}>
            <h2 style={h2Balance}>Can You Use Ceramic Coating on a Windshield?</h2>
            <p style={body}>
              Yes, as long as the product's label lists glass or the windshield. If it doesn't, don't assume it's fine. The same goes if you're asking "can you use ceramic spray on a windshield?" The label decides, not the word "ceramic" on the front.
            </p>
            <p style={body}>
              There are coatings and rain treatments made specifically for glass, and there are products made for paint. They're usually formulated with different goals. A glass product has to hold up to wiper friction and stay optically clear, while a paint product is built around gloss and a slick feel on painted panels. Glass-specific products are also typically designed to help water run off the glass more easily. Before you put any paint product on glass, check what its label says about glass.
            </p>
          </section>

          <section id="why-glass-different" style={section}>
            <h2 style={h2Balance}>Why Glass Is Different, Especially the Windshield</h2>
            <p style={body}>
              Three things make glass a different job from paint:
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Wiper friction.</strong> Every time it rains, the wipers sweep back and forth across the windshield. Any uneven layer or leftover residue tends to show up there first.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Visibility is safety.</strong> A faint mark on paint is cosmetic. Residue on the windshield can affect what you see while driving.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                <strong style={strong}>Film builds up.</strong> Windshields tend to collect a thin oily film over time from road grime, exhaust, wiper residue, and products sprayed at car washes.
              </li>
            </ul>

            <h3 style={h3}>Front Windshield vs Side and Rear Glass</h3>
            <p style={body}>
              The front windshield is the most demanding piece of glass on the car. It has wipers, and it sits directly in the driver's line of sight. Side and rear glass usually see less friction and carry less risk, but the product's label still decides which glass it can go on.
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
                <span style={tableHeadText}></span>
              </div>
              <div style={tableHead(color.orange)}>
                <span style={tableHeadText}>Front windshield</span>
              </div>
              <div style={tableHead(color.dry)}>
                <span style={tableHeadText}>Side & rear glass</span>
              </div>
              {TABLE_GLASS.map((row) => (
                <Fragment key={row.row}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.row}</div>
                  <div style={tableCell}>{row.front}</div>
                  <div style={tableCell}>{row.side}</div>
                </Fragment>
              ))}
            </div>
          </section>

          <section id="remove-oil-film" style={section}>
            <h2 style={h2Balance}>How to Remove Oil Film From a Windshield</h2>
            <p style={body}>
              Oil film is a thin layer you often can't see directly, but you can see its effects. Glass cleaner seems to smear instead of clearing, and at night, headlights and streetlights may look hazy or ringed. It builds up gradually, so many drivers don't notice it until they look for it.
            </p>
            <p style={body}>
              It matters because anything you put on the windshield has to bond to clean glass. With the film still there, a product is hard to apply cleanly and evenly, and the result can look patchy.
            </p>
            <p style={body}>
              A general approach:
            </p>
            <ol style={numberedList}>
              <li style={numberedItem}>
                <span style={number}>1</span>
                <span><strong style={strong}>Clean the surface.</strong> Wash the car, or at least clean the glass with a glass cleaner, to remove loose dirt and dust.</span>
              </li>
              <li style={numberedItem}>
                <span style={number}>2</span>
                <span><strong style={strong}>Treat the film.</strong> Use a dedicated oil-film remover or a glass polish, following that product's label.</span>
              </li>
              <li style={numberedItem}>
                <span style={number}>3</span>
                <span><strong style={strong}>Remove all residue.</strong> Rinse or wipe the glass completely clean, then dry it fully.</span>
              </li>
              <li style={numberedItem}>
                <span style={number}>4</span>
                <span><strong style={strong}>Check the result.</strong> Look at the glass in good light. It should look even, and a towel should glide across it without a smeary drag.</span>
              </li>
            </ol>
            <p style={body}>
              Oil-film removers and glass polishes don't all work the same way, so follow the directions on whichever one you use.
            </p>
            <figure style={{ margin: 0 }}>
              <img
                src={INLINE_IMAGE}
                alt={INLINE_ALT}
                style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "contain", background: color.raised }}
              />
            </figure>
          </section>

          <section id="checklist" style={section}>
            <h2 style={h2Balance}>Prep the Glass: A Quick Checklist</h2>
            <p style={body}>
              Before you apply anything to glass, make sure:
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                The car is washed, and the glass has been de-filmed and fully dried.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                The product's label lists glass or the windshield.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                You've tested a small corner of the glass that isn't in the driver's line of sight.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                The wiper blades are clean, and worn blades have been replaced.
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                You've read the product label's application directions for glass.
              </li>
            </ul>
            <p style={body}>
              For the full post-wash prep routine, see <Link href={routes.prepForSpray} className="us-text-link">how to prep your car for ceramic spray</Link>. To see where glass fits in the overall order, our guide to <Link href={routes.detailingSteps} className="us-text-link">exterior car detailing steps</Link> puts it near the end. For drying and finishing after a wash, see <Link href={routes.afterWashing} className="us-text-link">what to do after washing your car</Link>.
            </p>
          </section>

          <section id="apgo" style={section}>
            <h2 style={h2Balance}>Using APGO's Silicone-Based Spray Glaze on Glass</h2>
            <p style={body}>
              APGO Atomic Colored Glaze (D204) is a silicone-based spray glaze. It's suitable for paint, wraps, glass, and wheels, and it's applied after the car is washed and completely dried. On the front windshield, remove any oil film first. On a windshield that hasn't been de-filmed, the result won't be clean. The application steps are in <Link href={routes.coloredGlaze} className="us-text-link">how to apply APGO Atomic Colored Glaze</Link>.
            </p>
            <p style={body}>
              APGO Atomic Glaze Coating (D215) is also a silicone-based spray glaze, but its approved surfaces are paint and wraps only. For any glass, including the front windshield, check the current label or contact APGO support. See <Link href={routes.glazeCoating} className="us-text-link">how to apply APGO Atomic Glaze Coating</Link> for its routine on paint.
            </p>
            <p style={body}>
              To decide which routine fits the way you wash, see <Link href={routes.wetOrDry} className="us-text-link">APGO's wet vs dry glaze routines</Link>, or <Link href={routes.compare} className="us-text-link">compare APGO's silicone-based spray glaze</Link>.
            </p>
          </section>

          <section id="wiper-chatter" style={section}>
            <h2 style={h2Balance}>Wiper Chatter or Smearing After a Glass Treatment?</h2>
            <p style={body}>
              If your wipers start chattering, skipping, or leaving a smeary film after you've treated the glass, the cause is usually one of these:
            </p>
            <ul style={bulletList}>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                Product residue that wasn't wiped off completely
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                Uneven application
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                Oil film that wasn't fully removed before application
              </li>
              <li style={bulletItem}>
                <span style={bullet}>•</span>
                Dirty or worn wiper blades
              </li>
            </ul>
            <p style={body}>
              Start with the simple fixes. Clean the wiper blades, clean the glass again as directed by the label of the product you used, and replace blades that are worn or cracked. If you think a specific product is causing the problem, follow that product's label or contact its maker. If you used an APGO product, check the current label or contact APGO support.
            </p>
            <p style={body}>
              For streaks and high spots on paint, which are a separate problem, see <Link href={routes.streaksHighSpots} className="us-text-link">how to fix streaks and high spots</Link>.
            </p>

            <h3 style={h3}>When Not to Drive</h3>
            <p style={body}>
              If your view is affected in any way, whether it's smearing, glare or halos around lights, or wipers that won't clear the glass, fix it before you drive. A cosmetic flaw on paint can wait; a windshield you can't see through clearly can't.
            </p>
          </section>

          <section id="faq" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={h2Faq}>FAQ</h2>
            <FaqList items={FAQ} />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom Line</h2>
            <p style={body}>
              Glass isn't paint. Before you put anything on a windshield, confirm the label lists glass, remove the oil film first, test a small area out of your line of sight, and don't drive if your view is affected. If you use APGO's D204 on the windshield, remove any oil film first; for D215 on any glass, check the current label or contact APGO support.
            </p>
          </section>

          <p style={finePrint}>
            This article is published by APGO. General guidance does not replace the directions for a specific product.
          </p>
        </ArticleBody>

        <RelatedGuides items={["prepForSpray", "detailingSteps", "coloredGlaze"]} />
      </main>
    </div>
  );
}
