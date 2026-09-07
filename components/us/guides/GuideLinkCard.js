import Link from "next/link";
import { color, CONDENSED } from "@/lib/us/tokens";

// Bordered inline link to another guide, with a 4px accent left border.
// `word` (optional) renders the DRY/WET marker before the text.
export default function GuideLinkCard({ href, accent, word, title, meta }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: `1px solid ${color.border}`,
        borderLeft: `4px solid ${accent}`,
        padding: "14px 18px",
        textDecoration: "none",
        color: color.text,
      }}
    >
      {word ? (
        <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 26, color: accent, lineHeight: 1 }}>{word}</span>
      ) : null}
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
        <span style={{ fontSize: 13, color: color.tertiary }}>{meta}</span>
      </span>
      <span style={{ marginLeft: "auto", color: color.orange }} aria-hidden="true">
        →
      </span>
    </Link>
  );
}
