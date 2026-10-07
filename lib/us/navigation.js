import { routes } from "./routes";

export const homeLink = { href: routes.home, label: "Home" };
export const guideGroups = [
  { label: null, items: [{ href: routes.guides, label: "All guides" }] },
  { label: "Compare & choose", items: [
    { href: routes.paintProtectionTypes, label: "Types of paint protection" },
    { href: routes.whatIsSprayCeramic, label: "What is spray ceramic?" },
    { href: routes.whatIsCarGlaze, label: "What is car glaze?" },
    { href: routes.sprayVsCoating, label: "Ceramic spray vs coating" },
    { href: routes.coatingScratches, label: "Scratches & coating" },
    { href: routes.waxVsSprayCoating, label: "Wax vs spray coating" },
    { href: routes.isSprayWorthIt, label: "Is ceramic spray worth it?" },
    { href: routes.diyVsPro, label: "DIY ceramic coating vs professional" },
    { href: routes.chooseCoatingSpray, label: "Choose a coating spray" },
  ] },
  { label: "Prep & application", items: [
    { href: routes.prepForSpray, label: "Prep for ceramic spray" },
    { href: routes.clayBarFirst, label: "Clay bar before coating" },
    { href: routes.detailingSteps, label: "Exterior detailing steps" },
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
    { href: routes.winterWash, label: "Winter washing" },
  ] },
  { label: "By paint, vehicle & surface", items: [
    { href: routes.windshieldCoating, label: "Windshield & glass" },
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
