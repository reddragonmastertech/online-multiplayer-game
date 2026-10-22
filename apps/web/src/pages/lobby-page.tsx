import { Link } from "react-router-dom";
import { GameCard } from "@/components/catalog/game-card";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { catalogGames } from "@/lib/catalog";

export function LobbyPage() {
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
            <h2 className="font-[Rajdhani,Inter,sans-serif] text-2xl font-bold">Live matches</h2>
            <Link to="/watch" className="text-sm font-semibold text-primary">
              Watch directory
            </Link>
          </div>
          <div className="mt-4 rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">No public matches are live right now.</p>
            <Button className="mt-4" asChild>
              <Link to="/games/rps">Start Playing</Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
