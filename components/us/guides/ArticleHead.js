import Link from "next/link";
import { routes } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import OnThisPage from "./OnThisPage";

// Article head: breadcrumb, DRY/WET/BASICS tag row, H1, lede, author + read-time row.
// `tag` is the big Condensed word (string or nodes for the "DRY / WET" compound);
// `tagColor` colors it when the tag is a single word.
export default function ArticleHead({ gradient, crumb, tag, tagColor, tagLabel, title, lede, readTime, toc }) {
  return (
    <section style={{ background: gradient, borderBottom: `1px solid ${color.hairline}` }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "clamp(28px,4vw,56px) 20px clamp(32px,4vw,56px)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <nav
          aria-label="Breadcrumb"
          style={{
            display: "flex",
            gap: 8,
            fontSize: 12,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: color.quiet2,
            flexWrap: "wrap",
          }}
        >
          <Link href={routes.home} className="us-nav-link" style={{ color: color.tertiary, textDecoration: "none" }}>Home</Link>
          <span aria-hidden="true">›</span>
          <Link href={routes.guides} className="us-nav-link" style={{ color: color.tertiary, textDecoration: "none" }}>
            Guides
          </Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{crumb}</span>
        </nav>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: CONDENSED,
              fontWeight: 800,
              fontSize: 32,
              lineHeight: 1,
              color: tagColor,
              letterSpacing: ".04em",
            }}
          >
            {tag}
          </span>
          <span style={{ fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: color.tertiary }}>
            {tagLabel}
          </span>
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: CONDENSED,
            fontWeight: 800,
            fontSize: "clamp(44px,7vw,88px)",
            lineHeight: 0.88,
            textTransform: "uppercase",
            textWrap: "balance",
            maxWidth: 900,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "clamp(17px,1.5vw,21px)",
            lineHeight: 1.5,
            color: color.secondary,
            maxWidth: 680,
            textWrap: "pretty",
          }}
        >
          {lede}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingTop: 4 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: color.orange,
              color: color.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: CONDENSED,
              fontWeight: 800,
              fontSize: 20,
            }}
            aria-hidden="true"
          >
            WY
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Wade Yeh</span>
            <span style={{ fontSize: 13, color: color.tertiary }}>Founder, APGO · Taipei</span>
          </div>
          <span style={{ color: color.mutedLine }} aria-hidden="true">
            |
          </span>
          <span style={{ fontSize: 13, color: color.tertiary }}>Updated Sep 2026 · {readTime}</span>
        </div>
        {toc && <div className="us-article-top-toc"><OnThisPage items={toc} /></div>}
      </div>
    </section>
  );
}
