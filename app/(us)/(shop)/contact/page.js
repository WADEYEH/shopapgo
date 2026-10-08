import ContactForm from "@/components/shop/ContactForm";
import { company } from "@/lib/us/company";

// /contact (D27, D28): the form, the support details and what to include. Not indexed until launch.
export const metadata = {
  title: { absolute: "Contact · APGO" },
  alternates: { canonical: "/contact" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="shop-main legal" id="main">
      <div className="shop-intro">
        <p className="eyebrow">Support</p>
        <h1 className="heading-guide-h1">Contact</h1>
        <p className="body body--muted">Questions about a product or an order? We reply within 2 business days.</p>
      </div>
      <section className="legal__section" aria-labelledby="contact-form-title">
        <h2 id="contact-form-title">Send us a message</h2>
        <ContactForm />
      </section>
      <section className="legal__section legal__card" aria-labelledby="contact-support-title">
        <h2 id="contact-support-title">Customer support</h2>
        <dl className="legal__facts">
          <div><dt>Email</dt><dd><a href={`mailto:${company.email}`}>{company.email}</a></dd></div>
          <div><dt>Phone</dt><dd><a href={company.phoneHref}>{company.phone}</a></dd></div>
          <div><dt>Hours</dt><dd>{`${company.hours} ${company.timezone}`}</dd></div>
          <div>
            <dt>Operated by</dt>
            <dd>
              <span lang="zh-Hant">{company.name}</span>
              <br />
              {`Taiwan Business ID ${company.businessId}`}
              <br />
              <address>{company.address}</address>
            </dd>
          </div>
        </dl>
      </section>
      <section className="legal__section">
        <h2>Before you write</h2>
        <p>
          For returns, see <a href="/returns">Returns &amp; Refunds</a>; for delivery, our <a href="/shipping">Shipping Policy</a>.
          For orders placed on Amazon, use Your Orders on Amazon.
        </p>
      </section>
    </main>
  );
}
