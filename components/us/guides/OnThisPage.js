import { color } from "@/lib/us/tokens";

// "On this page" in-page table of contents. items: [{ href: "#id", label }]
export default function OnThisPage({ items }) {
  return (
    <nav
      aria-label="On this page"
      style={{ border: `1px solid ${color.border}`, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <span style={{ fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: color.orange, fontWeight: 700 }}>
        On this page
      </span>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
        {items.map((it) => (
          <li key={it.href}>
            <a href={it.href} style={{ color: color.text, textDecoration: "none" }}>
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
