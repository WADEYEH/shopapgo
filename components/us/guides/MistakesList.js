import { color } from "@/lib/us/tokens";

// "Common mistakes" definition list. items: [{ term, desc }]
export default function MistakesList({ items }) {
  return (
    <dl style={{ margin: 0, display: "flex", flexDirection: "column", borderTop: `1px solid ${color.border}` }}>
      {items.map((it) => (
        <div key={it.term} style={{ padding: "14px 0", borderBottom: `1px solid ${color.border}` }}>
          <dt style={{ fontWeight: 600, fontSize: 16 }}>{it.term}</dt>
          <dd style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 1.5, color: color.tertiary }}>{it.desc}</dd>
        </div>
      ))}
    </dl>
  );
}
