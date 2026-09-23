import Link from "next/link";
import { routes, asset } from "@/lib/us/routes";
import { color, CONDENSED } from "@/lib/us/tokens";

// Card data for the "Keep reading" grid. Labels, images and titles are identical on every page.
export const CARDS = {
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
  waxVsSprayCoating: {
    href: routes.waxVsSprayCoating,
    img: asset("generated/car-wax-vs-spray-hero.png"),
    label: "Compare",
    labelColor: color.orange,
    title: "Car Wax vs Spray Ceramic Coating",
  },
  coatingOverWax: {
    href: routes.coatingOverWax,
    img: asset("generated/coating-over-wax-hero.png"),
    label: "Check",
    labelColor: color.orange,
    title: "Can I apply ceramic coating over wax?",
  },
  howOftenReapply: {
    href: routes.howOftenReapply,
    img: asset("generated/how-often-reapply-hero.png"),
    label: "Cadence",
    labelColor: color.orange,
    title: "How Often to Apply Ceramic Spray Coating",
  },
  autoWashCoating: {
    href: routes.autoWashCoating,
    img: asset("generated/auto-wash-vs-hand-wash.png"),
    label: "Wash",
    labelColor: color.orange,
    title: "Does an Automatic Car Wash Remove Ceramic Coating?",
  },
  rainDamageCoating: {
    href: routes.rainDamageCoating,
    img: asset("generated/rain-vs-salt-spots.png"),
    label: "Weather",
    labelColor: color.orange,
    title: "Does Rain Damage Ceramic Coating?",
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
        <Link href={routes.guides} className="us-text-link">All guides <span aria-hidden="true">→</span></Link>
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
