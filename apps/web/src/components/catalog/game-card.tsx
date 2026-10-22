import { Link } from "react-router-dom";
import type { CatalogGame } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { GameArt } from "./game-art";

export function GameCard({ game }: { game: CatalogGame }) {
  const available = game.availability === "available";

  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card">
      <GameArt gameId={game.id} className="h-40 sm:h-48" />
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">1v1</p>
        <h3 className="mt-2 font-[Rajdhani,Inter,sans-serif] text-2xl font-bold">{game.name}</h3>
        <p className="mt-2 flex-1 text-sm text-muted-foreground">{game.blurb}</p>
        <p className="mt-3 text-xs text-muted-foreground">{game.matchType}</p>
        {available && game.href ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm text-primary">
              <span className="size-2 rounded-full bg-primary" />
              Available
            </span>
            <Button asChild>
              <Link to={game.href}>Play Now</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm text-gold">Coming soon</span>
            <Button disabled variant="secondary">
              Coming soon
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
