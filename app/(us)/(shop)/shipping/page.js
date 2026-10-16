import PolicyPage, { loadPolicy } from "@/components/shop/PolicyPage";

// /shipping: docs/legal/shipping-policy.md (M11; in effect since the cutover on 2026-10-16, D69). Indexable.
const policy = loadPolicy("shipping-policy.md");

export const metadata = {
  title: { absolute: `${policy.title} · APGO` },
  description: "APGO ships to the 48 contiguous United States and DC for $7.99 per order with standard shipping; most orders arrive in 3–5 business days.",
  alternates: { canonical: "/shipping" },
};

export default function Page() {
  return <PolicyPage policy={policy} />;
}
