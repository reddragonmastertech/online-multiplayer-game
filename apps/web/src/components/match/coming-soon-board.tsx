import type { CatalogGameId } from "@game-platform/shared";

const labels: Record<CatalogGameId, string> = {
  rps: "Rock Paper Scissors",
  chess: "Chess",
  "four-by-four": "4 × 4",
};

export function ComingSoonBoard({ gameId }: { gameId: CatalogGameId }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#30425B] bg-black/20 px-6 py-12 text-center">
      <p className="text-sm font-semibold tracking-[0.16em] text-[#42DDCD]">COMING SOON</p>
      <p className="mt-3 text-lg text-[#F5F8FD]">{labels[gameId]} is not playable yet.</p>
      <p className="mt-2 text-sm text-[#B1C0D2]">RPS is the live game on this board.</p>
    </div>
  );
}
