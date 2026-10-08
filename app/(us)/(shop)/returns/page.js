import PolicyPage, { loadPolicy } from "@/components/shop/PolicyPage";

// /returns: docs/legal/returns-and-refunds.md, a draft until counsel approves it (M11). Not indexed until launch.
const policy = loadPolicy("returns-and-refunds.md");

export const metadata = {
  title: { absolute: `${policy.title} · APGO` },
  alternates: { canonical: "/returns" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PolicyPage policy={policy} />;
}
