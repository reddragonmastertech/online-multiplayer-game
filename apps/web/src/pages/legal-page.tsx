import { useParams } from "react-router-dom";
import { SiteFooter } from "@/components/layout/site-footer";

const docs: Record<string, { title: string; body: string }> = {
  terms: {
    title: "Terms",
    body: "Full terms will be published before a public launch. This test build is for gameplay only.",
  },
  privacy: {
    title: "Privacy",
    body: "We keep your email, display name, balances, matches, deposit and withdrawal records, and the wallet addresses you save. Each time you sign up or log in we record your IP address and browser, so admins can spot one person running several accounts and keep paid play fair. Admins see this only to run and protect the site. Match chat is not stored.",
  },
  eligibility: {
    title: "Eligibility",
    body: "RAC play is free and open to everyone. USDT rooms are played for real money; only play them where that is allowed for you.",
  },
  "responsible-play": {
    title: "Responsible play",
    body: "RAC rooms are free practice. In USDT rooms, only stake what you can afford to lose. Limits and help links will live in account settings.",
  },
};

export function LegalPage() {
  const { doc = "terms" } = useParams();
  const page = docs[doc] ?? docs.terms;

  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-4xl font-bold">{page?.title}</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{page?.body}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
