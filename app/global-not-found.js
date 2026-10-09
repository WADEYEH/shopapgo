import "./(us)/us.css";
import { barlow, barlowCondensed } from "./(us)/fonts";
import SiteChrome from "@/components/us/SiteChrome";
import SiteFooter from "@/components/us/SiteFooter";
import GtmScripts from "@/components/us/GtmScripts";
import MetaPixel from "@/components/us/MetaPixel";
import { routes } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import { SITE_URL } from "@/lib/site";

// The site's 404 page (out/404.html; the Worker serves it for any unknown path, wrangler.toml not_found_handling).
// The site has two root layouts ((us) and (tw)), so Next needs this page to bring its own <html> (next.config.mjs:
// experimental.globalNotFound). It looks like any other page: the site header and footer, and the way back.

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Page not found · APGO",
  description: "This page is not on the APGO site. Shop the two coatings, read the guides or go back to the home page.",
  robots: { index: false, follow: true },
};

const onHost = (href) => href && href !== "#";

export default function GlobalNotFound() {
  const links = [
    onHost(routes.shop) && { href: routes.shop, label: "Shop APGO", primary: true },
    { href: routes.guides, label: "Read the guides" },
    { href: routes.home, label: "Home" },
  ].filter(Boolean);
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="us-site">
        <SiteChrome footer={<SiteFooter />}>
          <main id="main" style={{ background: color.bg }}>
            <section style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(56px,9vw,128px) 20px clamp(64px,10vw,144px)", display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, color: color.orange, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase" }}>
                <span style={{ width: 28, height: 2, background: color.orange }}></span>404
              </div>
              <h1 style={{ margin: 0, fontFamily: CONDENSED, fontWeight: 800, fontSize: "clamp(52px,9vw,112px)", lineHeight: 0.86, textTransform: "uppercase", color: color.text }}>
                Page not found.
              </h1>
              <p style={{ margin: 0, maxWidth: 560, fontSize: 18, lineHeight: 1.55, color: color.tertiary }}>
                This page isn&apos;t here. It may have moved when the store joined this site. Everything is still a click away.
              </p>
              <nav aria-label="Where to go next" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 24px", marginTop: 12 }}>
                {links.map((link) =>
                  link.primary ? (
                    <a key={link.href} href={link.href} className="us-site-cta">{link.label} <span aria-hidden="true">→</span></a>
                  ) : (
                    <a key={link.href} href={link.href} className="us-not-found-link">{link.label} <span aria-hidden="true">→</span></a>
                  ),
                )}
              </nav>
            </section>
          </main>
        </SiteChrome>
        <GtmScripts />
        <MetaPixel />
      </body>
    </html>
  );
}
