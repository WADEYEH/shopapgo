import Link from "next/link";
import { routes, asset } from "@/lib/us/routes";
import { color } from "@/lib/us/tokens";

// Shared header for the guides hub and the four guide articles (h64 variant).
export default function GuideHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: 64,
        background: "rgba(8,10,12,.92)",
        backdropFilter: "blur(14px)",
        borderBottom: `1px solid ${color.hairline}`,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          height: "100%",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Link href={routes.home} aria-label="APGO home" style={{ display: "flex" }}>
          <img src={asset("brand/apgo-logo.png")} alt="APGO" style={{ height: 24, display: "block" }} />
        </Link>
        <nav
          aria-label="Site"
          style={{
            display: "flex",
            gap: "clamp(16px,3vw,32px)",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: ".12em",
            textTransform: "uppercase",
          }}
        >
          <Link href={routes.guides} style={{ color: color.text, textDecoration: "none", whiteSpace: "nowrap" }}>
            Guides
          </Link>
          <Link href={routes.compare} className="us-nav-link" style={{ color: color.tertiary, textDecoration: "none", whiteSpace: "nowrap" }}>
            Dry or Wet
          </Link>
        </nav>
        <Link
          href={routes.final}
          className="us-btn-sm"
          style={{
            background: color.orange,
            color: color.bg,
            height: 40,
            padding: "0 16px",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          View products <span aria-hidden="true">→</span>
        </Link>
      </div>
    </header>
  );
}
