export const SITE = "https://www.shopapgo.com";

const ORG = { "@type": "Organization", name: "APGO" };

// Article schema for a guide. `route` and `image` are site-relative paths.
export function articleLd({ headline, description, image, route }) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    image: SITE + image,
    author: ORG,
    publisher: ORG,
    mainEntityOfPage: SITE + route,
  };
}

// FAQPage schema from the same [{ q, a }] array that renders the <details> rows.
export function faqLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

// Renders one <script type="application/ld+json"> per object passed.
export default function JsonLd({ data }) {
  const list = Array.isArray(data) ? data : [data];
  return list.map((obj, i) => (
    <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />
  ));
}
