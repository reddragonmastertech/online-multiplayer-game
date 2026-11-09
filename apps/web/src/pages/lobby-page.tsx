import { Link } from "react-router-dom";
import { GameCard } from "@/components/catalog/game-card";
import { LiveMatchGrid, useLiveMatches } from "@/components/catalog/live-match-list";
import { SiteFooter } from "@/components/layout/site-footer";
import { catalogGames } from "@/lib/catalog";

/** The lobby previews a few matches; the full list lives at /watch. */
const LOBBY_PREVIEW = 6;

export function LobbyPage() {
  const liveMatches = useLiveMatches();

  return (
    <div className="min-h-full overflow-y-auto">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" />
          Connected
        </p>
        <h1 className="mt-3 font-[Rajdhani,Inter,sans-serif] text-4xl font-bold sm:text-5xl">
          Choose your next game
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Pick a game to open its lobby. Only Rock Paper Scissors is playable right now.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {catalogGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl font-bold">Live matches</h2>
            <Link to="/watch" className="text-sm font-semibold text-primary">
              Watch directory
            </Link>
          </div>
          <div className="mt-4">
            <LiveMatchGrid
              matches={liveMatches?.slice(0, LOBBY_PREVIEW) ?? null}
              emptyAction={{ to: "/games/rps", label: "Start Playing" }}
            />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
