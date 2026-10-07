#!/usr/bin/env node
/**
 * Verification script for the Batch 2 SEO guides: #13, #21, #26, #30 and #51.
 * Modeled on scripts/verify-batch2-early-guides.js. Checks, for each new slug:
 * 1. The page file exists
 * 2. Exactly one H1 (one ArticleHead title, no literal <h1> in the page)
 * 3. TITLE matches the package and carries no " · APGO" suffix (the layout adds it)
 * 4. H1, DESCRIPTION and CRUMB match the package
 * 5. The FAQ JSON-LD is generated from the same FAQ array that renders the <details> rows,
 *    and that array equals the package's FAQPage mainEntity verbatim
 * 6. Hero (and, for #51, inline) image files exist and the page references them
 *    (hero = cover = og/twitter image); hero alt matches the package
 * 7. No raw [BODY IMAGE] marker; inline figure has no caption; only #51 has an inline image
 * 8. Route key present in routes.js (no trailing slash), URL present in sitemap.js
 * 9. Index card (eyebrow, title = H1, summary = meta, CTA, hero with alt="") and
 *    JUMP_LINK_LABELS entry, at the group position approved in BATCH2-NAV.md
 * 10. navigation.js guideGroups entry with the same label at the same position
 * 11. RelatedGuides CARDS entry and GuidesSection MORE_GUIDES entry
 * 12. "Keep reading" items are three existing CARDS keys
 * 13. Product links use routes.compare ("/#compare"), never a hard-coded /us#compare
 * 14. No links to the not-yet-live batch 2 slugs (#36, #56, #58); deferred anchors stay plain text
 * 15. Banned positioning terms (SiO2, 9H, PPF, paint protection film, hardness, temperature) count 0
 * Then, globally: full group order per BATCH2-NAV.md (index GUIDE_GROUPS + navigation.js guideGroups),
 * the new sixth group "By paint, vehicle & surface" placed after Durability & weather and before
 * Troubleshooting, one H1 on the index, and no not-yet-live slug anywhere in routes/sitemap/index/nav.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const guides = [
  {
    id: "#13",
    slug: "is-ceramic-spray-worth-it",
    routeKey: "isSprayWorthIt",
    h1: "Is Ceramic Spray Worth It? An Honest Look for Everyday Drivers",
    title: "Is Ceramic Spray Worth It? An Honest Look",
    description:
      "Is ceramic spray worth it? It depends on how you wash, the time you'll spend after a wash, and what you expect from it. See when it pays off and when it won't.",
    crumb: "Is ceramic spray worth it?",
    heroFile: "is-ceramic-spray-worth-it-hero.png",
    heroAlt: "Driver holding a microfiber towel beside a freshly washed car in a driveway at dusk",
    inlineFile: null,
    inlineAlt: null,
    eyebrow: "Compare · Worth it for you",
    cta: "Read the guide →",
    navLabel: "Is ceramic spray worth it?",
    group: "compare-and-choose",
    navGroupLabel: "Compare & choose",
    groupPosition: 7,
    cardLabel: "Compare",
    compareLinks: 2,
    deferredAnchors: [{ text: "should you ceramic coat a new car", count: 2 }],
    faq: [
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
    ],
  },
  {
    id: "#21",
    slug: "how-to-choose-a-ceramic-coating",
    routeKey: "chooseCoatingSpray",
    h1: "How to Choose a Ceramic Coating Spray: What to Check Before You Buy",
    title: "How to Choose a Ceramic Coating Spray: What to Check",
    description:
      "How to choose a ceramic coating spray: match the label to how you wash. Check wet or dry use, listed surfaces, durability as a ceiling and what's on your paint.",
    crumb: "Choosing a coating spray",
    heroFile: "how-to-choose-a-ceramic-coating-hero.png",
    heroAlt: "Hand holding a blank instruction card in a home garage with a clean car in the background",
    inlineFile: null,
    inlineAlt: null,
    eyebrow: "Check · Label checklist",
    cta: "Read the guide →",
    navLabel: "Choose a coating spray",
    group: "compare-and-choose",
    navGroupLabel: "Compare & choose",
    groupPosition: 9,
    cardLabel: "Check",
    compareLinks: 1,
    deferredAnchors: [],
    faq: [
      {
        q: "Is there one ceramic spray that's right for every car?",
        a: "No. The right choice is the one whose label matches your wash routine, your surfaces, and what's already on your paint.",
      },
      {
        q: "What should I look for in a ceramic spray?",
        a: "Wet or dry application, listed surfaces, durability read as a ceiling, compatibility with existing products, prep and keep-dry requirements, and clear instructions with real support.",
      },
      {
        q: "Is a longer durability claim always better?",
        a: "Not necessarily. It's an upper limit, and your routine and conditions decide how long it actually lasts.",
      },
      {
        q: "Can I put a ceramic spray over wax?",
        a: "Check that product's label. See can you apply ceramic coating over wax for how to decide.",
      },
      {
        q: "Does a bigger bottle mean more applications?",
        a: "No. How far a bottle goes depends on vehicle size, surface condition, and how the product is applied.",
      },
    ],
  },
  {
    id: "#26",
    slug: "clay-bar-before-ceramic-coating",
    routeKey: "clayBarFirst",
    h1: "Clay Bar Before Ceramic Coating: When a Spray Finish Actually Needs It",
    title: "Clay Bar Before Ceramic Coating: When It's Needed",
    description:
      "Clay bar before ceramic coating? Use the bag test to see if your paint needs it, clay safely with plenty of lubricant, and see where iron remover fits.",
    crumb: "Clay bar before coating",
    heroFile: "clay-bar-before-ceramic-coating-hero.png",
    heroAlt: "Hand in a thin plastic bag feeling a freshly washed car hood for roughness",
    inlineFile: null,
    inlineAlt: null,
    eyebrow: "Prep · Clay bar",
    cta: "Read the guide →",
    navLabel: "Clay bar before coating",
    group: "prep-and-application",
    navGroupLabel: "Prep & application",
    groupPosition: 2,
    cardLabel: "Prep",
    compareLinks: 1,
    deferredAnchors: [{ text: "should you ceramic coat a new car", count: 1 }],
    faq: [
      {
        q: "Do I need to clay bar before ceramic spray?",
        a: "Usually only if the paint still feels rough after washing. If it's smooth, skip it.",
      },
      {
        q: "Should I use a clay bar before or after iron remover?",
        a: "Usually after: wash, use iron remover if needed, then clay, then wash or rinse again.",
      },
      {
        q: "Can clay scratch my paint?",
        a: "It can leave light haze if you press hard, use too little lubricant, or keep using a bar that's been dropped.",
      },
      {
        q: "Does claying remove wax?",
        a: "It can take existing wax or protection with it, so plan to reapply protection afterward.",
      },
      {
        q: "How often should I clay my car?",
        a: "Only when the bag test says the paint feels rough again. It isn't an every-wash step.",
      },
    ],
  },
  {
    id: "#30",
    slug: "exterior-car-detailing-steps",
    routeKey: "detailingSteps",
    h1: "Exterior Car Detailing Steps: The Right Order From Wheels to Protection",
    title: "Exterior Car Detailing Steps: The Right Order",
    description:
      "Exterior car detailing steps in the right order: wheels first, top-down wash, decontaminate if needed, rinse, dry, inspect, protect, then glass and trim.",
    crumb: "Exterior detailing steps",
    heroFile: "exterior-car-detailing-steps-hero.png",
    heroAlt: "Wet, freshly cleaned wheel in the foreground of a car being washed in a driveway",
    inlineFile: null,
    inlineAlt: null,
    eyebrow: "Steps · Full exterior order",
    cta: "Read the guide →",
    navLabel: "Exterior detailing steps",
    group: "prep-and-application",
    navGroupLabel: "Prep & application",
    groupPosition: 3,
    cardLabel: "Steps",
    compareLinks: 1,
    deferredAnchors: [],
    faq: [
      {
        q: "What is the correct order for exterior car detailing?",
        a: "Wheels and tires, pre-rinse, top-down wash, decontamination if needed, final rinse, dry, inspect, protect, then glass and a final check.",
      },
      {
        q: "Should I wash the wheels before or after the body?",
        a: "Before, so grime and cleaner spray don't land on panels you've already washed.",
      },
      {
        q: "Do I need to clay the car every time I detail it?",
        a: "No. Clay is usually only needed when the paint still feels rough after washing. See how to prep your car for ceramic spray for how to check.",
      },
      {
        q: "When do I apply protection, while the car is wet or after it's dry?",
        a: "It depends on the product label. Wet-application products go on after the final rinse, and dry-application products go on after full drying and inspection.",
      },
      {
        q: "Should glass be cleaned first or last?",
        a: "Last, so overspray and drips from other steps don't undo it. Remove the oil film from the windshield before applying any glass product.",
      },
    ],
  },
  {
    id: "#51",
    slug: "ceramic-coating-on-windshield",
    routeKey: "windshieldCoating",
    h1: "Can You Use Ceramic Coating on a Windshield? (And How to Prep the Glass)",
    title: "Can You Use Ceramic Coating on a Windshield?",
    description:
      "Ceramic coating on windshield glass: check that the label lists glass, remove the oil film first, test a small area, and fix wiper chatter before you drive.",
    crumb: "Coating on a windshield",
    heroFile: "ceramic-coating-on-windshield-hero.png",
    heroAlt: "Folded microfiber towel resting on a clean, dry windshield in a dim garage",
    inlineFile: "ceramic-coating-on-windshield-defilm-first.png",
    inlineAlt: "Windshield split between a hazy filmed half and a clean half under the words De-film first",
    eyebrow: "Surface · Glass prep",
    cta: "Read the guide →",
    navLabel: "Windshield & glass",
    group: "paint-vehicle-surface",
    navGroupLabel: "By paint, vehicle & surface",
    groupPosition: 1,
    cardLabel: "Surface",
    compareLinks: 1,
    deferredAnchors: [],
    faq: [
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
    ],
  },
];

// Expected full group order after this batch (BATCH2-NAV.md), for index GUIDE_GROUPS and navigation.js guideGroups.
const expectedGroupOrder = {
  "compare-and-choose": [
    "paintProtectionTypes", "whatIsSprayCeramic", "whatIsCarGlaze", "sprayVsCoating",
    "coatingScratches", "waxVsSprayCoating", "isSprayWorthIt", "diyVsPro", "chooseCoatingSpray",
  ],
  "prep-and-application": [
    "prepForSpray", "clayBarFirst", "detailingSteps", "wetOrDry", "coatingOverWax", "removeWaxFirst", "waitToWash",
    "coloredGlaze", "glazeCoating",
  ],
  "wash-and-care": ["coatingMaintenance", "washCoatedCar", "afterWashing", "autoWashCoating"],
  "durability-and-weather": ["howOftenReapply", "rainDamageCoating", "winterWash"],
  "paint-vehicle-surface": ["windshieldCoating"],
  "troubleshooting": ["streaksHighSpots"],
};
const expectedGroupIds = Object.keys(expectedGroupOrder);
const navLabelsById = {
  "compare-and-choose": "Compare & choose",
  "prep-and-application": "Prep & application",
  "wash-and-care": "Wash & care",
  "durability-and-weather": "Durability & weather",
  "paint-vehicle-surface": "By paint, vehicle & surface",
  "troubleshooting": "Troubleshooting",
};

// Slugs of batch 2 guides that are not live yet. Nothing in this batch may link to them.
const notLiveSlugs = ["should-i-ceramic-coat-my-new-car", "how-often-should-you-wash-your-car", "ceramic-coating-on-a-black-car"];

// Positioning terms that must not appear in anything added for this batch.
const bannedTerms = [/SiO2/i, /\b9H\b/, /\bPPF\b/, /paint protection film/i, /hardness/i, /temperature/i];

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

function countMatches(src, re) {
  return (src.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;
}

const routesFile = read("lib/us/routes.js");
const sitemapFile = read("app/sitemap.js");
const indexFile = read("app/(us)/us/guides/page.js");
const navFile = read("lib/us/navigation.js");
const cardsFile = read("components/us/guides/RelatedGuides.js");
const landingFile = read("components/us/landing/GuidesSection.js");
const cardsBlock = (cardsFile.match(/export const CARDS = \{([\s\S]*?)\n\};/) || ["", ""])[1];
const cardKeys = [...cardsBlock.matchAll(/^  (\w+): \{/gm)].map((m) => m[1]);

console.log("\n=== Batch 2 Guides Verification: #13 + #21 + #26 + #30 + #51 ===\n");

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
  if (!/breadcrumbLd\(\[\{ name: "Home", route: routes\.home \}, \{ name: "Guides", route: routes\.guides \}, \{ name: CRUMB \}\]\)/.test(page)) {
    issues.push("breadcrumbLd trail is not Home › Guides › CRUMB");
  }

  // --- Images ---
  const heroPath = path.join(ROOT, "public/us/assets/generated", guide.heroFile);
  if (!fs.existsSync(heroPath)) issues.push("Hero file missing: " + guide.heroFile);
  if (!page.includes('const COVER = asset("generated/' + guide.heroFile + '")')) issues.push("COVER does not reference the hero via asset()");
  if ((page.match(/images: \[COVER\]/g) || []).length !== 2) issues.push("openGraph.images / twitter.images should both be [COVER]");
  if (!/heroSrc=\{COVER\}/.test(page)) issues.push("ArticleHead heroSrc is not COVER");
  if (!/heroAlt=\{HERO_ALT\}/.test(page)) issues.push("ArticleHead heroAlt is not HERO_ALT");
  if (readConst(page, "HERO_ALT") !== guide.heroAlt) issues.push("HERO_ALT mismatch");
  if (guide.inlineFile) {
    const inlinePath = path.join(ROOT, "public/us/assets/generated", guide.inlineFile);
    if (!fs.existsSync(inlinePath)) issues.push("Inline file missing: " + guide.inlineFile);
    if (!page.includes('const INLINE_IMAGE = asset("generated/' + guide.inlineFile + '")')) issues.push("INLINE_IMAGE does not reference the inline PNG via asset()");
    if (readConst(page, "INLINE_ALT") !== guide.inlineAlt) issues.push("INLINE_ALT mismatch");
    if (!/<img\s+src=\{INLINE_IMAGE\}\s+alt=\{INLINE_ALT\}/.test(page)) issues.push("Inline <figure> img does not use INLINE_IMAGE/INLINE_ALT");
    if ((page.match(/<figure\b/g) || []).length !== 1) issues.push("Expected exactly one inline <figure>");
  } else {
    if (/INLINE_IMAGE|<figure\b/.test(page)) issues.push("Package specifies no inline image, but the page has one");
  }
  if (/figcaption/.test(page)) issues.push("Inline figure has a caption (package specifies none)");
  if (/hero-title\.png|hero-scene\.jpg/.test(page)) issues.push("References a -hero-title.png or -hero-scene.jpg asset");
  if (/\[BODY IMAGE/.test(page)) issues.push("Raw [BODY IMAGE] marker found");

  // --- Deferred anchors stay plain text; no links to not-yet-live slugs ---
  for (const anchor of guide.deferredAnchors) {
    const n = countMatches(page, new RegExp(esc(anchor.text)));
    if (n !== anchor.count) issues.push("Deferred anchor '" + anchor.text + "' appears " + n + " times, expected " + anchor.count);
    if (new RegExp("<Link[^>]*>" + esc(anchor.text) + "</Link>").test(page)) issues.push("Deferred anchor is linked: '" + anchor.text + "'");
  }
  for (const slug of notLiveSlugs) {
    if (page.includes(slug)) issues.push("Links to not-yet-live slug: " + slug);
  }
  if (/href="\/us\//.test(page)) issues.push("Hard-coded /us/ href (use routes.*)");

  // --- Product links: routes.compare only ---
  const compareUses = (page.match(/href=\{routes\.compare\}/g) || []).length;
  if (compareUses !== guide.compareLinks) issues.push("routes.compare used " + compareUses + " times, package has " + guide.compareLinks);
  if (/#compare"/.test(page) || /\/us#compare/.test(page)) issues.push("Hard-coded #compare href (use routes.compare)");

  // --- Banned terms ---
  for (const re of bannedTerms) {
    const n = countMatches(page, re);
    if (n) issues.push("Banned term " + re + " found " + n + " times");
  }

  // --- Route + sitemap ---
  if (!new RegExp("\\b" + guide.routeKey + ": `\\$\\{US_BASE\\}/guides/" + guide.slug + "`").test(routesFile)) {
    issues.push("routes." + guide.routeKey + " missing or wrong in routes.js (must be /us/guides/" + guide.slug + ", no trailing slash)");
  }
  if (!sitemapFile.includes("routes." + guide.routeKey)) issues.push("routes." + guide.routeKey + " missing from sitemap.js");
  if (!new RegExp("canonical: routes\\." + guide.routeKey).test(page)) issues.push("canonical is not routes." + guide.routeKey);
  if (!new RegExp("url: routes\\." + guide.routeKey).test(page)) issues.push("openGraph.url is not routes." + guide.routeKey);

  // --- Index card ---
  const cardRe = new RegExp(
    "<Link href=\\{routes\\." + guide.routeKey + "\\}[^>]*>\\s*" +
    "<img src=\\{asset\\(\"generated/" + guide.heroFile + "\"\\)\\} alt=\"\" style=\\{cardImg\\} />\\s*" +
    "<span style=\\{cardLabel\\([^)]*\\)\\}>" + esc(guide.eyebrow) + "</span>\\s*" +
    "<span style=\\{cardTitle\\}>" + esc(guide.h1) + "</span>\\s*" +
    "<span style=\\{cardExcerpt\\}>" + esc(guide.description) + "</span>\\s*" +
    "<GuideButton>" + guide.cta + "</GuideButton>\\s*</Link>"
  );
  if (!cardRe.test(indexFile)) issues.push("Index card (image/eyebrow/title/summary/CTA) not found as specified");
  const jumpRe = new RegExp("\\[routes\\." + guide.routeKey + "\\]: \"" + esc(guide.navLabel) + "\"");
  if (!jumpRe.test(indexFile)) issues.push("JUMP_LINK_LABELS entry missing: '" + guide.navLabel + "'");

  // Card sits inside the right <section id="group"> block, at the approved position
  const sectionRe = new RegExp('<section id="' + guide.group + '"[\\s\\S]*?</section>');
  const sectionBlock = (indexFile.match(sectionRe) || [""])[0];
  if (!sectionBlock) issues.push('Index <section id="' + guide.group + '"> not found');
  const allCardsInSection = [...sectionBlock.matchAll(/<Link\s+href=\{routes\.(\w+)\}/g)].map((m) => m[1]);
  const pos = allCardsInSection.indexOf(guide.routeKey) + 1;
  if (pos !== guide.groupPosition) {
    issues.push("Index card position in '" + guide.group + "' is " + pos + ", expected " + guide.groupPosition + " (cards: " + allCardsInSection.join(", ") + ")");
  }

  // --- navigation.js ---
  const navGroupRe = new RegExp('\\{ label: "' + esc(guide.navGroupLabel) + '", items: \\[([\\s\\S]*?)\\] \\}');
  const navGroup = navFile.match(navGroupRe);
  if (!navGroup) issues.push("navigation.js group '" + guide.navGroupLabel + "' not found");
  else {
    const navItems = [...navGroup[1].matchAll(/\{ href: routes\.(\w+), label: "([^"]+)" \}/g)].map((m) => ({ key: m[1], label: m[2] }));
    const navPos = navItems.findIndex((it) => it.key === guide.routeKey) + 1;
    if (navPos !== guide.groupPosition) issues.push("navigation.js position in '" + guide.navGroupLabel + "' is " + navPos + ", expected " + guide.groupPosition);
    const navItem = navItems.find((it) => it.key === guide.routeKey);
    if (navItem && navItem.label !== guide.navLabel) issues.push("navigation.js label '" + navItem.label + "' != '" + guide.navLabel + "'");
  }

  // --- RelatedGuides CARDS entry ---
  const cardEntryRe = new RegExp(
    "  " + guide.routeKey + ": \\{\\s*href: routes\\." + guide.routeKey + ",\\s*" +
    "img: asset\\(\"generated/" + guide.heroFile + "\"\\),\\s*" +
    "label: \"" + esc(guide.cardLabel) + "\",\\s*labelColor: color\\.\\w+,\\s*" +
    "title: \"" + esc(guide.h1) + "\",\\s*\\}"
  );
  if (!cardEntryRe.test(cardsBlock)) issues.push("RelatedGuides CARDS entry for " + guide.routeKey + " missing or not (hero / '" + guide.cardLabel + "' / H1)");

  // --- GuidesSection MORE_GUIDES entry ---
  if (!landingFile.includes('{ key: "' + guide.routeKey + '", label: "' + guide.navLabel + '" }')) {
    issues.push("GuidesSection MORE_GUIDES entry missing: " + guide.routeKey + " / '" + guide.navLabel + "'");
  }

  // --- Keep reading: three existing CARDS keys, not itself ---
  const related = page.match(/<RelatedGuides items=\{\[([^\]]*)\]\} \/>/);
  if (!related) issues.push("<RelatedGuides items={[...]} /> not found");
  else {
    const keys = [...related[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    if (keys.length !== 3) issues.push("RelatedGuides should list 3 items, found " + keys.length);
    for (const k of keys) {
      if (!cardKeys.includes(k)) issues.push("RelatedGuides item '" + k + "' is not a CARDS key");
      if (k === guide.routeKey) issues.push("RelatedGuides links to itself");
    }
  }

  results.push({ slug: guide.slug, status: issues.length ? "FAIL" : "PASS", issues });
}

console.log("| Slug | Status | Notes |");
console.log("|------|--------|-------|");
for (const r of results) {
  console.log("| " + r.slug + " | " + r.status + " | " + (r.issues.length ? r.issues.join("; ") : "All checks passed") + " |");
}

// === Group order: index GUIDE_GROUPS and navigation.js guideGroups ===
console.log("\n=== Group Order Verification (BATCH2-NAV.md) ===");
const groupOrderIssues = [];
const guideGroupsMatch = indexFile.match(/const GUIDE_GROUPS = \[([\s\S]*?)\n\];/);
if (guideGroupsMatch) {
  const indexGroupIds = [...guideGroupsMatch[1].matchAll(/id:\s*"([\w-]+)"/g)].map((m) => m[1]);
  if (indexGroupIds.join(",") !== expectedGroupIds.join(",")) {
    groupOrderIssues.push("index GUIDE_GROUPS group order: got [" + indexGroupIds.join(", ") + "], expected [" + expectedGroupIds.join(", ") + "]");
  }
  for (const [groupId, expected] of Object.entries(expectedGroupOrder)) {
    const groupRegex = new RegExp('id:\\s*"' + groupId + '"[\\s\\S]*?items:\\s*\\[([^\\]]+)\\]');
    const gm = guideGroupsMatch[1].match(groupRegex);
    if (!gm) { groupOrderIssues.push("index: group " + groupId + " not found"); continue; }
    const actual = [...gm[1].matchAll(/routes\.(\w+)/g)].map((m) => m[1]);
    if (actual.join(",") !== expected.join(",")) groupOrderIssues.push("index " + groupId + ": got [" + actual.join(", ") + "], expected [" + expected.join(", ") + "]");
  }
  // Sixth group: label, id and labelColor per BATCH2-NAV.md
  const sixth = guideGroupsMatch[1].match(/id:\s*"paint-vehicle-surface",\s*label:\s*"([^"]+)",\s*labelColor:\s*color\.(\w+)/);
  if (!sixth) groupOrderIssues.push("index: sixth group paint-vehicle-surface not found");
  else {
    if (sixth[1] !== "By paint, vehicle & surface") groupOrderIssues.push("index: sixth group label is '" + sixth[1] + "'");
    if (sixth[2] !== "dry") groupOrderIssues.push("index: sixth group labelColor is color." + sixth[2] + ", expected color.dry");
  }
} else {
  groupOrderIssues.push("Could not parse GUIDE_GROUPS");
}
// Index sections appear in the same order, with the sixth group's H2 and anchor present
const sectionIds = [...indexFile.matchAll(/<section id="([\w-]+)"/g)].map((m) => m[1]);
if (sectionIds.join(",") !== expectedGroupIds.join(",")) {
  groupOrderIssues.push("index <section id> order: got [" + sectionIds.join(", ") + "], expected [" + expectedGroupIds.join(", ") + "]");
}
if (!/<section id="paint-vehicle-surface"[\s\S]*?<h2 style=\{sectionH2\}>By paint, vehicle & surface<\/h2>/.test(indexFile)) {
  groupOrderIssues.push("index: sixth group section H2 'By paint, vehicle & surface' not found");
}
// navigation.js: group labels in order (null "All guides" group first), then items per group
const navGroupLabels = [...navFile.matchAll(/\{ label: (null|"[^"]+"), items: \[/g)].map((m) => m[1].replace(/"/g, ""));
const expectedNavLabels = ["null", ...expectedGroupIds.map((id) => navLabelsById[id])];
if (navGroupLabels.join("|") !== expectedNavLabels.join("|")) {
  groupOrderIssues.push("nav guideGroups order: got [" + navGroupLabels.join(", ") + "], expected [" + expectedNavLabels.join(", ") + "]");
}
for (const [groupId, expected] of Object.entries(expectedGroupOrder)) {
  const gm = navFile.match(new RegExp('\\{ label: "' + esc(navLabelsById[groupId]) + '", items: \\[([\\s\\S]*?)\\] \\}'));
  if (!gm) { groupOrderIssues.push("nav: group " + groupId + " not found"); continue; }
  const actual = [...gm[1].matchAll(/routes\.(\w+)/g)].map((m) => m[1]);
  if (actual.join(",") !== expected.join(",")) groupOrderIssues.push("nav " + groupId + ": got [" + actual.join(", ") + "], expected [" + expected.join(", ") + "]");
}
if (groupOrderIssues.length) groupOrderIssues.forEach((i) => console.log("  - " + i));
else console.log("Index GUIDE_GROUPS, index sections, and navigation.js guideGroups match BATCH2-NAV.md: PASS");

// === Index H1 count ===
const indexH1 = (indexFile.match(/<h1[\s>]/g) || []).length;
console.log("\n=== Index Page H1 ===");
console.log(indexH1 === 1 ? "Index H1 count: PASS (exactly 1)" : "Index H1 count: FAIL (found " + indexH1 + ")");

// === Not-yet-live slugs must not appear anywhere in routes/sitemap/index/nav/cards/landing ===
console.log("\n=== Not-yet-live slug check (#36, #56, #58) ===");
const leakIssues = [];
for (const slug of notLiveSlugs) {
  for (const [name, src] of [
    ["routes.js", routesFile], ["sitemap.js", sitemapFile], ["guides/page.js", indexFile], ["navigation.js", navFile],
    ["RelatedGuides.js", cardsFile], ["GuidesSection.js", landingFile],
  ]) {
    if (src.includes(slug)) leakIssues.push(name + " references " + slug);
  }
}
if (leakIssues.length) leakIssues.forEach((i) => console.log("  - " + i));
else console.log("No references to #36/#56/#58 slugs: PASS");

// === Banned terms in the shared additions (index cards, nav labels, CARDS, MORE_GUIDES for the five) ===
console.log("\n=== Banned terms in added nav/card copy ===");
const bannedIssues = [];
const addedCopy = guides.flatMap((g) => [g.eyebrow, g.navLabel, g.cardLabel, g.h1, g.description, g.crumb, g.title]);
for (const text of addedCopy) {
  for (const re of bannedTerms) if (re.test(text)) bannedIssues.push("'" + text + "' matches " + re);
}
if (bannedIssues.length) bannedIssues.forEach((i) => console.log("  - " + i));
else console.log("No banned terms in eyebrow/nav label/card copy: PASS");

allPassed = results.every((r) => r.status === "PASS") && groupOrderIssues.length === 0 && indexH1 === 1 && leakIssues.length === 0 && bannedIssues.length === 0;

console.log("\n=== Final Result ===");
console.log(allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
process.exit(allPassed ? 0 : 1);
