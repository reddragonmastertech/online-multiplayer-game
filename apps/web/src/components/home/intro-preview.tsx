import { rpsHands, type RpsHand } from "@game-platform/shared";
import { useState } from "react";
import { rpsGlyphs } from "@/components/match/rps-board";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const beats: Record<RpsHand, RpsHand> = {
  Rock: "Scissors",
  Paper: "Rock",
  Scissors: "Paper",
};

export function IntroPreview() {
  const [hand, setHand] = useState<RpsHand | null>(null);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">RULES PREVIEW</p>
      <h2 className="mt-2 font-[Rajdhani,Inter,sans-serif] text-2xl font-bold">Tap a hand</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This is a local preview of the rules. It is not a match against another player.
      </p>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {rpsHands.map((item) => (
          <Button
            key={item}
            variant={hand === item ? "default" : "secondary"}
            className={cn("h-auto flex-col rounded-2xl py-3")}
            onClick={() => setHand(item)}
          >
            <span className="text-2xl" aria-hidden="true">
              {rpsGlyphs[item]}
            </span>
            {item}
          </Button>
        ))}
      </div>
      <p className="mt-5 min-h-12 text-sm text-muted-foreground">
        {hand ? (
          <>
            <span className="font-semibold text-foreground">{hand}</span> beats{" "}
            <span className="font-semibold text-gold">{beats[hand]}</span>. Same hands are a draw
            and score nothing.
          </>
        ) : (
          "Choose Rock, Paper, or Scissors to see what it beats."
        )}
      </p>
    </section>
  );
}
