/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export for Cloudflare Pages deployment.
  output: "export",

  // next/image requires an external loader or unoptimized mode for static export.
  // Using unoptimized keeps existing <Image> components working without changes.
  images: { unoptimized: true },

  // The root redirect (/ → /us) is now handled by public/_redirects for
  // Cloudflare Pages. Remove this redirects() block entirely once the static
  // export is confirmed working; until then it is commented out for reference.
  // async redirects() {
  //   return [{ source: "/", destination: "/us", permanent: true }];
  // },
};
export default nextConfig;
