import type { LiveMatchSummary } from "@game-platform/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { liveMatchesRequest } from "@/lib/api";

const POLL_MS = 5000;

/**
 * Live matches, polled from the API. There is no fabricated activity here: an
 * empty list renders an empty state rather than placeholder cards.
 */
export function useLiveMatches() {
  const [matches, setMatches] = useState<LiveMatchSummary[] | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await liveMatchesRequest();
        if (alive) setMatches(response.matches);
      } catch {
        if (alive) setMatches([]);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return matches;
}

export function LiveMatchCard({ match }: { match: LiveMatchSummary }) {
  const [a, b] = match.players;

  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
          ROCK PAPER SCISSORS
        </p>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          LIVE
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{a.name}</p>
        <p className="font-display text-xl font-bold text-gold">
          {a.score}–{b.score}
        </p>
        <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold">{b.name}</p>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Round {match.round} · first to {match.firstTo} · pot {match.pot} RAC
      </p>

      <Button className="mt-4 w-full" variant="secondary" asChild>
        <Link to={`/matches/${match.matchId}`}>Watch</Link>
      </Button>
    </article>
  );
}

export function LiveMatchGrid({
  matches,
  emptyAction,
}: {
  matches: LiveMatchSummary[] | null;
  emptyAction?: { to: string; label: string };
}) {
  if (matches === null) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">Loading live matches…</p>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">No public matches are live right now.</p>
        {emptyAction ? (
          <Button className="mt-4" asChild>
            <Link to={emptyAction.to}>{emptyAction.label}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {matches.map((match) => (
        <LiveMatchCard key={match.matchId} match={match} />
      ))}
    </div>
  );
}
