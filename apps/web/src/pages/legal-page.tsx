import { useParams } from "react-router-dom";
import { SiteFooter } from "@/components/layout/site-footer";

const docs: Record<string, { title: string; body: string }> = {
  terms: {
    title: "Terms",
    body: "Full terms will be published before a public launch. This test build is for gameplay only.",
  },
  privacy: {
    title: "Privacy",
    body: "A privacy policy will ship with accounts. Do not submit real personal data you are not willing to test with.",
  },
  eligibility: {
    title: "Eligibility",
    body: "Paid or crypto-staked play is not offered here. Eligibility checks will be required before those modes exist.",
  },
  "responsible-play": {
    title: "Responsible play",
    body: "This build is free practice. When paid play exists, limits and help links will live in account settings.",
  },
};

export function LegalPage() {
  const { doc = "terms" } = useParams();
  const page = docs[doc] ?? docs.terms;

  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-[Rajdhani,Inter,sans-serif] text-4xl font-bold">{page?.title}</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{page?.body}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
