/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export for Cloudflare Pages deployment.
  output: "export",

  // next/image requires an external loader or unoptimized mode for static export.
  // Using unoptimized keeps existing <Image> components working without changes.
  images: { unoptimized: true },

  // The site has two root layouts ((us) and (tw)), so its 404 page brings its own <html>: app/global-not-found.js.
  experimental: { globalNotFound: true },

  // Exact /us → / is handled by public/_redirects (Cloudflare Pages) and vercel.json.
  // Guides remain at /us/guides/*; do not add a /us/* splat redirect.
};
export default nextConfig;
