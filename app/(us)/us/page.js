import Landing from "@/components/us/landing/Landing";
import { routes, asset } from "@/lib/us/routes";
import { landingFaq } from "@/lib/us/faq";

const SITE = "https://www.shopapgo.com";
const title = "APGO Atomic Colored Glaze & Atomic Glaze Coating · Professional finish care, made simple";
const description =
  "Same simple core: spray, spread, and finish with a clean towel. The only difference is timing—Dry after you've dried the paint, Wet while it's still wet. Available on Amazon.com.";

export const metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: routes.home },
  openGraph: {
    title,
    description,
    url: routes.home,
    images: [asset("products/d204-packshot.png")],
  },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "APGO",
    url: SITE + routes.home,
    logo: SITE + asset("brand/apgo-logo.png"),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Landing />
    </>
  );
}
