import Link from "next/link";
import Image from "next/image";
import { routes, asset } from "@/lib/us/routes";
import { config } from "@/lib/us/config";
import { homeLink, guideGroups } from "@/lib/us/navigation";
import { company } from "@/lib/us/company";

export default function SiteFooter() {
  const supportEmail = config.supportEmail.trim() || company.email;
  const explore = [homeLink, ...guideGroups[0].items, ...guideGroups[1].items];
  const legal = [
    { label: "Privacy Policy", href: routes.privacy },
    { label: "Terms", href: routes.terms },
    { label: "Contact", href: routes.contact },
  ].filter(({ href }) => href && href !== "#");
  return (
    <footer className="us-site-footer" id="site-footer">
      <div className="us-shell">
        <div className="us-footer-grid">
          <div className="us-footer-brand">
            <Link href={routes.home} aria-label="APGO home" className="us-site-logo"><Image src={asset("brand/apgo-logo.png")} alt="APGO" width={140} height={32} /></Link>
            <p>Professional finish care, made simple.</p>
            <div className="us-footer-company">
              <span className="us-footer-detail-label">Operated by</span>
              <span lang="zh-Hant">{company.name}</span>
              <span>Taiwan Business ID: {company.businessId}</span>
              <address>{company.address}</address>
            </div>
          </div>
          <nav aria-label="Explore"><h2>Explore</h2><ul>{explore.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}</ul></nav>
          <nav aria-label="Application guides"><h2>Application guides</h2><ul>{guideGroups[2].items.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}</ul></nav>
          <section className="us-footer-support" aria-labelledby="us-footer-support-title">
            <h2 id="us-footer-support-title">Support</h2>
            <div className="us-footer-contact">
              <span className="us-footer-detail-label">Product questions</span>
              <a className="us-footer-email" href={`mailto:${supportEmail}`}>{supportEmail}</a>
              <a href={company.phoneHref}>{company.phone}</a>
              <p>{company.hours}<br />{company.timezone}</p>
            </div>
            <nav aria-label="Support"><ul>
              <li><Link href={routes.faq}>Product FAQ</Link></li>
              <li><a href="https://www.amazon.com/gp/your-account/order-history" target="_blank" rel="noopener noreferrer">Amazon order support <span aria-hidden="true">↗</span></a></li>
            </ul></nav>
            <p className="us-footer-order-note">For Amazon purchases, manage shipping, returns, and order questions through Your Orders on Amazon.</p>
          </section>
        </div>
        <div className="us-footer-bottom">
          <p>© {new Date().getFullYear()} APGO. Amazon.com is an independent retailer.</p>
          {legal.length > 0 && <nav aria-label="Legal">{legal.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>}
        </div>
      </div>
    </footer>
  );
}
