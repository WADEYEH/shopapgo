import { routes } from "./routes";

export const homeLink = { href: routes.home, label: "Home" };
export const guideGroups = [
  { label: null, items: [{ href: routes.guides, label: "All guides" }] },
  { label: "Compare & choose", items: [
    { href: routes.paintProtectionTypes, label: "Types of paint protection" },
    { href: routes.whatIsSprayCeramic, label: "What is spray ceramic?" },
    { href: routes.whatIsCarGlaze, label: "What is car glaze?" },
    { href: routes.sprayVsCoating, label: "Ceramic spray vs coating" },
    { href: routes.waxVsSprayCoating, label: "Wax vs spray coating" },
    { href: routes.diyVsPro, label: "DIY ceramic coating vs professional" },
  ] },
  { label: "Prep & application", items: [
    { href: routes.prepForSpray, label: "Prep for ceramic spray" },
    { href: routes.wetOrDry, label: "Compare dry & wet" },
    { href: routes.coatingOverWax, label: "Coating over wax?" },
    { href: routes.removeWaxFirst, label: "Remove wax first" },
    { href: routes.waitToWash, label: "When to wash after spraying" },
    { href: routes.coloredGlaze, label: "Colored Glaze · DRY" },
    { href: routes.glazeCoating, label: "Glaze Coating · WET" },
  ] },
  { label: "Wash & care", items: [
    { href: routes.coatingMaintenance, label: "Coating maintenance" },
    { href: routes.washCoatedCar, label: "Wash a coated car" },
    { href: routes.afterWashing, label: "After washing your car" },
    { href: routes.autoWashCoating, label: "Auto wash & coating" },
  ] },
  { label: "Durability & weather", items: [
    { href: routes.howOftenReapply, label: "How often to reapply" },
    { href: routes.rainDamageCoating, label: "Rain & coating" },
  ] },
  { label: "Troubleshooting", items: [
    { href: routes.streaksHighSpots, label: "Streaks & high spots" },
  ] },
];
export const homeSections = [
  { href: "#brand", label: "Our Story" },
  { href: "#technology", label: "Technology" },
  { href: "#compare", label: "Products" },
  { href: "#faq", label: "FAQ" },
];
