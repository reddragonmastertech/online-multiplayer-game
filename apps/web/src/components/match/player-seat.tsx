import { Portrait } from "@/components/home/portrait";
import { cn } from "@/lib/utils";
import type { MatchSeatView } from "./match-types";

function moveLabel(move: MatchSeatView["move"]) {
  if (move === "choosing") return "Choosing…";
  if (move === "locked") return "Locked in";
  return move;
}

/** Derived from the arena name, so it claims nothing the player did not pick. */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;

  return (
    <div
      aria-hidden="true"
      className={cn("grid place-items-center font-display text-4xl font-bold text-white", className)}
      style={{ backgroundColor: `hsl(${hue} 42% 32%)` }}
    >
      {initial}
    </div>
  );
}

export function PlayerSeat({
  seat,
  align = "center",
}: {
  seat: MatchSeatView;
  align?: "left" | "center" | "right";
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#30425B] bg-[#121D2D] p-4",
        align === "left" && "text-left",
        align === "right" && "text-right",
        align === "center" && "text-center",
      )}
    >
      {seat.avatar === null ? (
        <InitialsAvatar
          name={seat.name}
          className={cn(
            "size-20 rounded-2xl ring-2 ring-[#42DDCD]/70 sm:size-24",
            align === "center" && "mx-auto",
            align === "right" && "ml-auto",
          )}
        />
      ) : (
        <Portrait
          id={seat.avatar}
          name={seat.name}
          className={cn(
            "size-20 rounded-2xl ring-2 ring-[#42DDCD]/70 sm:size-24",
            align === "center" && "mx-auto",
            align === "right" && "ml-auto",
          )}
        />
      )}
      <p className="mt-3 truncate text-sm text-[#F5F8FD]">
        {seat.name}
        {seat.you ? <span className="ml-2 text-[10px] font-semibold tracking-wider text-[#42DDCD]">YOU</span> : null}
        {seat.bot ? <span className="ml-2 text-[10px] font-semibold tracking-wider text-[#B1C0D2]">CPU</span> : null}
      </p>
      <p className="mt-3 font-[Rajdhani,Inter,sans-serif] text-5xl font-bold leading-none text-[#EBC26A]">
        {seat.score}
      </p>
      <p className="mt-1 text-[11px] font-semibold tracking-[0.16em] text-[#B1C0D2]">SCORE</p>
      <p className="mt-4 rounded-full bg-black/35 px-3 py-1 text-xs text-[#B1C0D2]">{moveLabel(seat.move)}</p>
    </section>
  );
}
