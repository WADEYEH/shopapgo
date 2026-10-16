import PolicyPage, { loadPolicy } from "@/components/shop/PolicyPage";

// /terms: docs/legal/terms-of-sale.md (M11; in effect since the cutover on 2026-10-16, D69). Indexable.
const policy = loadPolicy("terms-of-sale.md");

export const metadata = {
  title: { absolute: `${policy.title} · APGO` },
  description: "The terms that apply when you buy APGO products at shopapgo.com: orders, prices, payment, shipping and liability.",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <PolicyPage policy={policy} />;
}
