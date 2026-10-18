import { ArrowLeft, Eye } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  liveMatches,
  matchRounds,
  panelClass,
  type LiveMatch,
  type Move,
} from "@/components/home/lobby-data";
import { Portrait } from "@/components/home/portrait";
import { cn } from "@/lib/utils";

const weapons: { name: Move; glyph: string; beats: string }[] = [
  { name: "Rock", glyph: "✊", beats: "Scissors" },
  { name: "Paper", glyph: "✋", beats: "Rock" },
  { name: "Scissors", glyph: "✌️", beats: "Paper" },
];

function MoveMark({ move }: { move: Move }) {
  const weapon = weapons.find((item) => item.name === move);
  const hidden = move === "Choosing";

  return (
    <div className="text-center">
      <div
        className={cn(
          "mx-auto grid size-20 place-items-center rounded-3xl border text-4xl sm:size-28 sm:text-5xl",
          hidden
            ? "border-dashed border-white/20 bg-black/30 text-3xl text-white/35"
            : "border-[#f3c969]/70 bg-[#1a1408] shadow-[0_0_28px_rgb(243_201_105/0.22)]",
        )}
      >
        <span aria-hidden="true">{weapon?.glyph ?? "?"}</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{hidden ? "Choosing" : move}</p>
    </div>
  );
}

function PlayerCard({ player, tone }: { player: LiveMatch["left"]; tone: string }) {
  return (
    <section className={cn("rounded-2xl border p-4 text-center", tone)}>
      <Portrait id={player.avatar} name={player.name} className="mx-auto size-24 rounded-2xl" />
      <p className="mt-3 truncate text-sm text-[#f3c969]">{player.name}</p>
      <p className="mt-3 font-[Rajdhani,Inter,sans-serif] text-5xl font-bold leading-none">
        {player.score}
      </p>
      <p className="mt-1 text-[11px] font-semibold tracking-[0.16em] text-white/45">SCORE</p>
      <p className="mt-4 rounded-full bg-black/35 px-3 py-1 text-xs text-white/80">{player.move}</p>
    </section>
  );
}

export function GameRoomPage() {
  const { matchId = "" } = useParams();
  const match = liveMatches.find((item) => item.id === matchId);

  if (!match) {
    return (
      <div className="grid h-full place-items-center p-6">
        <section className={cn(panelClass, "max-w-md p-6 text-center")}>
          <h2 className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">Match closed</h2>
          <p className="mt-2 text-sm text-white/50">That room is no longer on the board.</p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#121a2b] px-4 py-2 text-sm"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Lobby
          </Link>
        </section>
      </div>
    );
  }

  const usdt = match.currency === "usdt";
  const tone = usdt
    ? "border-amber-300/40 bg-gradient-to-b from-[#241c0e] to-[#100e0b]"
    : "border-emerald-400/35 bg-gradient-to-b from-[#10241c] to-[#0b1210]";
  const rounds = matchRounds[match.id] ?? [];
  const live = match.countdown !== undefined;

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#121a2b] px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c969]"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Lobby
            </Link>
            <h2 className="text-nowrap font-[Rajdhani,Inter,sans-serif] text-2xl font-bold tracking-wide sm:text-3xl">
              {match.stake} MATCH
            </h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-300">
            <Eye className="size-3" aria-hidden="true" />
            SPECTATING
          </span>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
          <div className="order-2 lg:order-1">
            <PlayerCard player={match.left} tone={tone} />
          </div>

          <section className="order-1 overflow-hidden rounded-3xl border border-[#e3b34a]/60 bg-[radial-gradient(circle_at_center,#1a2744_0%,#070b14_72%)] p-4 shadow-[0_0_36px_rgb(227_179_74/0.1)] sm:p-6 lg:order-2">
            <header className="flex items-center justify-between gap-3 text-[11px]">
              <p className={cn("font-semibold", usdt ? "text-amber-200" : "text-emerald-300")}>
                Pot {match.stake}
              </p>
              <p className="text-white/55">Round {match.round} · Best of 3</p>
            </header>

            <p className="my-6 text-center">
              {live ? (
                <span className="text-sm text-emerald-300">
                  Time left{" "}
                  <span className="mx-1 font-[Rajdhani,Inter,sans-serif] text-6xl font-bold text-white">
                    {match.countdown}
                  </span>
                  s
                </span>
              ) : (
                <span className="text-sm text-[#f3c969]">
                  Round winner{" "}
                  <span className="mt-1 block font-[Rajdhani,Inter,sans-serif] text-4xl font-bold text-white">
                    {match.winner}
                  </span>
                </span>
              )}
            </p>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <MoveMark move={match.left.move} />
              <span className="text-xs font-semibold tracking-[0.2em] text-white/35">VS</span>
              <MoveMark move={match.right.move} />
            </div>

            <ul className="mt-6 grid grid-cols-3 gap-2">
              {weapons.map((weapon) => {
                const active = match.left.move === weapon.name || match.right.move === weapon.name;
                return (
                  <li
                    key={weapon.name}
                    className={cn(
                      "rounded-2xl border px-2 py-3 text-center",
                      active
                        ? "border-[#f3c969]/70 bg-[#1a1408]"
                        : "border-white/10 bg-black/25",
                    )}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {weapon.glyph}
                    </span>
                    <p className="mt-1 text-xs font-semibold">{weapon.name}</p>
                    <p className="text-[10px] text-white/40">beats {weapon.beats}</p>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="order-3">
            <PlayerCard player={match.right} tone={tone} />
          </div>
        </div>

        <section className={cn(panelClass, "p-4")}>
          <h3 className="text-xs font-semibold tracking-[0.16em] text-white/75">ROUND LOG</h3>
          {rounds.length === 0 ? (
            <p className="mt-3 text-sm text-white/45">No earlier rounds yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {rounds.map((round) => (
                <li key={round.round} className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2.5">
                  <span className="text-[11px] font-semibold tracking-[0.14em] text-[#f3c969]">
                    R{round.round}
                  </span>
                  <p className="min-w-0 flex-1 text-sm">{round.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
