import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { findStake, panelClass, type Stake } from "@/components/home/lobby-data";
import { Portrait } from "@/components/home/portrait";
import {
  hands,
  judgeRound,
  randomHand,
  roundDetail,
  type Hand,
  type RoundResult,
} from "@/lib/rps";
import { cn } from "@/lib/utils";

const WIN_SCORE = 2;
const ROUND_SECONDS = 10;
const THINK_MS = 700;
const REVEAL_MS = 1500;

const glyphs: Record<Hand, string> = {
  Rock: "✊",
  Paper: "✋",
  Scissors: "✌️",
};

type Phase = "choose" | "thinking" | "reveal" | "done";
type LogEntry = { id: number; detail: string };

function MoveMark({ move }: { move: Hand | "Choosing" }) {
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
        <span aria-hidden="true">{hidden ? "?" : glyphs[move]}</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{hidden ? "Choosing" : move}</p>
    </div>
  );
}

function PlayerSide({
  name,
  avatar,
  score,
  move,
  tone,
}: {
  name: string;
  avatar: number;
  score: number;
  move: string;
  tone: string;
}) {
  return (
    <section className={cn("rounded-2xl border p-4 text-center", tone)}>
      <Portrait id={avatar} name={name} className="mx-auto size-24 rounded-2xl" />
      <p className="mt-3 truncate text-sm text-[#f3c969]">{name}</p>
      <p className="mt-3 font-[Rajdhani,Inter,sans-serif] text-5xl font-bold leading-none">{score}</p>
      <p className="mt-1 text-[11px] font-semibold tracking-[0.16em] text-white/45">SCORE</p>
      <p className="mt-4 rounded-full bg-black/35 px-3 py-1 text-xs text-white/80">{move}</p>
    </section>
  );
}

function MatchTable({ stake }: { stake: Stake }) {
  const [phase, setPhase] = useState<Phase>("choose");
  const [round, setRound] = useState(1);
  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const [youScore, setYouScore] = useState(0);
  const [cpuScore, setCpuScore] = useState(0);
  const [youMove, setYouMove] = useState<Hand | "Choosing">("Choosing");
  const [cpuMove, setCpuMove] = useState<Hand | "Choosing">("Choosing");
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const locked = useRef(false);
  const timers = useRef<number[]>([]);
  const playRef = useRef<(hand: Hand) => void>(() => {});

  const usdt = stake.currency === "usdt";
  const tone = usdt
    ? "border-amber-300/40 bg-gradient-to-b from-[#241c0e] to-[#100e0b]"
    : "border-emerald-400/35 bg-gradient-to-b from-[#10241c] to-[#0b1210]";
  const youWonMatch = youScore >= WIN_SCORE;

  function later(run: () => void, ms: number) {
    const id = window.setTimeout(run, ms);
    timers.current.push(id);
  }

  function play(hand: Hand) {
    if (locked.current || phase !== "choose") return;
    locked.current = true;
    const cpu = randomHand();
    const result = judgeRound(hand, cpu);
    const nextYou = youScore + (result === "you" ? 1 : 0);
    const nextCpu = cpuScore + (result === "cpu" ? 1 : 0);

    setYouMove(hand);
    setPhase("thinking");
    later(() => {
      setCpuMove(cpu);
      setYouScore(nextYou);
      setCpuScore(nextCpu);
      setRoundResult(result);
      setLog((entries) => [...entries, { id: round, detail: roundDetail(result, hand, cpu) }]);
      setPhase(nextYou >= WIN_SCORE || nextCpu >= WIN_SCORE ? "done" : "reveal");
    }, THINK_MS);
  }

  playRef.current = play;

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (phase !== "choose") return;
    let alive = true;
    let remaining = ROUND_SECONDS;
    setSeconds(ROUND_SECONDS);
    const id = window.setInterval(() => {
      if (!alive) return;
      remaining -= 1;
      setSeconds(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        playRef.current(randomHand());
      }
    }, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [phase, round]);

  useEffect(() => {
    if (phase !== "reveal") return;
    const id = window.setTimeout(() => {
      locked.current = false;
      setYouMove("Choosing");
      setCpuMove("Choosing");
      setRoundResult(null);
      setRound((current) => current + 1);
      setPhase("choose");
    }, REVEAL_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  function playAgain() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    locked.current = false;
    setYouScore(0);
    setCpuScore(0);
    setRound(1);
    setYouMove("Choosing");
    setCpuMove("Choosing");
    setRoundResult(null);
    setLog([]);
    setPhase("choose");
  }

  const status =
    phase === "choose"
      ? "Pick a hand"
      : phase === "thinking"
        ? "CPU is choosing"
        : roundResult === "draw"
          ? "Draw"
          : roundResult === "you"
            ? "You won the round"
            : "CPU won the round";

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
              {stake.amount} MATCH
            </h2>
          </div>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#f3c969]">
            VS CPU
          </span>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
          <div className="order-2 lg:order-1">
            <PlayerSide name="You" avatar={64} score={youScore} move={youMove} tone={tone} />
          </div>

          <section className="order-1 overflow-hidden rounded-3xl border border-[#e3b34a]/60 bg-[radial-gradient(circle_at_center,#1a2744_0%,#070b14_72%)] p-4 shadow-[0_0_36px_rgb(227_179_74/0.1)] sm:p-6 lg:order-2">
            <header className="flex items-center justify-between gap-3 text-[11px]">
              <p className={cn("font-semibold", usdt ? "text-amber-200" : "text-emerald-300")}>
                Pot {stake.amount}
              </p>
              <p className="text-white/55">
                Round {round} · First to {WIN_SCORE}
              </p>
            </header>

            <p className="my-6 text-center">
              {phase === "done" ? (
                <span className="text-sm text-[#f3c969]">
                  Match winner{" "}
                  <span className="mt-1 block font-[Rajdhani,Inter,sans-serif] text-4xl font-bold text-white">
                    {youWonMatch ? "You" : "CPU"}
                  </span>
                </span>
              ) : phase === "choose" ? (
                <span className="text-sm text-emerald-300">
                  {status}{" "}
                  <span className="mx-1 font-[Rajdhani,Inter,sans-serif] text-6xl font-bold text-white">
                    {seconds}
                  </span>
                  s
                </span>
              ) : (
                <span className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold text-white">
                  {status}
                </span>
              )}
            </p>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <MoveMark move={youMove} />
              <span className="text-xs font-semibold tracking-[0.2em] text-white/35">VS</span>
              <MoveMark move={cpuMove} />
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              {hands.map((hand) => {
                const selected = youMove === hand;
                return (
                  <button
                    key={hand}
                    type="button"
                    disabled={phase !== "choose"}
                    onClick={() => play(hand)}
                    className={cn(
                      "rounded-2xl border px-2 py-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3c969] disabled:cursor-default",
                      selected
                        ? "border-[#f3c969]/70 bg-[#1a1408]"
                        : "border-white/10 bg-black/25 hover:border-[#f3c969]/50 disabled:hover:border-white/10",
                    )}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {glyphs[hand]}
                    </span>
                    <p className="mt-1 text-xs font-semibold">{hand}</p>
                    <p className="text-[10px] text-white/40">beats {hand === "Rock" ? "Scissors" : hand === "Paper" ? "Rock" : "Paper"}</p>
                  </button>
                );
              })}
            </div>

            {phase === "done" ? (
              <button
                type="button"
                onClick={playAgain}
                className="mt-4 w-full rounded-full bg-gradient-to-r from-[#ff6b8a] to-[#ff2d55] py-2.5 text-sm font-bold tracking-wide text-white"
              >
                Play again
              </button>
            ) : null}
          </section>

          <div className="order-3">
            <PlayerSide name="CPU" avatar={21} score={cpuScore} move={cpuMove} tone={tone} />
          </div>
        </div>

        <section className={cn(panelClass, "p-4")}>
          <h3 className="text-xs font-semibold tracking-[0.16em] text-white/75">ROUND LOG</h3>
          {log.length === 0 ? (
            <p className="mt-3 text-sm text-white/45">No rounds yet. Pick a hand before the timer ends.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {log.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 rounded-xl bg-black/30 px-3 py-2.5">
                  <span className="text-[11px] font-semibold tracking-[0.14em] text-[#f3c969]">
                    R{entry.id}
                  </span>
                  <p className="min-w-0 flex-1 text-sm">{entry.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function CpuMatchPage() {
  const { stakeId = "" } = useParams();
  const stake = findStake(stakeId);

  if (!stake) {
    return (
      <div className="grid h-full place-items-center p-6">
        <section className={cn(panelClass, "max-w-md p-6 text-center")}>
          <h2 className="font-[Rajdhani,Inter,sans-serif] text-3xl font-bold">Stake closed</h2>
          <p className="mt-2 text-sm text-white/50">That match is not on the board.</p>
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

  return <MatchTable key={stake.id} stake={stake} />;
}
