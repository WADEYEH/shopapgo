import PolicyPage, { loadPolicy } from "@/components/shop/PolicyPage";

// /privacy: docs/legal/privacy-policy.md, a draft until counsel approves it (M11). Not indexed until launch.
const policy = loadPolicy("privacy-policy.md");

export const metadata = {
  title: { absolute: `${policy.title} · APGO` },
  alternates: { canonical: "/privacy" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PolicyPage policy={policy} />;
}
