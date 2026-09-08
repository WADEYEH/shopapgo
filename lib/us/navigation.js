import { routes } from "./routes";

export const homeLink = { href: routes.home, label: "Home" };
export const guideGroups = [
  { label: null, items: [{ href: routes.guides, label: "All guides" }] },
  { label: "Basics & choosing", items: [
    { href: routes.afterWashing, label: "After washing your car" },
    { href: routes.wetOrDry, label: "Compare dry & wet" },
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
