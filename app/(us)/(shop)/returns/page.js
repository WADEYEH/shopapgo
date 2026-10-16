import PolicyPage, { loadPolicy } from "@/components/shop/PolicyPage";

// /returns: docs/legal/returns-and-refunds.md (M11; in effect since the cutover on 2026-10-16, D69). Indexable.
const policy = loadPolicy("returns-and-refunds.md");

export const metadata = {
  title: { absolute: `${policy.title} · APGO` },
  description: "Return unopened APGO products within 30 days of delivery. How to start a return, how refunds work, and what we do about damaged or wrong items.",
  alternates: { canonical: "/returns" },
};

export default function Page() {
  return <PolicyPage policy={policy} />;
}
