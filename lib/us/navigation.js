import { routes } from "./routes";

export const homeLink = { href: routes.home, label: "Home" };
export const guideGroups = [
  { label: null, items: [{ href: routes.guides, label: "All guides" }] },
  { label: "Compare & choose", items: [
    { href: routes.waxVsSprayCoating, label: "Wax vs spray coating" },
    { href: routes.diyVsPro, label: "DIY ceramic coating vs professional" },
  ] },
  { label: "Prep & application", items: [
    { href: routes.wetOrDry, label: "Compare dry & wet" },
    { href: routes.coatingOverWax, label: "Coating over wax?" },
    { href: routes.coloredGlaze, label: "Colored Glaze · DRY" },
    { href: routes.glazeCoating, label: "Glaze Coating · WET" },
  ] },
  { label: "Wash & care", items: [
    { href: routes.afterWashing, label: "After washing your car" },
    { href: routes.autoWashCoating, label: "Auto wash & coating" },
  ] },
  { label: "Durability & weather", items: [
    { href: routes.howOftenReapply, label: "How often to reapply" },
    { href: routes.rainDamageCoating, label: "Rain & coating" },
  ] },
];
export const homeSections = [
  { href: "#brand", label: "Our Story" },
  { href: "#technology", label: "Technology" },
  { href: "#compare", label: "Products" },
  { href: "#faq", label: "FAQ" },
];
