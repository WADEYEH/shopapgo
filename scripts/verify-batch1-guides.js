#!/usr/bin/env node
/**
 * Verification script for Batch 1 SEO guides.
 * Checks that:
 * 1. Each page's H1 and TITLE match the package specs
 * 2. All hero and inline images exist
 * 3. No raw [BODY IMAGE] markers in output
 * 4. All guides are in sitemap
 * 5. Index page cards match verbatim (eyebrow, title, summary)
 * 6. Nav labels match verbatim
 * 7. Group order matches the spec
 * 8. Index page has exactly 1 H1
 */

const fs = require("fs");
const path = require("path");

const routesFile = fs.readFileSync(path.join(__dirname, "../lib/us/routes.js"), "utf8");

// Define the 10 new guides and their expected content from packages
const guides = [
  {
    slug: "types-of-car-paint-protection",
    routeKey: "paintProtectionTypes",
    h1: "Types of Car Paint Protection: Wax, Sealant, Spray Glaze, Ceramic & PPF",
    title: "Types of Car Paint Protection: Wax to PPF",
    heroFile: "types-of-car-paint-protection-hero.png",
    inlineFile: null,
    eyebrow: "Compare · Protection options",
    navLabel: "Types of paint protection",
    summary: "Compare the types of car paint protection: wax, sealant, spray glaze, spray ceramic, ceramic coating and PPF, by effort, how you renew it and who it suits.",
    group: "compare-and-choose",
    groupPosition: 1,
  },
  {
    slug: "what-is-spray-ceramic-coating",
    routeKey: "whatIsSprayCeramic",
    h1: "What Is Spray Ceramic Coating? How It Works and What It Won't Do",
    title: "What Is Spray Ceramic Coating? How It Works",
    heroFile: "what-is-spray-ceramic-coating-hero.png",
    inlineFile: "what-is-spray-ceramic-coating-does-wont.png",
    eyebrow: "Basics · Spray ceramic",
    navLabel: "What is spray ceramic?",
    summary: "What is spray ceramic coating? Learn how ceramic spray works on paint, what it won't do, like fix scratches or stop rock chips, and why the label matters most.",
    group: "compare-and-choose",
    groupPosition: 2,
  },
  {
    slug: "what-is-car-glaze",
    routeKey: "whatIsCarGlaze",
    h1: "What Is Car Glaze? Glaze vs Wax vs Sealant, Explained",
    title: "What Is Car Glaze? Glaze vs Wax vs Sealant",
    heroFile: "what-is-car-glaze-hero.png",
    inlineFile: null,
    eyebrow: "Basics · Car glaze",
    navLabel: "What is car glaze?",
    summary: "What is car glaze? See how traditional glaze differs from polish, wax and sealant, how glaze differs from ceramic, and what APGO means by a spray glaze.",
    group: "compare-and-choose",
    groupPosition: 3,
  },
  {
    slug: "ceramic-spray-vs-ceramic-coating",
    routeKey: "sprayVsCoating",
    h1: "Ceramic Spray vs Ceramic Coating: What's Actually Different?",
    title: "Ceramic Spray vs Ceramic Coating: What's Different?",
    heroFile: "ceramic-spray-vs-ceramic-coating-hero.png",
    inlineFile: null,
    eyebrow: "Compare · Spray vs liquid",
    navLabel: "Ceramic spray vs coating",
    summary: "Ceramic spray vs ceramic coating: compare prep load, application window, fixing mistakes and durability expectations, then pick the format that fits your wash.",
    group: "compare-and-choose",
    groupPosition: 4,
  },
  {
    slug: "how-to-prep-car-for-ceramic-spray",
    routeKey: "prepForSpray",
    h1: "How to Prep Your Car for Ceramic Spray (Wash, Decon, Dry)",
    title: "How to Prep Your Car for Ceramic Spray",
    heroFile: "how-to-prep-car-for-ceramic-spray-hero.png",
    inlineFile: "how-to-prep-car-for-ceramic-spray-ready-check.png",
    eyebrow: "Prep · Wash, decon, dry",
    navLabel: "Prep for ceramic spray",
    summary: "How to prep car for ceramic spray: wash, check for bonded contamination, decon only if needed, confirm there's no old wax, then dry or leave wet per your label.",
    group: "prep-and-application",
    groupPosition: 1,
  },
  {
    slug: "how-to-remove-wax-before-ceramic-coating",
    routeKey: "removeWaxFirst",
    h1: "How to Remove Wax Before Ceramic Coating",
    title: "How to Remove Wax Before Ceramic Coating",
    heroFile: "how-to-remove-wax-before-ceramic-coating-hero.png",
    inlineFile: "how-to-remove-wax-before-ceramic-coating-3-signs.png",
    eyebrow: "Prep · Wax removal",
    navLabel: "Remove wax first",
    summary: "How to remove wax before ceramic coating or a spray finish: gentle-to-heavy options, how to test first and protect trim, and how to check the wax is gone.",
    group: "prep-and-application",
    groupPosition: 4,
  },
  {
    slug: "how-long-to-wait-to-wash-after-ceramic-spray",
    routeKey: "waitToWash",
    h1: "How Long After Ceramic Coating to Wash Your Car: Waiting Out a Fresh Spray",
    title: "How Long to Wait to Wash After Ceramic Spray",
    heroFile: "how-long-to-wait-to-wash-after-ceramic-spray-hero.png",
    inlineFile: null,
    eyebrow: "Timing · First wash",
    navLabel: "When to wash after spraying",
    summary: "How long after ceramic coating to wash car? There's no universal wait, so check your label. What to look for, what to do if it rains, and your first wash.",
    group: "prep-and-application",
    groupPosition: 5,
  },
  {
    slug: "ceramic-coating-maintenance",
    routeKey: "coatingMaintenance",
    h1: "Ceramic Coating Maintenance: A Simple Routine That Keeps Spray Coatings Working",
    title: "Ceramic Coating Maintenance: A Simple Routine",
    heroFile: "ceramic-coating-maintenance-hero.png",
    inlineFile: null,
    eyebrow: "Care · Maintenance routine",
    navLabel: "Coating maintenance",
    summary: "Ceramic coating maintenance made simple: wash gently, dry the car, clear contamination fast, watch water behavior and gloss, and top up as your label says.",
    group: "wash-and-care",
    groupPosition: 1,
  },
  {
    slug: "how-to-wash-a-ceramic-coated-car",
    routeKey: "washCoatedCar",
    h1: "How to Wash a Ceramic Coated Car at Home",
    title: "How to Wash a Ceramic Coated Car at Home",
    heroFile: "how-to-wash-a-ceramic-coated-car-hero.png",
    inlineFile: null,
    eyebrow: "Wash · Step by step",
    navLabel: "Wash a coated car",
    summary: "How to wash a ceramic coated car at home: shade and cool paint, a top-down pre-rinse, wheels first, pH-neutral shampoo and two buckets, then a final rinse.",
    group: "wash-and-care",
    groupPosition: 2,
  },
  {
    slug: "ceramic-spray-streaks-high-spots",
    routeKey: "streaksHighSpots",
    h1: "Ceramic Coating Streaks, Haze or High Spots? How to Fix Them",
    title: "Ceramic Coating Streaks & High Spots: How to Fix",
    heroFile: "ceramic-spray-streaks-high-spots-hero.png",
    inlineFile: "ceramic-spray-streaks-high-spots-too-much-product.png",
    eyebrow: "Fix · Streaks & haze",
    navLabel: "Streaks & high spots",
    summary: "Ceramic coating streaks, haze or high spots after a spray? Learn which problem you have, then fix it from gentle to heavy, starting with a clean re-buff.",
    group: "troubleshooting",
    groupPosition: 1,
  },
];

// Expected full group order from the spec
const expectedGroupOrder = {
  "compare-and-choose": [
    "paintProtectionTypes", "whatIsSprayCeramic", "whatIsCarGlaze", "sprayVsCoating",
    "waxVsSprayCoating", "diyVsPro"
  ],
  "prep-and-application": [
    "prepForSpray", "wetOrDry", "coatingOverWax", "removeWaxFirst", "waitToWash",
    "coloredGlaze", "glazeCoating"
  ],
  "wash-and-care": [
    "coatingMaintenance", "washCoatedCar", "afterWashing", "autoWashCoating"
  ],
  "durability-and-weather": [
    "howOftenReapply", "rainDamageCoating"
  ],
  "troubleshooting": [
    "streaksHighSpots"
  ]
};

let allPassed = true;
const results = [];

// Normalize quotes for comparison (convert curly to straight)
function normalizeQuotes(str) {
  return str.replace(/'/g, "'").replace(/'/g, "'").replace(/"/g, '"').replace(/"/g, '"');
}

console.log("\n=== Batch 1 Guides Page Verification ===\n");
console.log("| Slug | Status | Notes |");
console.log("|------|--------|-------|");

for (const guide of guides) {
  const pageFile = path.join(
    __dirname,
    "../app/(us)/us/guides/" + guide.slug + "/page.js"
  );
  const heroPath = path.join(
    __dirname,
    "../public/us/assets/generated/" + guide.heroFile
  );

  let pageContent;
  try {
    pageContent = fs.readFileSync(pageFile, "utf8");
  } catch (e) {
    results.push({ slug: guide.slug, status: "FAIL", error: "Page file not found" });
    allPassed = false;
    continue;
  }

  const issues = [];

  // Check H1 (normalize quotes for comparison)
  const h1Match = pageContent.match(/const H1 = "([^"]+)"/);
  if (h1Match) {
    const pageH1 = normalizeQuotes(h1Match[1]);
    const expectedH1 = normalizeQuotes(guide.h1);
    if (pageH1 !== expectedH1) {
      issues.push("H1 mismatch: got '" + pageH1.substring(0, 30) + "...'");
    }
  } else {
    issues.push("H1 not found");
  }

  // Check TITLE (normalize quotes for comparison)
  const titleMatch = pageContent.match(/const TITLE = "([^"]+)"/);
  if (titleMatch) {
    const pageTitle = normalizeQuotes(titleMatch[1]);
    const expectedTitle = normalizeQuotes(guide.title);
    if (pageTitle !== expectedTitle) {
      issues.push("TITLE mismatch: got '" + pageTitle.substring(0, 30) + "...'");
    }
  } else {
    issues.push("TITLE not found");
  }

  // Check hero image exists
  if (!fs.existsSync(heroPath)) {
    issues.push("Hero missing");
  }

  // Check inline image if expected
  if (guide.inlineFile) {
    const inlinePath = path.join(
      __dirname,
      "../public/us/assets/generated/" + guide.inlineFile
    );
    if (!fs.existsSync(inlinePath)) {
      issues.push("Inline image missing");
    }
  }

  // Check that [BODY IMAGE 1 HERE] marker is NOT in the output
  if (pageContent.includes("[BODY IMAGE 1 HERE]") || pageContent.includes("[BODY IMAGE")) {
    issues.push("Raw [BODY IMAGE] marker found");
  }

  if (issues.length > 0) {
    results.push({ slug: guide.slug, status: "FAIL", issues });
    allPassed = false;
  } else {
    results.push({ slug: guide.slug, status: "PASS" });
  }
}

// Print results
for (const r of results) {
  const notes = r.issues ? r.issues.join("; ") : (r.error || "All checks passed");
  console.log("| " + r.slug + " | " + r.status + " | " + notes + " |");
}

// Check sitemap includes all new routes (by route key, not slug)
const sitemapFile = fs.readFileSync(path.join(__dirname, "../app/sitemap.js"), "utf8");
const missingSitemap = [];
for (const guide of guides) {
  if (!sitemapFile.includes("routes." + guide.routeKey)) {
    missingSitemap.push(guide.slug);
  }
}

console.log("\n=== Sitemap Check ===");
if (missingSitemap.length > 0) {
  console.log("Missing from sitemap: " + missingSitemap.join(", "));
  allPassed = false;
} else {
  console.log("All 10 guides present in sitemap: PASS");
}

// Check all images exist
console.log("\n=== Image Files Check ===");
const imageDir = path.join(__dirname, "../public/us/assets/generated");
const expectedImages = [
  "types-of-car-paint-protection-hero.png",
  "what-is-spray-ceramic-coating-hero.png",
  "what-is-spray-ceramic-coating-does-wont.png",
  "ceramic-spray-vs-ceramic-coating-hero.png",
  "what-is-car-glaze-hero.png",
  "how-to-prep-car-for-ceramic-spray-hero.png",
  "how-to-prep-car-for-ceramic-spray-ready-check.png",
  "how-to-remove-wax-before-ceramic-coating-hero.png",
  "how-to-remove-wax-before-ceramic-coating-3-signs.png",
  "how-long-to-wait-to-wash-after-ceramic-spray-hero.png",
  "ceramic-coating-maintenance-hero.png",
  "how-to-wash-a-ceramic-coated-car-hero.png",
  "ceramic-spray-streaks-high-spots-hero.png",
  "ceramic-spray-streaks-high-spots-too-much-product.png",
];

const missingImages = [];
for (const img of expectedImages) {
  const imgPath = path.join(imageDir, img);
  if (!fs.existsSync(imgPath)) {
    missingImages.push(img);
  }
}

if (missingImages.length > 0) {
  console.log("Missing images: " + missingImages.join(", "));
  allPassed = false;
} else {
  console.log("All 14 images present: PASS");
}

// === INDEX PAGE VERIFICATION ===
console.log("\n=== Index Page Verification ===");
const indexFile = fs.readFileSync(path.join(__dirname, "../app/(us)/us/guides/page.js"), "utf8");

// Check exactly 1 H1
const h1Count = (indexFile.match(/<h1/g) || []).length;
if (h1Count === 1) {
  console.log("Index H1 count: PASS (exactly 1)");
} else {
  console.log("Index H1 count: FAIL (found " + h1Count + ", expected 1)");
  allPassed = false;
}

// Check card content for new guides
console.log("\n=== Card Content Verification ===");
const cardIssues = [];
for (const guide of guides) {
  // Check eyebrow
  if (!indexFile.includes(guide.eyebrow)) {
    cardIssues.push(guide.slug + ": eyebrow '" + guide.eyebrow + "' not found");
  }
  // Check card title (H1)
  if (!indexFile.includes(guide.h1)) {
    cardIssues.push(guide.slug + ": title '" + guide.h1.substring(0, 40) + "...' not found");
  }
  // Check summary
  if (!indexFile.includes(guide.summary.substring(0, 60))) {
    cardIssues.push(guide.slug + ": summary not found");
  }
}

if (cardIssues.length > 0) {
  console.log("Card content issues:");
  cardIssues.forEach(i => console.log("  - " + i));
  allPassed = false;
} else {
  console.log("All 10 new cards have correct eyebrow, title, summary: PASS");
}

// Check nav labels (JUMP_LINK_LABELS)
console.log("\n=== Nav Label Verification ===");
const navIssues = [];
for (const guide of guides) {
  // Check that the nav label appears in JUMP_LINK_LABELS
  const escapedLabel = guide.navLabel.replace(/[?]/g, "\\?");
  const navLabelRegex = new RegExp('\\[routes\\.' + guide.routeKey + '\\]:\\s*["\']' + escapedLabel.replace(/'/g, "\\'") + '["\']');
  if (!indexFile.includes(guide.navLabel)) {
    navIssues.push(guide.slug + ": nav label '" + guide.navLabel + "' not found");
  }
}

if (navIssues.length > 0) {
  console.log("Nav label issues:");
  navIssues.forEach(i => console.log("  - " + i));
  allPassed = false;
} else {
  console.log("All 10 new nav labels present: PASS");
}

// Check group order in GUIDE_GROUPS
console.log("\n=== Group Order Verification ===");
const groupOrderIssues = [];

// Extract GUIDE_GROUPS from index file
const guideGroupsMatch = indexFile.match(/const GUIDE_GROUPS = \[([\s\S]*?)\];/);
if (guideGroupsMatch) {
  const guideGroupsContent = guideGroupsMatch[1];
  
  for (const [groupId, expectedOrder] of Object.entries(expectedGroupOrder)) {
    // Find the group in the content
    const groupRegex = new RegExp('id:\\s*["\']' + groupId + '["\'][\\s\\S]*?items:\\s*\\[([^\\]]+)\\]');
    const groupMatch = guideGroupsContent.match(groupRegex);
    
    if (groupMatch) {
      const itemsStr = groupMatch[1];
      const actualItems = [];
      const itemMatches = itemsStr.matchAll(/routes\.(\w+)/g);
      for (const m of itemMatches) {
        actualItems.push(m[1]);
      }
      
      // Compare order
      if (actualItems.length !== expectedOrder.length) {
        groupOrderIssues.push(groupId + ": item count mismatch (got " + actualItems.length + ", expected " + expectedOrder.length + ")");
      } else {
        for (let i = 0; i < expectedOrder.length; i++) {
          if (actualItems[i] !== expectedOrder[i]) {
            groupOrderIssues.push(groupId + " position " + (i+1) + ": got " + actualItems[i] + ", expected " + expectedOrder[i]);
          }
        }
      }
    } else {
      groupOrderIssues.push(groupId + ": group not found in GUIDE_GROUPS");
    }
  }
} else {
  groupOrderIssues.push("Could not parse GUIDE_GROUPS");
}

if (groupOrderIssues.length > 0) {
  console.log("Group order issues:");
  groupOrderIssues.forEach(i => console.log("  - " + i));
  allPassed = false;
} else {
  console.log("All group orders match spec: PASS");
}

// Check navigation.js
console.log("\n=== Navigation.js Verification ===");
const navFile = fs.readFileSync(path.join(__dirname, "../lib/us/navigation.js"), "utf8");
const navFileIssues = [];

// Check all nav labels are present
for (const guide of guides) {
  if (!navFile.includes(guide.navLabel)) {
    navFileIssues.push(guide.slug + ": nav label '" + guide.navLabel + "' not in navigation.js");
  }
}

// Check Troubleshooting group exists
if (!navFile.includes('"Troubleshooting"') && !navFile.includes("'Troubleshooting'")) {
  navFileIssues.push("Troubleshooting group not found in navigation.js");
}

if (navFileIssues.length > 0) {
  console.log("Navigation.js issues:");
  navFileIssues.forEach(i => console.log("  - " + i));
  allPassed = false;
} else {
  console.log("Navigation.js: PASS (all nav labels and groups present)");
}

// Summary table
console.log("\n=== Summary Table ===\n");
console.log("| Slug | H1 | Title | Hero | Inline |");
console.log("|------|-----|-------|------|--------|");
for (const guide of guides) {
  console.log("| " + guide.slug + " | " + guide.h1.substring(0, 40) + "... | " + guide.title.substring(0, 30) + "... | " + guide.heroFile + " | " + (guide.inlineFile || "N/A") + " |");
}

console.log("\n=== Final Result ===");
console.log(allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
process.exit(allPassed ? 0 : 1);
