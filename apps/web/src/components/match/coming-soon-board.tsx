import type { CatalogGameId } from "@game-platform/shared";

const labels: Record<CatalogGameId, string> = {
  rps: "Rock Paper Scissors",
  chess: "Chess",
  "four-by-four": "4 × 4",
};

export function ComingSoonBoard({ gameId }: { gameId: CatalogGameId }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-black/20 px-6 py-12 text-center">
      <p className="text-sm font-semibold tracking-[0.16em] text-primary">COMING SOON</p>
      <p className="mt-3 text-lg text-foreground">{labels[gameId]} is not playable yet.</p>
      <p className="mt-2 text-sm text-muted-foreground">RPS is the live game on this board.</p>
    </div>
  );
}
