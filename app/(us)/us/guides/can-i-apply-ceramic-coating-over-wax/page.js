import { Fragment } from "react";
import ArticleHead from "@/components/us/guides/ArticleHead";
import ArticleBody from "@/components/us/guides/ArticleBody";
import GuideLinkCard from "@/components/us/guides/GuideLinkCard";
import RelatedGuides from "@/components/us/guides/RelatedGuides";
import JsonLd, { articleLd, breadcrumbLd } from "@/components/us/guides/JsonLd";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { h2, h2Balance, section, lead, body, strong, finePrint } from "@/components/us/guides/styles";

const TITLE = "Can I Apply Ceramic Coating Over Wax?";
const CRUMB = "Coating over wax";
const LEDE =
  "Don't stack ceramic coating over wax by default. Use this checklist—bare paint, old wax, or unknown film—before you spray.";
const HERO = asset("generated/coating-over-wax-decision-checklist.png");

export const metadata = {
  title: `${TITLE} · APGO`,
  description: LEDE,
  alternates: { canonical: routes.coatingOverWax },
  openGraph: { title: `${TITLE} · APGO`, description: LEDE, url: routes.coatingOverWax, images: [HERO] },
};

const TOC = [
  { href: "#why", label: "Why layering is the wrong default" },
  { href: "#whats-on-paint", label: "What's already on the paint?" },
  { href: "#checklist", label: "Decision checklist" },
  { href: "#remove", label: 'What "remove first" means in practice' },
  { href: "#d204", label: "Where D204 fits" },
  { href: "#bottom-line", label: "Bottom line" },
];

const TABLE = [
  {
    paint: "Traditional wax (paste / liquid)",
    means: "Soft sacrificial layer; common after DIY wax days",
    move: "Do not assume you can coat over it—clear to a clean, label-ready surface first",
  },
  {
    paint: "Old spray coating / glaze",
    means: "Previous spray protection still present",
    move: "Do not stack blindly—confirm compatibility or remove to the base the new product expects",
  },
  {
    paint: 'Unknown film / "someone detailed it"',
    means: "You cannot name product or age",
    move: "Stop and identify or remove first; guessing is how finishes fail early",
  },
];

const tableHead = {
  background: color.raised,
  padding: "10px 14px",
  fontSize: 11,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: color.quiet2,
  fontWeight: 700,
  textAlign: "left",
  borderBottom: `1px solid ${color.hairline}`,
};

const tableCell = {
  background: color.bg,
  padding: "14px",
  fontSize: 15,
  lineHeight: 1.45,
  color: color.secondary,
  borderBottom: `1px solid ${color.hairline}`,
  verticalAlign: "top",
};

const checklistItem = {
  display: "flex",
  gap: 14,
  padding: "14px 0",
  borderBottom: `1px solid ${color.border}`,
  fontSize: 16,
  lineHeight: 1.5,
};

const checklistNum = {
  fontFamily: CONDENSED,
  fontWeight: 800,
  fontSize: 20,
  color: color.orange,
  flex: "none",
  width: 24,
};

export default function CoatingOverWaxPage() {
  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <JsonLd
        data={[
          articleLd({ headline: TITLE, description: LEDE, image: HERO, route: routes.coatingOverWax }),
          breadcrumbLd([{ name: "Home", route: routes.home }, { name: "Guides", route: routes.guides }, { name: CRUMB }]),
        ]}
      />
      <main id="main">
        <ArticleHead
          toc={TOC}
          gradient="linear-gradient(160deg,#14120f 0%,#080A0C 55%)"
          crumb={CRUMB}
          tag="CHECK"
          tagColor={color.orange}
          tagLabel="Compatibility"
          title={TITLE}
          lede={LEDE}
          readTime="4 min read"
        />

        <ArticleBody toc={TOC}>
          <p style={lead}>
            Your paint may already have something on it—last month's wax, an old spray coating, or a finish you cannot name. The
            question people type is blunt: <strong style={strong}>can I apply ceramic coating over wax?</strong>
          </p>
          <p style={body}>
            This guide is a pre-check, not an application tutorial. It helps you decide whether to spray now or clear the surface
            first. Product labels and APGO support still win over any generic "yes, stack it" advice.
          </p>

          <section id="why" style={section}>
            <h2 style={h2Balance}>Why layering is the wrong default</h2>
            <p style={body}>
              A new spray coating needs a surface it can bond to and perform on. An old wax or leftover coating sits in the way.
              Drivers who stack products "just to be safe" often get haze, uneven sheen, early peel, or a finish that does not last
              like the label suggests.
            </p>
            <p style={body}>
              That risk is about what's already on the paint—not about memorizing chemistry. If you cannot identify the old layer,
              treat stacking as the risky default, not the shortcut.
            </p>
          </section>

          <section id="whats-on-paint" style={section}>
            <h2 style={h2}>What's already on the paint?</h2>
            <p style={body}>Sort the car into one of three buckets before you pick up a bottle.</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 2,
                background: color.hairline,
                border: `1px solid ${color.hairline}`,
                overflow: "hidden",
              }}
            >
              <div style={{ ...tableHead, borderTop: `4px solid ${color.tertiary}` }}>What's on the paint</div>
              <div style={{ ...tableHead, borderTop: `4px solid ${color.tertiary}` }}>What it usually means</div>
              <div style={{ ...tableHead, borderTop: `4px solid ${color.orange}` }}>Default move before a dry spray coating</div>
              {TABLE.map((row, i) => (
                <Fragment key={i}>
                  <div style={{ ...tableCell, fontWeight: 600, color: color.text }}>{row.paint}</div>
                  <div style={tableCell}>{row.means}</div>
                  <div style={tableCell}>{row.move}</div>
                </Fragment>
              ))}
            </div>
            <p style={body}>
              Clean, bare clear coat with no old wax or coating is a different case: that is when a dry-surface spray (for example
              APGO Atomic Colored Glaze D204) is in scope—still only on surfaces the current label allows.
            </p>
          </section>

          <section id="checklist" style={section}>
            <h2 style={h2}>Decision checklist</h2>
            <p style={body}>Use this before you spray:</p>
            <ol style={{ margin: 0, padding: 0, listStyle: "none", borderTop: `1px solid ${color.border}` }}>
              <li style={checklistItem}>
                <span style={checklistNum}>1</span>
                <span>
                  <strong style={strong}>Is the paint clean and free of old wax or coating?</strong> If yes, a dry spray coating may
                  be appropriate once the panel is fully dry and within label rules.
                </span>
              </li>
              <li style={checklistItem}>
                <span style={checklistNum}>2</span>
                <span>
                  <strong style={strong}>Is there traditional wax on it?</strong> Do not treat "ceramic over wax" as automatic.
                  Remove the wax (or otherwise return the paint to what the new product's label requires) before applying.
                </span>
              </li>
              <li style={checklistItem}>
                <span style={checklistNum}>3</span>
                <span>
                  <strong style={strong}>Is there an old spray coating or glaze?</strong> Same rule: confirm compatibility with the
                  label / APGO support, or remove first. Do not invent a stack.
                </span>
              </li>
              <li style={checklistItem}>
                <span style={checklistNum}>4</span>
                <span>
                  <strong style={strong}>Is it unknown?</strong> Do not spray over a mystery layer. Identify it or clear it; if you
                  are unsure, contact APGO support before applying.
                </span>
              </li>
              <li style={checklistItem}>
                <span style={checklistNum}>5</span>
                <span>
                  <strong style={strong}>Still unsure after the checklist?</strong> Do not layer. Read the current label and ask
                  support—skipping one wash-day is cheaper than correcting a bad stack.
                </span>
              </li>
            </ol>

            <figure style={{ margin: "24px 0 0" }}>
              <img
                src={asset("generated/coating-over-wax-decision-checklist.png")}
                alt="Decision checklist: bare clear coat vs traditional wax vs old or unknown coating"
                style={{ display: "block", width: "100%", maxWidth: 680 }}
              />
              <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>
                Know what's underneath before you spray.
              </figcaption>
            </figure>
          </section>

          <section id="remove" style={section}>
            <h2 style={h2}>What "remove first" means in practice</h2>
            <p style={body}>
              Here, "remove first" only means one result: get back to a clean, compatible painted surface that matches what the new
              product's label expects. It does not mean this article will teach washing, dewaxing, or polishing—those belong in
              other guides or a separate piece.
            </p>
            <p style={body}>
              If the label says apply on clean, dry automotive paint, treat leftover wax or an unknown coating as unfinished prep,
              not as a base coat for the new spray.
            </p>
          </section>

          <section id="d204" style={section}>
            <h2 style={h2}>Where D204 fits</h2>
            <p style={body}>
              APGO Atomic Colored Glaze (D204) is one example of a <strong style={strong}>dry-surface</strong> spray glaze: it
              belongs on clean paint after drying, when the surface is ready—not as a guaranteed topper over old wax. The U.S. page
              cites wash resistance up to about 6 months under good conditions; that number does not change the compatibility rule
              above. How to spray it is covered in the dry-application guide, not here.
            </p>
            <GuideLinkCard
              href={routes.coloredGlaze}
              accent={color.dry}
              word="DRY"
              title="How to apply APGO Atomic Colored Glaze"
              meta="Guide · 6 min read"
            />
          </section>

          <section id="bottom-line" style={section}>
            <h2 style={h2}>Bottom line</h2>
            <p style={body}>
              The safe answer to <code style={{ background: color.raised, padding: "2px 6px", fontSize: 15 }}>can I apply ceramic coating over wax</code> is not a blanket yes.
              Confirm what is already on the paint. If it is wax, an old coating, or unknown, clear or confirm first; if the paint
              is clean and dry and the label allows it, then a dry spray coating can be considered. What you save is a failed
              finish—not a skipped prep step.
            </p>
          </section>

          <p style={finePrint}>
            This guide is published by APGO. Follow the current directions for the specific product you are using and your
            vehicle's care requirements.
          </p>
        </ArticleBody>

        <RelatedGuides items={["coloredGlaze", "wetOrDry", "afterWashing"]} />
      </main>
    </div>
  );
}
