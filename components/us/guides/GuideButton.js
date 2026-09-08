import { color } from "@/lib/us/tokens";

// Secondary (outlined) button used inside guide cards. Rendered as a <span> because the
// whole card is already the link; the outline style distinguishes it from the filled
// orange primary buttons reserved for Amazon / product CTAs.
export default function GuideButton({ children }) {
  return (
    <span
      className="us-btn-outline"
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minHeight: 40,
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: "10px 18px",
        border: `1px solid ${color.orange}`,
        borderRadius: 6,
        color: color.orange,
        fontSize: 14,
        fontWeight: 700,
        whiteSpace: "normal",
        lineHeight: 1.4,
        transition: "background .18s, color .18s, transform .18s",
      }}
    >
      {children}
    </span>
  );
}
