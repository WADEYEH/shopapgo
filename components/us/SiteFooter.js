import Link from "next/link";
import Image from "next/image";
import { routes, asset } from "@/lib/us/routes";
import { config } from "@/lib/us/config";
import { homeLink, guideGroups } from "@/lib/us/navigation";

export default function SiteFooter() {
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
          </div>
          <nav aria-label="Explore"><h2>Explore</h2><ul>{explore.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}</ul></nav>
          <nav aria-label="Application guides"><h2>Application guides</h2><ul>{guideGroups[2].items.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}</ul></nav>
          <nav aria-label="Support"><h2>Support</h2><ul>
            <li><Link href={routes.faq}>FAQ</Link></li>
            {config.supportEmail && <li><a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a></li>}
          </ul></nav>
        </div>
        <div className="us-footer-bottom">
          <p>© {new Date().getFullYear()} APGO. Amazon.com is an independent retailer.</p>
          {legal.length > 0 && <nav aria-label="Legal">{legal.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>}
        </div>
      </div>
    </footer>
  );
}
