import { SiteFooter } from "@/components/layout/site-footer";

export function SupportPage() {
  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="font-[Rajdhani,Inter,sans-serif] text-4xl font-bold">Support</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          This build does not have a ticket system yet. For product issues during testing, contact the
          person who shared the site with you. Do not send passwords or wallet keys.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
