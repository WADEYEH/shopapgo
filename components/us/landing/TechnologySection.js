import { asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";
import Eyebrow from "./Eyebrow";

const mask = "linear-gradient(180deg,transparent 0%,#000 14%,#000 92%,transparent 100%)";

export default function TechnologySection() {
  return (
    <section id="technology" style={{ position: "relative", background: color.bg, borderTop: `1px solid ${color.hairline}`, overflow: "hidden" }}>
      <div
        style={{
          position: "relative",
          maxWidth: 1312,
          margin: "0 auto",
          padding: "clamp(48px,6vw,88px) clamp(20px,4.4vw,64px) 0",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <Eyebrow>Atomic technology · In-house R&amp;D</Eyebrow>
        <h2
          style={{
            margin: 0,
            fontFamily: CONDENSED,
            fontWeight: 800,
            fontSize: "clamp(56px,8vw,128px)",
            lineHeight: 0.84,
            textTransform: "uppercase",
            textWrap: "balance",
            maxWidth: 900,
            position: "relative",
            zIndex: 2,
          }}
        >
          Four layers. One spray.
        </h2>
      </div>
      <div style={{ position: "relative", maxWidth: 1440, margin: "clamp(-40px,-4vw,-72px) auto 0" }}>
        <img
          src={asset("generated/atomic-layers-labeled.png")}
          alt="Exploded illustration of the Atomic finish: 04 Surface layer helps water and dirt release from the paint; 03 Glaze layer gives depth and a mirror-like look; 02 Protective layer is a dense film that shields the finish; 01 Bonding layer anchors directly to the paint surface"
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "16/10",
            objectFit: "contain",
            objectPosition: "50% 50%",
            WebkitMaskImage: mask,
            maskImage: mask,
          }}
        />
      </div>
    </section>
  );
}
