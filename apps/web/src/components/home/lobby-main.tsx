import { Clock, Gamepad2, Pause } from "lucide-react";
import { useState } from "react";
import {
  dailyMissions,
  featuredMatch,
  liveMatches,
  panelClass,
  stakes,
  totalMissions,
  type Currency,
  type LiveMatch,
} from "./lobby-data";
import { Portrait } from "./portrait";
import { cn } from "@/lib/utils";

function rewardClass(currency: Currency) {
  return currency === "rac"
    ? "bg-emerald-400/15 text-emerald-300"
    : "bg-amber-300/15 text-amber-200";
}

function stakeSurface(currency: Currency, selected: boolean) {
  return cn(
    "flex min-h-28 flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center transition",
    currency === "rac"
      ? "border-emerald-400/45 bg-gradient-to-b from-[#143026] to-[#0b1612]"
      : "border-amber-300/50 bg-gradient-to-b from-[#3a2e14] to-[#14110c]",
    selected && "ring-2 ring-[#f3c969]",
  );
}

function MissionRow({
  label,
  progress,
  reward,
  currency,
}: {
  label: string;
  progress: string;
  reward: string;
  currency: Currency;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2.5">
      <p className="min-w-0 flex-1 truncate text-sm">{label}</p>
      <p className="text-xs text-white/40">{progress}</p>
      <p className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", rewardClass(currency))}>
        {reward}
      </p>
    </li>
  );
}

function MatchPlayer({
  name,
  avatar,
  score,
  move,
}: LiveMatch["left"]) {
  return (
    <div className="min-w-0 text-center">
      <Portrait id={avatar} name={name} className="mx-auto size-10 rounded-full" />
      <p className="mt-1 truncate text-xs">{name}</p>
      <p className="text-[10px] text-white/40">Score {score}</p>
      <p className="text-[10px] text-amber-200/90">{move}</p>
    </div>
  );
}

function LiveMatchCard({ match }: { match: LiveMatch }) {
  const usdt = match.currency === "usdt";

  return (
    <article
      className={cn(
        "rounded-2xl border p-3",
        usdt
          ? "border-amber-300/40 bg-gradient-to-b from-[#241c0e] to-[#100e0b] shadow-[0_0_24px_rgb(245_158_11/0.06)]"
          : "border-emerald-400/35 bg-gradient-to-b from-[#10241c] to-[#0b1210] shadow-[0_0_24px_rgb(16_185_129/0.06)]",
      )}
    >
      <header className="flex items-center justify-between text-[11px]">
        <p className={cn("font-semibold", usdt ? "text-amber-200" : "text-emerald-300")}>
          {match.stake}
        </p>
        <p className="text-white/55">Round {match.round}</p>
      </header>
      <p className="my-2 text-center text-xs text-emerald-300">
        {match.countdown !== undefined ? (
          <>
            Time left <span className="text-lg font-semibold text-white">{match.countdown}</span> s
          </>
        ) : (
          <>
            Round winner: <span className="font-semibold text-white">{match.winner}</span>
          </>
        )}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1">
        <MatchPlayer {...match.left} />
        <span className="pt-3 text-[10px] text-white/35">VS</span>
        <MatchPlayer {...match.right} />
      </div>
    </article>
  );
}

export function LobbyMain() {
  const [selectedStake, setSelectedStake] = useState<string | null>(null);

  return (
    <main className="space-y-4 p-3 xl:min-h-0 xl:overflow-y-auto xl:p-4">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.85fr)]">
        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-[0.18em] text-white/75">
            FEATURED MATCH
          </h2>
          <div className={cn(panelClass, "overflow-hidden")}>
            <div className="grid grid-cols-2 gap-4 bg-[#070d16] p-4">
              {[featuredMatch.left, featuredMatch.right].map((player) => (
                <div key={player.name} className="text-center">
                  <Portrait
                    id={player.avatar}
                    name={player.name}
                    className="mx-auto aspect-square w-full max-w-44 rounded-xl"
                  />
                  <p className="mt-2 text-sm text-[#f3c969]">{player.name}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <button
                type="button"
                className="grid size-7 place-items-center rounded-full bg-white/10"
                aria-label="Pause featured match"
              >
                <Pause className="size-3.5" aria-hidden="true" />
              </button>
              <span className="text-[11px] text-white/70">{featuredMatch.elapsed}</span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="absolute inset-y-0 left-0 w-[72%] bg-sky-500" />
                <div className="absolute inset-y-0 right-0 w-[28%] bg-rose-500" />
              </div>
              <span className="text-[11px] text-white/70">{featuredMatch.duration}</span>
              <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80">
                1080p
              </span>
            </div>
          </div>
        </section>

        <section className={cn(panelClass, "p-4")}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-[0.16em]">DAILY MISSIONS</h2>
            <p className="inline-flex items-center gap-1 text-[11px] text-[#f3c969]">
              <Clock className="size-3.5" aria-hidden="true" />
              17h 56m left
            </p>
          </div>
          <ul className="space-y-2">
            {dailyMissions.map((mission) => (
              <MissionRow key={mission.id} {...mission} />
            ))}
          </ul>
          <h3 className="mb-2 mt-4 text-[11px] font-semibold tracking-[0.16em] text-white/55">
            TOTAL MISSIONS
          </h3>
          <ul className="space-y-2">
            {totalMissions.map((mission) => (
              <MissionRow key={mission.id} {...mission} />
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-[#e3b34a]/70 bg-[#0c1018] p-3 shadow-[0_0_28px_rgb(227_179_74/0.08)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold tracking-[0.18em] text-white/80">
            CHOOSE YOUR MATCH
          </h2>
          <span className="size-7 rounded-full border border-white/10" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {stakes.map((stake) => {
            const selected = selectedStake === stake.amount;
            return (
              <button
                key={stake.amount}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedStake(stake.amount)}
                className={stakeSurface(stake.currency, selected)}
              >
                <p className="text-lg font-semibold">{stake.amount}</p>
                <p className="mt-1 text-[11px] text-white/45">{stake.playing} playing</p>
                <span className="mt-2 rounded-md bg-black/45 px-3 py-1 text-[10px] font-semibold tracking-[0.14em]">
                  JOIN NOW
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xs font-semibold tracking-[0.18em]">LIVE MATCHES</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-rose-300">
            <span className="size-1.5 rounded-full bg-rose-400" />
            LIVE
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {liveMatches.map((match) => (
            <LiveMatchCard key={match.id} match={match} />
          ))}
        </div>
        <p className="py-4 text-center text-xs text-white/40">Showing 8 of 101 live matches</p>
        <footer className="relative flex items-center justify-center pb-4">
          <p className="absolute left-0 text-[11px] text-white/35">© 2026 All rights reserved.</p>
          <div className="flex items-center gap-3 text-white/50">
            <span className="grid size-8 place-items-center rounded-full border border-white/10 bg-black/30">
              <Gamepad2 className="size-4" aria-hidden="true" />
            </span>
            <span className="size-2 rounded-full bg-white/30" />
            <span className="size-2 rounded-full bg-white/15" />
          </div>
        </footer>
      </section>
    </main>
  );
}
