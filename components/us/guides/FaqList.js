import { color } from "@/lib/us/tokens";

// <details> FAQ rows. items: [{ q, a }] — the last row also gets a bottom hairline.
// The same array feeds the FAQPage JSON-LD so copy stays in one place.
export default function FaqList({ items }) {
  return items.map((it, i) => (
    <details
      key={it.q}
      style={{
        borderTop: `1px solid ${color.border}`,
        ...(i === items.length - 1 ? { borderBottom: `1px solid ${color.border}` } : null),
      }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          minHeight: 56,
          alignItems: "center",
          fontWeight: 600,
          fontSize: 16,
        }}
      >
        {it.q}
        <span className="faq-chev" style={{ color: color.orange, fontSize: 24, transition: "transform .18s" }} aria-hidden="true">
          +
        </span>
      </summary>
      <p style={{ margin: 0, padding: "0 0 16px", fontSize: 15, lineHeight: 1.55, color: color.tertiary }}>{it.a}</p>
    </details>
  ));
}
