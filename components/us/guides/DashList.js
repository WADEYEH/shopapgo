import { color } from "@/lib/us/tokens";

// Hairline list with an accent "—" bullet. items: [{ color?, children }]
export default function DashList({ items }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", borderTop: `1px solid ${color.border}` }}>
      {items.map((it, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            gap: 14,
            padding: "12px 0",
            borderBottom: `1px solid ${color.border}`,
            fontSize: 16,
            lineHeight: 1.45,
          }}
        >
          <span style={{ color: it.color || color.orange, fontWeight: 700, flex: "none" }}>—</span>
          {it.children}
        </li>
      ))}
    </ul>
  );
}
