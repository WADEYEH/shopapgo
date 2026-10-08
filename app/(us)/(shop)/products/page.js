import CatalogCard from "@/components/shop/CatalogCard";
import ReadyFlag from "@/components/shop/ReadyFlag";
import { SEO, SKUS } from "@/lib/shop/catalog";

const seo = SEO.shop;

// Not indexable until launch, like every store page (M1: indexing opens at the cutover).
export const metadata = {
  title: { absolute: seo.title },
  description: seo.description,
  alternates: { canonical: seo.path },
  robots: { index: false, follow: false },
  openGraph: { title: seo.title, description: seo.description, url: seo.path, images: [seo.image], type: "website" },
  twitter: { card: "summary" },
};

// /products: every product on sale (D39). Prices come from the Worker in each card.
export default function ShopPage() {
  return (
    <>
      <noscript><p className="pdp-noscript">Turn on JavaScript to see prices and add products to your cart.</p></noscript>
      <main id="main">
        <section className="pdp-section" aria-labelledby="shop-title">
          <div className="pdp-wrap pdp-section__inner">
            <div className="pdp-head">
              <p className="eyebrow eyebrow--plain">Shop</p>
              <h1 className="heading-guide-h1" id="shop-title">Same finish. Pick your moment.</h1>
              <p className="body">{seo.description}</p>
            </div>
            <ul className="catalog" aria-label="Products">
              {SKUS.map((sku) => <CatalogCard key={sku} sku={sku} />)}
            </ul>
          </div>
        </section>
      </main>
      <ReadyFlag name="shopReady" />
    </>
  );
}
