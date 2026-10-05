import Landing from "@/components/us/landing/Landing";
import { routes, asset } from "@/lib/us/routes";
import { landingFaq } from "@/lib/us/faq";
import { SITE_URL } from "@/lib/site";

const title = "APGO Atomic Colored Glaze & Atomic Glaze Coating · Professional finish care, made simple";
const description =
  "Same simple core: spray, spread, and finish with a clean towel. The only difference is timing—Dry after you've dried the paint, Wet while it's still wet. Shop D204 and D215 on this site.";

// Next metadata normalizes pathname "/" to origin without a trailing slash
// (resolveAbsoluteUrlWithPathname). SEO wants https://www.shopapgo.com/ exactly,
// so canonical + og:url are emitted as raw head tags below instead of via metadata.
const homeUrl = new URL(routes.home, SITE_URL).href;

export const metadata = {
  title: { absolute: title },
  description,
  openGraph: {
    title,
    description,
    images: [asset("products/d204-packshot.png")],
  },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "APGO",
    url: homeUrl,
    logo: SITE_URL + asset("brand/apgo-logo.png"),
    foundingDate: "2011",
    address: { "@type": "PostalAddress", addressLocality: "Taipei", addressCountry: "TW" },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: landingFaq.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  },
];

export default function USLandingPage() {
  return (
    <>
      <link rel="canonical" href={homeUrl} />
      <meta property="og:url" content={homeUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Landing />
    </>
  );
}
