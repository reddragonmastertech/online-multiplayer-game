import { LiveMatchGrid, useLiveMatches } from "@/components/catalog/live-match-list";
import { SiteFooter } from "@/components/layout/site-footer";

export function WatchPage() {
  const matches = useLiveMatches();

  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-4xl font-bold">Watch</h1>
        <p className="mt-2 text-muted-foreground">
          Matches in progress. Spectators see the score and the round, never a hand before it is
          revealed.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Every match on this build is public. Private rooms are not available yet.
        </p>

        <div className="mt-8">
          <LiveMatchGrid matches={matches} emptyAction={{ to: "/games/rps", label: "Start Playing" }} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
