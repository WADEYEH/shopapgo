import { color } from "@/lib/us/tokens";

// Left-accent callout box.
export default function Callout({ accent, children }) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${accent}`,
        padding: "14px 18px",
        background: color.raised,
        fontSize: 15,
        lineHeight: 1.5,
        color: color.secondary,
      }}
    >
      {children}
    </div>
  );
}
