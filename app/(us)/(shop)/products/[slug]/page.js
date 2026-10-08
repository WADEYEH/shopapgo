import { notFound } from "next/navigation";
import ProductPage from "@/components/shop/ProductPage";
import { PRODUCT_SLUGS, SEO, SKUS } from "@/lib/shop/catalog";

// /products/atomic-colored-glaze and /products/atomic-glaze-coating (D39). The Worker answers the old
// /products/d204 and /products/d215 with a 301 to these (commerce/worker/redirects.js).
export const dynamicParams = false;

const skuFor = (slug) => SKUS.find((sku) => PRODUCT_SLUGS[sku] === slug);

export function generateStaticParams() {
  return SKUS.map((sku) => ({ slug: PRODUCT_SLUGS[sku] }));
}

// Not indexable until launch, like every store page (M1: indexing opens at the cutover).
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const seo = SEO[skuFor(slug)];
  if (!seo) return {};
  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical: seo.path },
    robots: { index: false, follow: false },
    openGraph: { title: seo.title, description: seo.description, url: seo.path, images: [seo.image], type: "website" },
    twitter: { card: "summary" },
  };
}

export default async function Page({ params }) {
  const { slug } = await params;
  const sku = skuFor(slug);
  if (!sku) notFound();
  return <ProductPage sku={sku} />;
}
