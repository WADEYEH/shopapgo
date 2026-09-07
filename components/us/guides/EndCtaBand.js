import Link from "next/link";
import { asset } from "@/lib/us/routes";
import { color, CONDENSED, products } from "@/lib/us/tokens";

// Orange-topped closing band with two product rows.
// items: [{ sku, title, body (nodes between the title and the CTA), href, cta }]
export default function EndCtaBand({ heading, items, note }) {
  return (
    <section style={{ background: color.raised, borderTop: `4px solid ${color.orange}` }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "clamp(40px,5vw,72px) 20px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: CONDENSED,
            fontWeight: 800,
            fontSize: "clamp(36px,5vw,64px)",
            lineHeight: 0.9,
            textTransform: "uppercase",
            textWrap: "balance",
          }}
        >
          {heading}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))",
            gap: 2,
            background: color.hairline,
            border: `1px solid ${color.hairline}`,
          }}
        >
          {items.map((it) => {
            const p = products[it.sku];
            return (
              <div
                key={it.sku}
                style={{
                  background: color.bg,
                  padding: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  borderTop: `4px solid ${p.accent}`,
                }}
              >
                <img src={asset(`products/${it.sku}-packshot.png`)} alt="" style={{ width: 80, height: 80, objectFit: "contain" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
                  <span style={{ fontFamily: CONDENSED, fontWeight: 800, fontSize: 28, lineHeight: 1, color: p.accent }}>{it.title}</span>
                  {it.body}
                  <Link
                    href={it.href}
                    className="us-btn"
                    style={{
                      alignSelf: "flex-start",
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
                    }}
                  >
                    {it.cta}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
        {note ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: color.tertiary }}>{note}</p> : null}
      </div>
    </section>
  );
}
