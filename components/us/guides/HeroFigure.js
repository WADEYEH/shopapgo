import { color } from "@/lib/us/tokens";
import { container } from "./styles";

// Full-width 16:9 hero figure pulled up under the article head.
export default function HeroFigure({ src, alt, caption }) {
  return (
    <div style={container}>
      <figure style={{ margin: "clamp(-16px,-2vw,-28px) 0 0", position: "relative" }}>
        <img src={src} alt={alt} style={{ display: "block", width: "100%", aspectRatio: "16/9", objectFit: "cover" }} />
        <figcaption style={{ fontSize: 12, color: color.quiet2, paddingTop: 8, letterSpacing: ".06em" }}>{caption}</figcaption>
      </figure>
    </div>
  );
}
