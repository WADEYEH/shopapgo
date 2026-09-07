import { color } from "@/lib/us/tokens";

// Orange eyebrow label with the 28×2 bar used above section headings.
export default function Eyebrow({ children, bar = true }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: color.orange,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: ".18em",
        textTransform: "uppercase",
      }}
    >
      {bar && <span style={{ width: 28, height: 2, background: color.orange }} />}
      {children}
    </div>
  );
}
