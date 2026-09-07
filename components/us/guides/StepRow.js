import { color } from "@/lib/us/tokens";
import { stepTitle } from "./styles";

// One application step: 4:3 image (or custom `media` node) beside a big accent title and text.
export default function StepRow({ accent, title, src, alt, media, children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))",
        gap: 18,
        alignItems: "center",
      }}
    >
      {media || <img src={src} alt={alt} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={stepTitle(accent)}>{title}</span>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: color.secondary }}>{children}</p>
      </div>
    </div>
  );
}
