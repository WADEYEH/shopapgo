import PolicyPage, { loadPolicy } from "@/components/shop/PolicyPage";

// /terms: docs/legal/terms-of-sale.md, a draft until counsel approves it (M11). Not indexed until launch.
const policy = loadPolicy("terms-of-sale.md");

export const metadata = {
  title: { absolute: `${policy.title} · APGO` },
  alternates: { canonical: "/terms" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PolicyPage policy={policy} />;
}
