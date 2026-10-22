import type { CatalogGameId } from "@game-platform/shared";
import { cn } from "@/lib/utils";

export function GameArt({
  gameId,
  className,
}: {
  gameId: CatalogGameId;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-elevated",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(66_221_205/0.18),transparent_55%)]" />
      {gameId === "rps" ? (
        <div className="relative flex h-full items-center justify-center gap-3 text-4xl sm:text-5xl">
          <span>✊</span>
          <span>✋</span>
          <span>✌️</span>
        </div>
      ) : null}
      {gameId === "chess" ? (
        <div className="relative grid h-full place-items-center text-6xl text-gold">♚</div>
      ) : null}
      {gameId === "four-by-four" ? (
        <div className="relative grid h-full grid-cols-4 grid-rows-4 gap-1 p-6">
          {Array.from({ length: 16 }, (_, index) => (
            <span
              key={index}
              className={cn(
                "rounded-sm",
                index % 2 === 0 ? "bg-primary/35" : "bg-gold/35",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
