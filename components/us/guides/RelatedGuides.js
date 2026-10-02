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
    img: asset("generated/auto-wash-hero-title.png"),
    label: "Wash",
    labelColor: color.orange,
    title: "Does an Automatic Car Wash Remove Ceramic Coating?",
  },
  rainDamageCoating: {
    href: routes.rainDamageCoating,
    img: asset("generated/rain-salt-hero.png"),
    label: "Weather",
    labelColor: color.orange,
    title: "Does Rain Damage Ceramic Coating?",
  },
  diyVsPro: {
    href: routes.diyVsPro,
    img: asset("generated/diy-vs-pro-hero-title.png"),
    label: "Compare",
    labelColor: color.orange,
    title: "DIY Ceramic Coating vs Professional",
  },
  // Batch 1 + early batch 2 guides. Image, label (first segment of the index-card label) and title come from the guides index cards.
  paintProtectionTypes: {
    href: routes.paintProtectionTypes,
    img: asset("generated/types-of-car-paint-protection-hero.png"),
    label: "Compare",
    labelColor: color.tertiary,
    title: "Types of Car Paint Protection: Wax, Sealant, Spray Glaze, Ceramic & PPF",
  },
  whatIsSprayCeramic: {
    href: routes.whatIsSprayCeramic,
    img: asset("generated/what-is-spray-ceramic-coating-hero.png"),
    label: "Basics",
    labelColor: color.tertiary,
    title: "What Is Spray Ceramic Coating? How It Works and What It Won't Do",
  },
  whatIsCarGlaze: {
    href: routes.whatIsCarGlaze,
    img: asset("generated/what-is-car-glaze-hero.png"),
    label: "Basics",
    labelColor: color.tertiary,
    title: "What Is Car Glaze? Glaze vs Wax vs Sealant, Explained",
  },
  sprayVsCoating: {
    href: routes.sprayVsCoating,
    img: asset("generated/ceramic-spray-vs-ceramic-coating-hero.png"),
    label: "Compare",
    labelColor: color.tertiary,
    title: "Ceramic Spray vs Ceramic Coating: What's Actually Different?",
  },
  coatingScratches: {
    href: routes.coatingScratches,
    img: asset("generated/does-ceramic-coating-prevent-scratches-hero.png"),
    label: "Basics",
    labelColor: color.tertiary,
    title: "Does Ceramic Coating Prevent Scratches? What a Coating Can and Can't Do",
  },
  prepForSpray: {
    href: routes.prepForSpray,
    img: asset("generated/how-to-prep-car-for-ceramic-spray-hero.png"),
    label: "Prep",
    labelColor: color.orange,
    title: "How to Prep Your Car for Ceramic Spray (Wash, Decon, Dry)",
  },
  removeWaxFirst: {
    href: routes.removeWaxFirst,
    img: asset("generated/how-to-remove-wax-before-ceramic-coating-hero.png"),
    label: "Prep",
    labelColor: color.orange,
    title: "How to Remove Wax Before Ceramic Coating",
  },
  waitToWash: {
    href: routes.waitToWash,
    img: asset("generated/how-long-to-wait-to-wash-after-ceramic-spray-hero.png"),
    label: "Timing",
    labelColor: color.orange,
    title: "How Long After Ceramic Coating to Wash Your Car: Waiting Out a Fresh Spray",
  },
  coatingMaintenance: {
    href: routes.coatingMaintenance,
    img: asset("generated/ceramic-coating-maintenance-hero.png"),
    label: "Care",
    labelColor: color.dry,
    title: "Ceramic Coating Maintenance: A Simple Routine That Keeps Spray Coatings Working",
  },
  washCoatedCar: {
    href: routes.washCoatedCar,
    img: asset("generated/how-to-wash-a-ceramic-coated-car-hero.png"),
    label: "Wash",
    labelColor: color.dry,
    title: "How to Wash a Ceramic Coated Car at Home",
  },
  winterWash: {
    href: routes.winterWash,
    img: asset("generated/how-to-wash-your-car-in-winter-hero.png"),
    label: "Weather",
    labelColor: color.wet,
    title: "How to Wash Your Car in Winter (Cold, Salt & Freezing Temps)",
  },
  streaksHighSpots: {
    href: routes.streaksHighSpots,
    img: asset("generated/ceramic-spray-streaks-high-spots-hero.png"),
    label: "Fix",
    labelColor: color.orange,
    title: "Ceramic Coating Streaks, Haze or High Spots? How to Fix Them",
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
