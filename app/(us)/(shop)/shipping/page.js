import PolicyPage, { loadPolicy } from "@/components/shop/PolicyPage";

// /shipping: docs/legal/shipping-policy.md, a draft until counsel approves it (M11). Not indexed until launch.
const policy = loadPolicy("shipping-policy.md");

export const metadata = {
  title: { absolute: `${policy.title} · APGO` },
  alternates: { canonical: "/shipping" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PolicyPage policy={policy} />;
}
