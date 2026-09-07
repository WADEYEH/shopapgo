import Link from "next/link";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";

// Card data for the "Keep reading" grid. Labels, images and titles are identical on every page.
const CARDS = {
  coloredGlaze: {
    href: routes.coloredGlaze,
    img: asset("application/d204-step-1.webp"),
    label: "Dry · How to",
    labelColor: color.dry,
    title: "How to apply APGO Atomic Colored Glaze",
  },
  glazeCoating: {
    href: routes.glazeCoating,
    img: asset("application/d215-step-3.webp"),
    label: "Wet · How to",
    labelColor: color.wet,
    title: "How to apply APGO Atomic Glaze Coating",
  },
  wetOrDry: {
    href: routes.wetOrDry,
    img: asset("generated/atomic-layers.png"),
    label: "Compare",
    labelColor: color.orange,
    title: "APGO paint protection: wet or dry application?",
  },
  afterWashing: {
    href: routes.afterWashing,
    img: asset("application/d215-step-1.webp"),
    label: "Basics",
    labelColor: color.tertiary,
    title: "What to do after washing your car",
  },
};

// items: array of CARDS keys, in display order.
export default function RelatedGuides({ items }) {
  return (
    <section style={{ background: color.bg, borderTop: `1px solid ${color.hairline}` }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "clamp(40px,5vw,72px) 20px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ color: color.orange, fontSize: 13, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase" }}>
          Keep reading
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16 }}>
          {items.map((key) => {
            const c = CARDS[key];
            return (
              <Link
                key={key}
                href={c.href}
                style={{ display: "flex", flexDirection: "column", gap: 10, textDecoration: "none", color: color.text }}
              >
                <img src={c.img} alt="" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }} />
                <span style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: c.labelColor, fontWeight: 700 }}>
                  {c.label}
                </span>
                <span style={{ fontFamily: CONDENSED, fontWeight: 700, fontSize: 24, lineHeight: 1, textTransform: "uppercase" }}>
                  {c.title}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
