import Link from "next/link";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED, products } from "@/lib/us/tokens";

// Product card inside an article: 110px packshot, accent top border, "View product details" CTA.
// `alt` and `meta` are passed explicitly so the FTC-reviewed copy stays exactly as designed.
export default function ProductAside({ sku, alt, meta }) {
  const p = products[sku];
  return (
    <aside
      aria-label="Product"
      style={{
        border: `1px solid ${color.border}`,
        borderTop: `4px solid ${p.accent}`,
        background: color.raised,
        padding: 20,
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 18,
        alignItems: "center",
      }}
    >
      <img src={asset(`products/${sku}-packshot.png`)} alt={alt} style={{ width: 110, height: 110, objectFit: "contain" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 30, lineHeight: 1, color: p.accent }}>{p.word}</span>
          <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 18, textTransform: "uppercase" }}>{p.name}</span>
        </div>
        <span style={{ fontSize: 13, color: color.tertiary }}>{meta}</span>
        <Link
          href={routes.compare}
          className="us-btn"
          style={{
            alignSelf: "flex-start",
            background: color.orange,
            color: color.bg,
            height: 44,
            padding: "0 18px",
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
          View product details <span aria-hidden="true">→</span>
        </Link>
      </div>
    </aside>
  );
}
