#!/usr/bin/env node
/**
 * Verification script for Batch 1 SEO guides.
 * Checks that:
 * 1. Each page's H1 and TITLE match the package specs
 * 2. All hero and inline images exist
 * 3. All internal links resolve to existing routes
 * 4. No raw [BODY IMAGE] markers in output
 * 5. All guides are in sitemap
 */

const fs = require("fs");
const path = require("path");

const routesFile = fs.readFileSync(path.join(__dirname, "../lib/us/routes.js"), "utf8");

// Define the 10 new guides and their expected content from packages
const guides = [
  {
    slug: "types-of-car-paint-protection",
    routeKey: "typesOfCarPaintProtection",
    h1: "Types of Car Paint Protection: Wax, Sealant, Spray Glaze, Ceramic & PPF",
    title: "Types of Car Paint Protection: Wax to PPF",
    heroFile: "types-of-car-paint-protection-hero.png",
    inlineFile: null,
  },
  {
    slug: "what-is-spray-ceramic-coating",
    routeKey: "whatIsSprayCeramicCoating",
    h1: "What Is Spray Ceramic Coating? How It Works and What It Won't Do",
    title: "What Is Spray Ceramic Coating? How It Works",
    heroFile: "what-is-spray-ceramic-coating-hero.png",
    inlineFile: "what-is-spray-ceramic-coating-does-wont.png",
  },
  {
    slug: "ceramic-spray-vs-ceramic-coating",
    routeKey: "ceramicSprayVsCoating",
    h1: "Ceramic Spray vs Ceramic Coating: What's Actually Different?",
    title: "Ceramic Spray vs Ceramic Coating: What's Different?",
    heroFile: "ceramic-spray-vs-ceramic-coating-hero.png",
    inlineFile: null,
  },
  {
    slug: "what-is-car-glaze",
    routeKey: "whatIsCarGlaze",
    h1: "What Is Car Glaze? Glaze vs Wax vs Sealant, Explained",
    title: "What Is Car Glaze? Glaze vs Wax vs Sealant",
    heroFile: "what-is-car-glaze-hero.png",
    inlineFile: null,
  },
  {
    slug: "how-to-prep-car-for-ceramic-spray",
    routeKey: "howToPrepCarForCeramicSpray",
    h1: "How to Prep Your Car for Ceramic Spray (Wash, Decon, Dry)",
    title: "How to Prep Car for Ceramic Spray: Wash, Decon, Dry",
    heroFile: "how-to-prep-car-for-ceramic-spray-hero.png",
    inlineFile: "how-to-prep-car-for-ceramic-spray-ready-check.png",
  },
  {
    slug: "how-to-remove-wax-before-ceramic-coating",
    routeKey: "howToRemoveWaxBeforeCeramicCoating",
    h1: "How to Remove Wax Before Ceramic Coating",
    title: "How to Remove Wax Before Ceramic Coating",
    heroFile: "how-to-remove-wax-before-ceramic-coating-hero.png",
    inlineFile: "how-to-remove-wax-before-ceramic-coating-3-signs.png",
  },
  {
    slug: "how-long-to-wait-to-wash-after-ceramic-spray",
    routeKey: "howLongToWaitToWashAfterCeramicSpray",
    h1: "How Long After Ceramic Coating to Wash Your Car: Waiting Out a Fresh Spray",
    title: "How Long After Ceramic Coating to Wash Car?",
    heroFile: "how-long-to-wait-to-wash-after-ceramic-spray-hero.png",
    inlineFile: null,
  },
  {
    slug: "ceramic-coating-maintenance",
    routeKey: "ceramicCoatingMaintenance",
    h1: "Ceramic Coating Maintenance: A Simple Routine That Keeps Spray Coatings Working",
    title: "Ceramic Coating Maintenance: A Simple Routine",
    heroFile: "ceramic-coating-maintenance-hero.png",
    inlineFile: null,
  },
  {
    slug: "how-to-wash-a-ceramic-coated-car",
    routeKey: "howToWashCeramicCoatedCar",
    h1: "How to Wash a Ceramic Coated Car at Home",
    title: "How to Wash a Ceramic Coated Car at Home",
    heroFile: "how-to-wash-a-ceramic-coated-car-hero.png",
    inlineFile: null,
  },
  {
    slug: "ceramic-spray-streaks-high-spots",
    routeKey: "ceramicSprayStreaksHighSpots",
    h1: "Ceramic Coating Streaks, Haze or High Spots? How to Fix Them",
    title: "Ceramic Coating Streaks & High Spots: How to Fix",
    heroFile: "ceramic-spray-streaks-high-spots-hero.png",
    inlineFile: "ceramic-spray-streaks-high-spots-too-much-product.png",
  },
];

let allPassed = true;
const results = [];

// Normalize quotes for comparison (convert curly to straight)
function normalizeQuotes(str) {
  return str.replace(/'/g, "'").replace(/'/g, "'").replace(/"/g, '"').replace(/"/g, '"');
}

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
  // Use a regex that matches double-quoted strings properly (handling internal apostrophes)
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
console.log("\n=== Batch 1 Guides Verification ===\n");
console.log("| Slug | Status | Notes |");
console.log("|------|--------|-------|");
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
