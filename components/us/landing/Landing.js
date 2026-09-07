"use client";

import { useCallback, useEffect, useState } from "react";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED, products } from "@/lib/us/tokens";
import { config } from "@/lib/us/config";
import { track } from "@/lib/us/analytics";
import AmazonCta from "./AmazonCta";
import RoutineSelector from "./RoutineSelector";
import Hero from "./Hero";
import BrandSection from "./BrandSection";
import TechnologySection from "./TechnologySection";
import RoutineSection from "./RoutineSection";
import FaqSection from "./FaqSection";
import GuidesSection from "./GuidesSection";
import FinalSection from "./FinalSection";

const NAV = [
  { href: "#brand", label: "Our Story" },
  { href: "#technology", label: "Technology" },
  { href: "#compare", label: "Dry or Wet" },
  { href: "#faq", label: "FAQ" },
  { href: routes.guides, label: "Guides" },
];

export default function Landing() {
  const [sku, setSku] = useState("d204");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sticky, setSticky] = useState(false);

  // Initial sku from the URL hash (#d204 / #d215), landing view + scroll-depth analytics,
  // and the IntersectionObserver that drives the mobile sticky CTA.
  useEffect(() => {
    const hash = (location.hash || "").replace("#", "");
    if (hash === "d215" || hash === "d204") setSku(hash);

    track("us_referral_landing_view");

    let heroVisible = true;
    let finalVisible = false;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.target.id === "top") heroVisible = e.isIntersecting;
          if (e.target.id === "final") finalVisible = e.isIntersecting;
        });
        setSticky(!heroVisible && !finalVisible);
      },
      { threshold: 0.05 }
    );
    ["top", "final"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });

    const depths = new Set();
    const onScroll = () => {
      const d = document.documentElement;
      const p = Math.round(((d.scrollTop + window.innerHeight) / d.scrollHeight) * 100);
      [25, 50, 75, 90].forEach((m) => {
        if (p >= m && !depths.has(m)) {
          depths.add(m);
          track("scroll_depth", { percent: m });
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-selected-sku", sku);
  }, [sku]);

  const pick = useCallback((next) => {
    setSku(next);
    history.replaceState(null, "", "#" + next);
    track("fit_selector_answer", { sku: next });
  }, []);

  const sel = products[sku];
  const selCta = sku === "d204" ? "Buy Dry · Colored Glaze" : "Buy Wet · Glaze Coating";
  const email = config.supportEmail;

  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <a href="#main" className="us-skip">
        Skip to content
      </a>

      {/* HEADER */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          height: 72,
          background: "rgba(8,10,12,.92)",
          backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${color.hairline}`,
        }}
      >
        <div
          style={{
            maxWidth: 1312,
            margin: "0 auto",
            height: "100%",
            padding: "0 clamp(20px,4.4vw,64px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <a href="#top" aria-label="APGO home" style={{ display: "flex" }}>
            <img src={asset("brand/apgo-logo.png")} alt="APGO" style={{ height: 26, display: "block" }} />
          </a>
          <div className="us-desktop-only">
            <nav
              aria-label="Page"
              style={{ display: "flex", gap: "clamp(20px,3vw,40px)", fontSize: 14, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase" }}
            >
              {NAV.map((n) => (
                <a key={n.href} href={n.href} className="us-nav-link" style={{ color: color.tertiary, textDecoration: "none", whiteSpace: "nowrap" }}>
                  {n.label}
                </a>
              ))}
            </nav>
            <AmazonCta
              sku={sku}
              placement="header"
              className="us-btn-sm"
              style={{
                background: color.orange,
                color: color.bg,
                height: 46,
                padding: "0 20px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontWeight: 700,
                fontSize: 15,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {selCta}
            </AmazonCta>
          </div>
          <div className="us-mobile-only">
            <button
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                width: 44,
                height: 44,
                background: "none",
                border: 0,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "flex-end",
                gap: 6,
                padding: 0,
              }}
            >
              <span style={{ width: 24, height: 2, background: color.text }} />
              <span style={{ width: 16, height: 2, background: color.text }} />
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav
            aria-label="Page"
            style={{ background: color.surface, borderBottom: `1px solid ${color.hairline}`, display: "flex", flexDirection: "column", padding: "8px 20px 16px" }}
          >
            {NAV.map((n, i) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  color: color.text,
                  textDecoration: "none",
                  fontFamily: CONDENSED,
                  fontWeight: 700,
                  fontSize: 28,
                  textTransform: "uppercase",
                  padding: "12px 0",
                  ...(i < NAV.length - 1 ? { borderBottom: `1px solid ${color.hairline}` } : null),
                }}
              >
                {n.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      {/* DESKTOP SELECTOR BAR */}
      <div className="us-desktop-only">
        <div style={{ position: "sticky", top: 72, zIndex: 40, background: color.surface, borderBottom: `1px solid ${color.hairline}` }}>
          <div
            style={{
              maxWidth: 1312,
              margin: "0 auto",
              minHeight: 72,
              padding: "12px clamp(20px,4.4vw,64px)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "12px 32px",
            }}
          >
            <div
              id="routine-q"
              style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 24, letterSpacing: ".02em", textTransform: "uppercase", whiteSpace: "nowrap", flex: "none" }}
            >
              When do you prefer to apply?
            </div>
            <RoutineSelector sku={sku} onPick={pick} variant="desktop" labelledBy="routine-q" />
            <div data-selection-live aria-live="polite" className="us-sr-only">
              Selected · {sel.fullName}
            </div>
          </div>
        </div>
      </div>

      <main id="main">
        <Hero />

        {/* MOBILE SELECTOR */}
        <div className="us-mobile-only">
          <section
            style={{
              background: color.surface,
              borderTop: `1px solid ${color.hairline}`,
              borderBottom: `1px solid ${color.hairline}`,
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div id="routine-q-m" style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 26, letterSpacing: ".02em", textTransform: "uppercase" }}>
              When do you prefer to apply?
            </div>
            <RoutineSelector sku={sku} onPick={pick} variant="mobile" labelledBy="routine-q-m" />
            <div data-selection-live aria-live="polite" style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: color.tertiary }}>
              Selected · <span style={{ color: color.text }}>{sel.fullName}</span>
            </div>
          </section>
        </div>

        <BrandSection />
        <TechnologySection />
        <RoutineSection sku={sku} onPick={pick} />
        <FaqSection />
        <GuidesSection />
        <FinalSection />
      </main>

      {/* FOOTER */}
      <footer className="us-landing-footer" style={{ background: color.bg, borderTop: `1px solid ${color.hairline}` }}>
        <div
          style={{
            maxWidth: 1312,
            margin: "0 auto",
            padding: "40px clamp(20px,4.4vw,64px)",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
          }}
        >
          <img src={asset("brand/apgo-logo.png")} alt="APGO" style={{ height: 24 }} />
          <nav aria-label="Legal" style={{ display: "flex", gap: 28, fontSize: 13, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase" }}>
            <a href={routes.guides} className="us-nav-link" style={{ color: color.tertiary, textDecoration: "none" }}>Guides</a>
            <a href={routes.privacy} className="us-nav-link" style={{ color: color.tertiary, textDecoration: "none" }}>Privacy</a>
            <a href={routes.terms} className="us-nav-link" style={{ color: color.tertiary, textDecoration: "none" }}>Terms</a>
            <a href={routes.contact} className="us-nav-link" style={{ color: color.tertiary, textDecoration: "none" }}>Contact</a>
            {email && (
              <a href={`mailto:${email}`} style={{ color: color.orange, textDecoration: "none", textTransform: "none", letterSpacing: 0 }}>
                {email}
              </a>
            )}
          </nav>
          <span style={{ fontSize: 13, color: color.quiet }}>© {new Date().getFullYear()} APGO. Amazon.com is an independent retailer.</span>
        </div>
      </footer>

      {/* MOBILE STICKY CTA */}
      <div className="us-mobile-only">
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 60,
            background: "rgba(17,20,25,.96)",
            backdropFilter: "blur(14px)",
            borderTop: `1px solid ${color.border}`,
            padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
            display: "flex",
            alignItems: "center",
            gap: 12,
            transform: sticky ? "translateY(0)" : "translateY(110%)",
            transition: "transform .26s cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 22, lineHeight: 1, color: sel.accent, letterSpacing: ".04em" }}>{sel.word}</span>
            <span style={{ fontSize: 12, color: color.tertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sel.fullName}</span>
          </div>
          <AmazonCta
            sku={sku}
            placement="sticky"
            style={{
              marginLeft: "auto",
              background: color.orange,
              color: color.bg,
              height: 48,
              padding: "0 18px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
              whiteSpace: "nowrap",
              flex: "none",
            }}
          >
            Buy on Amazon
          </AmazonCta>
        </div>
      </div>
    </div>
  );
}
