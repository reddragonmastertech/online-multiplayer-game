import { rpsHands, type RpsHand, type ViewerRole } from "@game-platform/shared";
import { cn } from "@/lib/utils";
import type { MatchMoveView } from "./match-types";

export const rpsGlyphs: Record<RpsHand, string> = {
  Rock: "✊",
  Paper: "✋",
  Scissors: "✌️",
};

const beats: Record<RpsHand, RpsHand> = {
  Rock: "Scissors",
  Paper: "Rock",
  Scissors: "Paper",
};

function MoveMark({ move }: { move: MatchMoveView }) {
  const hidden = move === "choosing" || move === "locked";
  const label = move === "choosing" ? "Choosing" : move === "locked" ? "Locked in" : move;

  return (
    <div className="text-center">
      <div
        className={cn(
          "mx-auto grid size-20 place-items-center rounded-3xl border text-4xl sm:size-24 sm:text-5xl",
          hidden
            ? "border-dashed border-border bg-black/30 text-3xl text-muted-foreground"
            : "border-primary/70 bg-[#10242C] shadow-[0_0_28px_color-mix(in_srgb,var(--primary)_18%,transparent)]",
        )}
      >
        <span aria-hidden="true">{hidden ? "?" : rpsGlyphs[move]}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{label}</p>
    </div>
  );
}

export function RpsBoard({
  role,
  leftMove,
  rightMove,
  selected,
  disabled = false,
  onPick,
}: {
  role: ViewerRole;
  leftMove: MatchMoveView;
  rightMove: MatchMoveView;
  selected?: RpsHand;
  disabled?: boolean;
  onPick?: (hand: RpsHand) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <MoveMark move={leftMove} />
        <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground/70">VS</span>
        <MoveMark move={rightMove} />
      </div>

      {role === "player" ? (
        <div className="mt-6 grid grid-cols-3 gap-2">
          {rpsHands.map((hand) => {
            const active = selected === hand;
            return (
              <button
                key={hand}
                type="button"
                disabled={disabled}
                onClick={() => onPick?.(hand)}
                aria-label={hand}
                aria-pressed={active}
                className={cn(
                  "rounded-2xl border px-2 py-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60",
                  active
                    ? "border-primary bg-[#10242C]"
                    : "border-border bg-black/25 hover:border-primary/60",
                )}
              >
                <span className="text-2xl" aria-hidden="true">
                  {rpsGlyphs[hand]}
                </span>
                <p className="mt-1 text-xs font-semibold">{hand}</p>
                <p className="text-[10px] text-muted-foreground">beats {beats[hand]}</p>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
