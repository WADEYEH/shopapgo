"use client";

import { useCallback, useEffect, useState } from "react";
import { homeSections } from "@/lib/us/navigation";
import { useSiteMenuOpen } from "@/components/us/SiteChrome";
import OnThisPage from "@/components/us/guides/OnThisPage";
import { color, CONDENSED, products } from "@/lib/us/tokens";
import { track } from "@/lib/us/analytics";
import AmazonCta from "./AmazonCta";
import Hero from "./Hero";
import BrandSection from "./BrandSection";
import TechnologySection from "./TechnologySection";
import RoutineSection from "./RoutineSection";
import FaqSection from "./FaqSection";
import GuidesSection from "./GuidesSection";
import FinalSection from "./FinalSection";

export default function Landing() {
  const [sku, setSku] = useState("d204");
  const menuOpen = useSiteMenuOpen();
  const [sticky, setSticky] = useState(false);

  // Track landing/scroll events and keep the mobile CTA clear of the hero and footer.
  useEffect(() => {
    track("us_referral_landing_view");

    let heroVisible = true;
    let finalVisible = false;
    let footerVisible = false;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.target.id === "top") heroVisible = e.isIntersecting;
          if (e.target.id === "final") finalVisible = e.isIntersecting;
          if (e.target.id === "site-footer") footerVisible = e.isIntersecting;
        });
        setSticky(!heroVisible && !finalVisible && !footerVisible);
      },
      { threshold: 0 }
    );
    ["top", "final", "site-footer"].forEach((id) => {
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
    return () => document.body.removeAttribute("data-selected-sku");
  }, [sku]);

  useEffect(() => {
    let frame;
    const syncHash = () => {
      const hash = location.hash.slice(1);
      if (hash === "d204" || hash === "d215") {
        setSku(hash);
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
        });
      } else if (history.state?.apgoSku === "d204" || history.state?.apgoSku === "d215") {
        setSku(history.state.apgoSku);
      } else if (!hash) setSku("d204");
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, []);

  const pick = useCallback((next) => {
    setSku(next);
    if (location.hash !== "#" + next) {
      // Preserve the selection of the entry being left, including non-product anchors.
      history.replaceState({ ...history.state, apgoSku: sku }, "");
      history.pushState({ ...history.state, apgoSku: next }, "", "#" + next);
    }
    track("fit_selector_answer", { sku: next });
  }, [sku]);

  const sel = products[sku];

  const showSticky = sticky && !menuOpen;

  return (
    <div style={{ minHeight: "100vh", background: color.bg }}>
      <div className="us-home-toc"><div className="us-shell"><OnThisPage items={homeSections} variant="home" /></div></div>

      <main id="main">
        <Hero />

        <BrandSection />
        <TechnologySection />
        <RoutineSection sku={sku} onPick={pick} />
        <FaqSection />
        <GuidesSection />
        <FinalSection />
      </main>

      {/* MOBILE STICKY CTA */}
      <div className="us-mobile-only" data-sticky-cta aria-hidden={!showSticky} inert={!showSticky}>
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
            visibility: showSticky ? "visible" : "hidden",
            pointerEvents: showSticky ? "auto" : "none",
            transform: showSticky ? "translateY(0)" : "translateY(110%)",
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
