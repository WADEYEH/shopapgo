import { routes } from "./routes";

export const homeLink = { href: routes.home, label: "Home" };
export const guideGroups = [
  { label: null, items: [{ href: routes.guides, label: "All guides" }] },
  { label: "Basics & choosing", items: [
    { href: routes.afterWashing, label: "After washing your car" },
    { href: routes.wetOrDry, label: "Compare dry & wet" },
    { href: routes.waxVsSprayCoating, label: "Wax vs spray coating" },
    { href: routes.coatingOverWax, label: "Coating over wax?" },
  ] },
  { label: "Care & coating Q&A", items: [
    { href: routes.howOftenReapply, label: "How often to reapply" },
    { href: routes.autoWashCoating, label: "Auto wash & coating" },
    { href: routes.rainDamageCoating, label: "Rain & coating" },
  ] },
  { label: "Application guides", items: [
    { href: routes.coloredGlaze, label: "Colored Glaze · DRY" },
    { href: routes.glazeCoating, label: "Glaze Coating · WET" },
  ] },
];
export const homeSections = [
  { href: "#brand", label: "Our Story" },
  { href: "#technology", label: "Technology" },
  { href: "#compare", label: "Products" },
  { href: "#faq", label: "FAQ" },
];
