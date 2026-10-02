#!/usr/bin/env node
/**
 * Verification script for the Batch 2 (early) SEO guides: #45 and #22.
 * Checks, for each new slug:
 * 1. The page file exists
 * 2. Exactly one H1 (one ArticleHead title, no literal <h1> in the page)
 * 3. TITLE matches the package and carries no " · APGO" suffix (the layout adds it)
 * 4. H1 matches the package
 * 5. The FAQ JSON-LD is generated from the same FAQ array that renders the <details> rows,
 *    and that array equals the package's FAQPage mainEntity verbatim
 * 6. Hero and inline image files exist, and the page references them (hero = cover = og/twitter image)
 * 7. No raw [BODY IMAGE] marker in the output; inline alt matches the package
 * 8. Route key present in routes.js, URL present in sitemap.js
 * 9. Index card (eyebrow, title, summary, CTA) and JUMP_LINK_LABELS entry, at the specified group position
 * 10. navigation.js guideGroups entry with the same label at the same position
 * 11. No links to the not-yet-live batch 2 slugs (#36 how-often-should-you-wash-your-car, #56 ceramic-coating-black-car)
 * 12. Deferred anchors stay plain text
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const guides = [
  {
    id: "#45",
    slug: "how-to-wash-your-car-in-winter",
    routeKey: "winterWash",
    h1: "How to Wash Your Car in Winter (Cold, Salt & Freezing Temps)",
    title: "How to Wash Your Car in Winter: Cold & Salt",
    description:
      "How to wash your car in winter: pick the right day and place, rinse road salt from the low areas first, dry seals and locks, and clear snow without scratching.",
    crumb: "Winter washing",
    heroFile: "how-to-wash-your-car-in-winter-hero.png",
    heroAlt: "Rinsing road salt from a car's lower panels and wheel arch at a winter self-serve wash",
    inlineFile: "how-to-wash-your-car-in-winter-salt-low.png",
    inlineAlt: "Car silhouette with the lower panels and wheel arches highlighted under the words Salt hides low. Rinse there first.",
    eyebrow: "Weather · Winter washing",
    cta: "Read the guide →",
    navLabel: "Winter washing",
    group: "durability-and-weather",
    navGroupLabel: "Durability & weather",
    groupPosition: 3,
    deferredAnchors: ["how often you should wash your car"],
    faq: [
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
    ],
  },
  {
    id: "#22",
    slug: "does-ceramic-coating-prevent-scratches",
    routeKey: "coatingScratches",
    h1: "Does Ceramic Coating Prevent Scratches? What a Coating Can and Can't Do",
    title: "Does Ceramic Coating Prevent Scratches?",
    description:
      "Does ceramic coating prevent scratches? See which scratches a coating can help with, which it can't, like keys and rock chips, and what really prevents swirls.",
    crumb: "Coating & scratches",
    heroFile: "does-ceramic-coating-prevent-scratches-hero.png",
    heroAlt: "Flashlight raking across a dark car door revealing fine swirl marks",
    inlineFile: "does-ceramic-coating-prevent-scratches-clean-tools.png",
    inlineAlt: "A clean folded microfiber towel next to a gritty one under the words Clean tools prevent swirls",
    eyebrow: "Basics · Coating limits",
    cta: "Read the guide →",
    navLabel: "Scratches & coating",
    group: "compare-and-choose",
    navGroupLabel: "Compare & choose",
    groupPosition: 5,
    deferredAnchors: ["ceramic coating on a black car"],
    faq: [
      {
        q: "Does ceramic coating prevent swirl marks?",
        a: "It can make washing smoother, but clean tools and a careful wash method matter far more.",
      },
      {
        q: "Does ceramic coating prevent rock chips?",
        a: "No. A thin coating isn't impact protection. See types of car paint protection for thicker options.",
      },
      {
        q: "Will a ceramic spray hide existing scratches?",
        a: "No. It doesn't repair scratches, and polishing is what removes fine marks.",
      },
      {
        q: "Does a coating make my car scratch-proof?",
        a: "No. It's a thin layer that makes the surface slicker, not harder to damage.",
      },
    ],
  },
];

// Expected full group order after this batch (index GUIDE_GROUPS and navigation.js guideGroups).
const expectedGroupOrder = {
  "compare-and-choose": [
    "paintProtectionTypes", "whatIsSprayCeramic", "whatIsCarGlaze", "sprayVsCoating",
    "coatingScratches", "waxVsSprayCoating", "diyVsPro",
  ],
  "prep-and-application": [
    "prepForSpray", "wetOrDry", "coatingOverWax", "removeWaxFirst", "waitToWash",
    "coloredGlaze", "glazeCoating",
  ],
  "wash-and-care": ["coatingMaintenance", "washCoatedCar", "afterWashing", "autoWashCoating"],
  "durability-and-weather": ["howOftenReapply", "rainDamageCoating", "winterWash"],
  "troubleshooting": ["streaksHighSpots"],
};

// Slugs of batch 2 guides that are not live yet. Nothing in this batch may link to them.
const notLiveSlugs = ["how-often-should-you-wash-your-car", "ceramic-coating-black-car"];

let allPassed = false;
const results = [];

function normalizeQuotes(str) {
  return str.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

function readConst(src, name) {
  const m = src.match(new RegExp("const " + name + ' = "((?:[^"\\\\]|\\\\.)*)"'));
  return m ? m[1].replace(/\\"/g, '"') : null;
}

// Parse the FAQ = [{ q: "...", a: "..." }, ...] array out of a page source.
function parseFaq(src) {
  const block = src.match(/const FAQ = \[([\s\S]*?)\n\];/);
  if (!block) return null;
  const items = [];
  const re = /q:\s*"((?:[^"\\]|\\.)*)",\s*a:\s*"((?:[^"\\]|\\.)*)",?/g;
  let m;
  while ((m = re.exec(block[1]))) items.push({ q: m[1].replace(/\\"/g, '"'), a: m[2].replace(/\\"/g, '"') });
  return items;
}

const routesFile = read("lib/us/routes.js");
const sitemapFile = read("app/sitemap.js");
const indexFile = read("app/(us)/us/guides/page.js");
const navFile = read("lib/us/navigation.js");

console.log("\n=== Batch 2 (early) Guides Verification: #45 + #22 ===\n");

for (const guide of guides) {
  const issues = [];
  const pagePath = "app/(us)/us/guides/" + guide.slug + "/page.js";
  let page;
  try {
    page = read(pagePath);
  } catch (e) {
    results.push({ slug: guide.slug, status: "FAIL", issues: ["Page file not found: " + pagePath] });
    continue;
  }

  // --- H1: exactly one ---
  const h1 = readConst(page, "H1");
  if (!h1) issues.push("H1 const not found");
  else if (normalizeQuotes(h1) !== normalizeQuotes(guide.h1)) issues.push("H1 mismatch: got '" + h1 + "'");
  if (/<h1[\s>]/.test(page)) issues.push("Literal <h1> in page (ArticleHead already renders the H1)");
  const headCount = (page.match(/<ArticleHead\b/g) || []).length;
  if (headCount !== 1) issues.push("Expected exactly 1 <ArticleHead>, found " + headCount);
  if (!/title=\{H1\}/.test(page)) issues.push("ArticleHead title is not {H1}");

  // --- TITLE: matches, no suffix ---
  const title = readConst(page, "TITLE");
  if (!title) issues.push("TITLE const not found");
  else {
    if (normalizeQuotes(title) !== normalizeQuotes(guide.title)) issues.push("TITLE mismatch: got '" + title + "'");
    if (/·\s*APGO\s*$/.test(title) || /\|\s*APGO\s*$/.test(title) || /APGO\s*$/.test(title)) {
      issues.push("TITLE carries a suffix (layout template adds ' · APGO')");
    }
  }
  if (!/title:\s*TITLE,/.test(page)) issues.push("metadata.title is not TITLE");

  // --- Description / crumb ---
  const description = readConst(page, "DESCRIPTION");
  if (description !== guide.description) issues.push("DESCRIPTION mismatch");
  const crumb = readConst(page, "CRUMB");
  if (crumb !== guide.crumb) issues.push("CRUMB mismatch: got '" + crumb + "'");

  // --- FAQ: single array feeds both <FaqList> and faqLd, and equals the package ---
  const faq = parseFaq(page);
  if (!faq) issues.push("FAQ array not found");
  else if (JSON.stringify(faq) !== JSON.stringify(guide.faq)) {
    issues.push("FAQ array differs from package FAQPage (" + faq.length + " vs " + guide.faq.length + " items)");
    for (let i = 0; i < Math.max(faq.length, guide.faq.length); i++) {
      const a = faq[i] || {};
      const b = guide.faq[i] || {};
      if (a.q !== b.q) issues.push("  FAQ[" + i + "].q: '" + a.q + "' vs '" + b.q + "'");
      if (a.a !== b.a) issues.push("  FAQ[" + i + "].a differs");
    }
  }
  if (!/faqLd\(FAQ\)/.test(page)) issues.push("faqLd(FAQ) not in JsonLd data");
  if (!/<FaqList items=\{FAQ\} \/>/.test(page)) issues.push("<FaqList> does not render the FAQ array directly");
  if (!/import JsonLd, \{[^}]*faqLd[^}]*\} from "@\/components\/us\/guides\/JsonLd"/.test(page)) issues.push("faqLd not imported");
  if (!new RegExp("articleLd\\(\\{ headline: H1, description: DESCRIPTION, image: COVER, route: routes\\." + guide.routeKey + " \\}\\)").test(page)) {
    issues.push("articleLd call does not use H1/DESCRIPTION/COVER/routes." + guide.routeKey);
  }
  if (!new RegExp("breadcrumbLd\\(\\[\\{ name: \"Home\", route: routes\\.home \\}, \\{ name: \"Guides\", route: routes\\.guides \\}, \\{ name: CRUMB \\}\\]\\)").test(page)) {
    issues.push("breadcrumbLd trail is not Home › Guides › CRUMB");
  }

  // --- Images ---
  const heroPath = path.join(ROOT, "public/us/assets/generated", guide.heroFile);
  const inlinePath = path.join(ROOT, "public/us/assets/generated", guide.inlineFile);
  if (!fs.existsSync(heroPath)) issues.push("Hero file missing: " + guide.heroFile);
  if (!fs.existsSync(inlinePath)) issues.push("Inline file missing: " + guide.inlineFile);
  if (!page.includes('const COVER = asset("generated/' + guide.heroFile + '")')) issues.push("COVER does not reference the hero via asset()");
  if (!page.includes('const INLINE_IMAGE = asset("generated/' + guide.inlineFile + '")')) issues.push("INLINE_IMAGE does not reference the inline PNG via asset()");
  if ((page.match(/images: \[COVER\]/g) || []).length !== 2) issues.push("openGraph.images / twitter.images should both be [COVER]");
  if (!/heroSrc=\{COVER\}/.test(page)) issues.push("ArticleHead heroSrc is not COVER");
  if (readConst(page, "HERO_ALT") !== guide.heroAlt) issues.push("HERO_ALT mismatch");
  if (readConst(page, "INLINE_ALT") !== guide.inlineAlt) issues.push("INLINE_ALT mismatch");
  if (!/<img\s+src=\{INLINE_IMAGE\}\s+alt=\{INLINE_ALT\}/.test(page)) issues.push("Inline <figure> img does not use INLINE_IMAGE/INLINE_ALT");
  if (/figcaption/.test(page)) issues.push("Inline figure has a caption (package specifies none)");
  if (/hero-title\.png|hero-scene\.jpg/.test(page)) issues.push("References a -hero-title.png or -hero-scene.jpg asset");
  if (/\[BODY IMAGE/.test(page)) issues.push("Raw [BODY IMAGE] marker found");

  // --- Deferred anchors stay plain text; no links to not-yet-live slugs ---
  for (const anchor of guide.deferredAnchors) {
    if (!page.includes(anchor)) issues.push("Deferred anchor text missing: '" + anchor + "'");
    if (new RegExp("<Link[^>]*>" + anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "</Link>").test(page)) {
      issues.push("Deferred anchor is linked: '" + anchor + "'");
    }
  }
  for (const slug of notLiveSlugs) {
    if (page.includes(slug)) issues.push("Links to not-yet-live slug: " + slug);
  }
  if (/href="\/us\//.test(page)) issues.push("Hard-coded /us/ href (use routes.*)");

  // --- Route + sitemap ---
  if (!new RegExp("\\b" + guide.routeKey + ": `\\$\\{US_BASE\\}/guides/" + guide.slug + "`").test(routesFile)) {
    issues.push("routes." + guide.routeKey + " missing or wrong in routes.js");
  }
  if (!sitemapFile.includes("routes." + guide.routeKey)) issues.push("routes." + guide.routeKey + " missing from sitemap.js");
  if (!new RegExp("canonical: routes\\." + guide.routeKey).test(page)) issues.push("canonical is not routes." + guide.routeKey);
  if (!new RegExp("url: routes\\." + guide.routeKey).test(page)) issues.push("openGraph.url is not routes." + guide.routeKey);

  // --- Index card ---
  const cardRe = new RegExp(
    "<Link href=\\{routes\\." + guide.routeKey + "\\}[^>]*>\\s*" +
    "<img src=\\{asset\\(\"generated/" + guide.heroFile + "\"\\)\\} alt=\"\" style=\\{cardImg\\} />\\s*" +
    "<span style=\\{cardLabel\\([^)]*\\)\\}>" + guide.eyebrow + "</span>\\s*" +
    "<span style=\\{cardTitle\\}>" + guide.h1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "</span>\\s*" +
    "<span style=\\{cardExcerpt\\}>" + guide.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "</span>\\s*" +
    "<GuideButton>" + guide.cta + "</GuideButton>\\s*</Link>"
  );
  if (!cardRe.test(indexFile)) issues.push("Index card (image/eyebrow/title/summary/CTA) not found as specified");
  const jumpRe = new RegExp("\\[routes\\." + guide.routeKey + "\\]: \"" + guide.navLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\"");
  if (!jumpRe.test(indexFile)) issues.push("JUMP_LINK_LABELS entry missing: '" + guide.navLabel + "'");

  // Card sits inside the right <section id="group"> block
  const sectionRe = new RegExp('<section id="' + guide.group + '"[\\s\\S]*?</section>');
  const sectionBlock = (indexFile.match(sectionRe) || [""])[0];
  const cardsInSection = [...sectionBlock.matchAll(/<Link href=\{routes\.(\w+)\} style=\{cardStyle/g)].map((m) => m[1]);
  // The prep group also has two packshot cards using a different Link style; count every card Link.
  const allCardsInSection = [...sectionBlock.matchAll(/<Link\s+href=\{routes\.(\w+)\}/g)].map((m) => m[1]);
  const pos = allCardsInSection.indexOf(guide.routeKey) + 1;
  if (pos !== guide.groupPosition) {
    issues.push("Index card position in '" + guide.group + "' is " + pos + ", expected " + guide.groupPosition + " (cards: " + allCardsInSection.join(", ") + ")");
  }
  void cardsInSection;

  // --- navigation.js ---
  const navGroupRe = new RegExp('\\{ label: "' + guide.navGroupLabel.replace(/&/g, "&") + '", items: \\[([\\s\\S]*?)\\] \\}');
  const navGroup = navFile.match(navGroupRe);
  if (!navGroup) issues.push("navigation.js group '" + guide.navGroupLabel + "' not found");
  else {
    const navItems = [...navGroup[1].matchAll(/\{ href: routes\.(\w+), label: "([^"]+)" \}/g)].map((m) => ({ key: m[1], label: m[2] }));
    const navPos = navItems.findIndex((it) => it.key === guide.routeKey) + 1;
    if (navPos !== guide.groupPosition) issues.push("navigation.js position in '" + guide.navGroupLabel + "' is " + navPos + ", expected " + guide.groupPosition);
    const navItem = navItems.find((it) => it.key === guide.routeKey);
    if (navItem && navItem.label !== guide.navLabel) issues.push("navigation.js label '" + navItem.label + "' != '" + guide.navLabel + "'");
  }

  results.push({ slug: guide.slug, status: issues.length ? "FAIL" : "PASS", issues });
}

console.log("| Slug | Status | Notes |");
console.log("|------|--------|-------|");
for (const r of results) {
  console.log("| " + r.slug + " | " + r.status + " | " + (r.issues.length ? r.issues.join("; ") : "All checks passed") + " |");
}

// === Group order: index GUIDE_GROUPS and navigation.js guideGroups ===
console.log("\n=== Group Order Verification ===");
const groupOrderIssues = [];
const guideGroupsMatch = indexFile.match(/const GUIDE_GROUPS = \[([\s\S]*?)\n\];/);
if (guideGroupsMatch) {
  for (const [groupId, expected] of Object.entries(expectedGroupOrder)) {
    const groupRegex = new RegExp('id:\\s*"' + groupId + '"[\\s\\S]*?items:\\s*\\[([^\\]]+)\\]');
    const gm = guideGroupsMatch[1].match(groupRegex);
    if (!gm) { groupOrderIssues.push("index: group " + groupId + " not found"); continue; }
    const actual = [...gm[1].matchAll(/routes\.(\w+)/g)].map((m) => m[1]);
    if (actual.join(",") !== expected.join(",")) groupOrderIssues.push("index " + groupId + ": got [" + actual.join(", ") + "], expected [" + expected.join(", ") + "]");
  }
} else {
  groupOrderIssues.push("Could not parse GUIDE_GROUPS");
}
const navLabelsById = {
  "compare-and-choose": "Compare & choose",
  "prep-and-application": "Prep & application",
  "wash-and-care": "Wash & care",
  "durability-and-weather": "Durability & weather",
  "troubleshooting": "Troubleshooting",
};
for (const [groupId, expected] of Object.entries(expectedGroupOrder)) {
  const gm = navFile.match(new RegExp('\\{ label: "' + navLabelsById[groupId] + '", items: \\[([\\s\\S]*?)\\] \\}'));
  if (!gm) { groupOrderIssues.push("nav: group " + groupId + " not found"); continue; }
  const actual = [...gm[1].matchAll(/routes\.(\w+)/g)].map((m) => m[1]);
  if (actual.join(",") !== expected.join(",")) groupOrderIssues.push("nav " + groupId + ": got [" + actual.join(", ") + "], expected [" + expected.join(", ") + "]");
}
if (groupOrderIssues.length) groupOrderIssues.forEach((i) => console.log("  - " + i));
else console.log("Index GUIDE_GROUPS and navigation.js guideGroups match spec: PASS");

// === Index H1 count ===
const indexH1 = (indexFile.match(/<h1[\s>]/g) || []).length;
console.log("\n=== Index Page H1 ===");
console.log(indexH1 === 1 ? "Index H1 count: PASS (exactly 1)" : "Index H1 count: FAIL (found " + indexH1 + ")");

// === Not-yet-live slugs must not appear anywhere in routes/sitemap/index/nav ===
console.log("\n=== Not-yet-live slug check (#36, #56) ===");
const leakIssues = [];
for (const slug of notLiveSlugs) {
  for (const [name, src] of [["routes.js", routesFile], ["sitemap.js", sitemapFile], ["guides/page.js", indexFile], ["navigation.js", navFile]]) {
    if (src.includes(slug)) leakIssues.push(name + " references " + slug);
  }
}
if (leakIssues.length) leakIssues.forEach((i) => console.log("  - " + i));
else console.log("No references to #36/#56 slugs: PASS");

allPassed = results.every((r) => r.status === "PASS") && groupOrderIssues.length === 0 && indexH1 === 1 && leakIssues.length === 0;

console.log("\n=== Final Result ===");
console.log(allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
process.exit(allPassed ? 0 : 1);
