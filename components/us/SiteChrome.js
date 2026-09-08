"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { asset, routes } from "@/lib/us/routes";
import { guideGroups, homeLink } from "@/lib/us/navigation";

const MenuContext = createContext(false);
export const useSiteMenuOpen = () => useContext(MenuContext);

function NavigationGroups({ pathname, onNavigate }) {
  return guideGroups.map((group) => (
    <div className="us-menu-group" key={group.label || "overview"}>
      {group.label && <p className="us-nav-label">{group.label}</p>}
      <ul aria-label={group.label || "Overview"}>
        {group.items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={onNavigate}>
              {item.label}<span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  ));
}

export default function SiteChrome({ children, footer }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const dropdown = useRef(null);
  const dropdownButton = useRef(null);
  const dialog = useRef(null);
  const menuButton = useRef(null);
  const inGuides = pathname === routes.guides || pathname.startsWith(`${routes.guides}/`);

  useEffect(() => {
    setMenuOpen(false);
    setGuidesOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 900px)");
    const resetMenus = () => { setMenuOpen(false); setGuidesOpen(false); };
    mobile.addEventListener("change", resetMenus);
    return () => mobile.removeEventListener("change", resetMenus);
  }, []);

  useEffect(() => {
    if (!guidesOpen) return;
    const onPointer = (event) => {
      if (!dropdown.current?.contains(event.target)) setGuidesOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setGuidesOpen(false);
        dropdownButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [guidesOpen]);

  useEffect(() => {
    const panel = dialog.current;
    if (!menuOpen) {
      if (panel.open) panel.close();
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (panel.open) panel.close();
      if (window.matchMedia("(max-width: 900px)").matches) menuButton.current?.focus({ preventScroll: true });
    };
  }, [menuOpen]);

  return (
    <MenuContext.Provider value={menuOpen}>
      <a href="#main" className="us-skip">Skip to content</a>
      <header className="us-site-header">
        <div className="us-shell us-header-inner">
          <Link href={routes.home} aria-label="APGO home" className="us-site-logo">
            <Image src={asset("brand/apgo-logo.png")} alt="APGO" width={140} height={32} priority />
          </Link>
          <nav aria-label="Site" className="us-header-desktop">
            <Link href={homeLink.href} aria-current={pathname === routes.home ? "page" : undefined}>{homeLink.label}</Link>
            <div className="us-guides-disclosure" ref={dropdown} onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setGuidesOpen(false);
            }}>
              <Link href={routes.guides} className={inGuides ? "is-active" : undefined} aria-current={pathname === routes.guides ? "page" : undefined}>Guides</Link>
              <button ref={dropdownButton} type="button" aria-label="Browse guides" aria-expanded={guidesOpen} aria-controls="us-guides-dropdown" onClick={() => setGuidesOpen((value) => !value)}>
                <span aria-hidden="true" className={guidesOpen ? "us-chevron is-open" : "us-chevron"}>⌄</span>
              </button>
              {guidesOpen && <div className="us-guides-dropdown" id="us-guides-dropdown">
                <NavigationGroups pathname={pathname} onNavigate={() => setGuidesOpen(false)} />
              </div>}
            </div>
            <Link href={routes.compare} className="us-site-cta">View products <span aria-hidden="true">→</span></Link>
          </nav>
          <nav aria-label="Mobile site" className="us-header-mobile">
            <Link href={routes.guides} className={inGuides ? "is-active" : undefined} aria-current={pathname === routes.guides ? "page" : undefined}>Guides</Link>
            <button ref={menuButton} type="button" aria-expanded={menuOpen} aria-controls="us-mobile-menu" onClick={() => setMenuOpen(true)}>Menu <span aria-hidden="true">☰</span></button>
          </nav>
        </div>
      </header>
      <dialog ref={dialog} id="us-mobile-menu" className="us-drawer" aria-labelledby="us-menu-title" onCancel={() => setMenuOpen(false)} onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll('a[href], button:not([disabled])')].filter((element) => element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }} onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setMenuOpen(false);
        }
      }}>
        <div className="us-drawer-top"><span id="us-menu-title">Explore APGO</span><button type="button" autoFocus onClick={() => setMenuOpen(false)} aria-label="Close menu">✕</button></div>
        <nav aria-label="All pages">
          <Link className="us-drawer-home" href={homeLink.href} aria-current={pathname === routes.home ? "page" : undefined} onClick={() => setMenuOpen(false)}>Home <span aria-hidden="true">→</span></Link>
          {menuOpen && <NavigationGroups pathname={pathname} onNavigate={() => setMenuOpen(false)} />}
          <Link className="us-site-cta" href={routes.compare} onClick={() => setMenuOpen(false)}>View products <span aria-hidden="true">→</span></Link>
        </nav>
      </dialog>
      {children}
      {footer}
    </MenuContext.Provider>
  );
}
