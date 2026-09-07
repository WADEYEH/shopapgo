/** @type {import('next').NextConfig} */
const nextConfig = {
  // The domain root currently forwards to the US Amazon landing site.
  // Remove this redirect when the Taiwan storefront is ready to take over "/".
  async redirects() {
    return [{ source: "/", destination: "/us", permanent: true }];
  },
};
export default nextConfig;
