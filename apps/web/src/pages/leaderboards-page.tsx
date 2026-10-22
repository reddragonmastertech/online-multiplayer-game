import { SiteFooter } from "@/components/layout/site-footer";

export function LeaderboardsPage() {
  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-[Rajdhani,Inter,sans-serif] text-4xl font-bold">Leaderboards</h1>
        <p className="mt-2 text-muted-foreground">Rankings will appear here when a season is running.</p>
        <div className="mt-8 rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Seasonal competition is currently paused.</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
