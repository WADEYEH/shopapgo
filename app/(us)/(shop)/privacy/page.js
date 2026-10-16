import PolicyPage, { loadPolicy } from "@/components/shop/PolicyPage";

// /privacy: docs/legal/privacy-policy.md (M11; in effect since the cutover on 2026-10-16, D69). Indexable.
const policy = loadPolicy("privacy-policy.md");

export const metadata = {
  title: { absolute: `${policy.title} · APGO` },
  description: "How APGO collects, uses and protects your information when you shop at shopapgo.com, and the choices you have.",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <PolicyPage policy={policy} />;
}
