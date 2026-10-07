// Builds the single-site asset directory served by the Worker: the brand site's Next.js static export plus the store
// pages (prototype/). Both trees are copied into one directory, and a path that exists in both stops the build, so
// neither side can silently replace the other. Pages-only files are left out (_redirects: the Worker answers /us itself).
//
//   node scripts/build-site.mjs                 copy ../out + prototype -> site
//   node scripts/build-site.mjs --build-brand   first run the brand build with analytics forced off (test sites)
//   node scripts/build-site.mjs --brand <dir> --store <dir> --out <dir>
import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMERCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Brand-export files that only Cloudflare Pages understands; the Worker handles their job.
export const BRAND_SKIP = new Set(["_redirects"]);

// A test-site build must never report to the production GA4, GTM or Meta Pixel: NEXT_PUBLIC_* values are inlined at
// build time, and values already in the environment win over a developer's .env.local.
export const TEST_SITE_BRAND_ENV = {
  NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "false",
  NEXT_PUBLIC_APGO_US_GTM_ID: "",
  NEXT_PUBLIC_APGO_US_META_PIXEL_ID: "",
};

async function files(root, base = root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return files(full, base);
    return entry.isFile() ? [path.relative(base, full).split(path.sep).join("/")] : [];
  }));
  return nested.flat();
}

// Copies brand + store into out. Returns { brand, store } file counts; throws on any shared path.
export async function buildSite({ brand, store, out }) {
  for (const [name, dir] of [["brand export", brand], ["store pages", store]]) {
    const info = await stat(dir).catch(() => null);
    if (!info?.isDirectory()) throw new Error(`${name} not found at ${dir}`);
  }
  const brandFiles = (await files(brand)).filter((file) => !BRAND_SKIP.has(file));
  const storeFiles = await files(store);
  const storeSet = new Set(storeFiles);
  const shared = brandFiles.filter((file) => storeSet.has(file));
  if (shared.length) throw new Error(`brand export and store pages both contain: ${shared.join(", ")}`);

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const file of brandFiles) await cp(path.join(brand, file), path.join(out, file));
  await cp(store, out, { recursive: true });
  return { brand: brandFiles.length, store: storeFiles.length };
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--build-brand")) {
    // A fixed command string (npm is a .cmd on Windows, so it needs a shell); nothing user-supplied is interpolated.
    const result = spawnSync("npm --prefix .. run build", {
      cwd: COMMERCE,
      env: { ...process.env, ...TEST_SITE_BRAND_ENV },
      stdio: "inherit",
      shell: true,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  // Defaults live next to this package; explicit paths are relative to the current directory (CI runs from the root).
  const brand = path.resolve(option("--brand", path.join(COMMERCE, "..", "out")));
  const store = path.resolve(option("--store", path.join(COMMERCE, "prototype")));
  const out = path.resolve(option("--out", path.join(COMMERCE, "site")));
  const counts = await buildSite({ brand, store, out });
  console.log(`site: ${counts.brand} brand files + ${counts.store} store files -> ${out}`);
}
