import {
  advanceRound,
  randomHand,
  rpsEngine,
  viewerRoundDetail,
  type RpsState,
} from "@game-platform/game-rps";
import { MATCH_RULES, type RpsHand } from "@game-platform/shared";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { findStake, type Stake } from "@/components/home/lobby-data";
import { GameSurface } from "@/components/match/game-surface";
import { MatchClosed } from "@/components/match/match-closed";
import { MatchShell } from "@/components/match/match-shell";
import type { MatchMoveView, MatchView } from "@/components/match/match-types";

const YOU = "you";
const CPU = "cpu";
const THINK_MS = 700;

function createMatch() {
  return rpsEngine.initialState({ a: YOU, b: CPU });
}

function moveView(hand: RpsHand | null, hide: boolean): MatchMoveView {
  if (!hand) return "choosing";
  if (hide) return "locked";
  return hand;
}

function CpuTable({ stake }: { stake: Stake }) {
  const [match, setMatch] = useState<RpsState>(createMatch);
  const [uiPhase, setUiPhase] = useState<"choose" | "thinking">("choose");
  const [seconds, setSeconds] = useState<number>(MATCH_RULES.roundSeconds);
  const locked = useRef(false);
  const timers = useRef<number[]>([]);
  const playRef = useRef<(hand: RpsHand) => void>(() => {});

  const phase =
    match.phase === "finished" ? "done" : match.phase === "reveal" ? "reveal" : uiPhase;
  const lastRound = match.log.at(-1);
  const result = rpsEngine.status(match);
  const youWonMatch = result.kind === "winner" && result.playerId === YOU;
  const hideCpu = match.phase === "choosing";
  const selected = match.seats.a.hand ?? undefined;

  function later(run: () => void, ms: number) {
    const id = window.setTimeout(run, ms);
    timers.current.push(id);
  }

  function play(hand: RpsHand) {
    if (locked.current || match.phase !== "choosing" || uiPhase !== "choose") return;
    locked.current = true;
    setMatch((current) => rpsEngine.applyMove(current, YOU, hand));
    setUiPhase("thinking");
    later(() => {
      setMatch((current) => {
        const withCpu = current.seats.b.hand
          ? current
          : rpsEngine.applyMove(current, CPU, randomHand());
        return rpsEngine.resolveRound(withCpu);
      });
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
    let remaining = MATCH_RULES.roundSeconds;
    setSeconds(MATCH_RULES.roundSeconds);
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
  }, [phase, match.round]);

  useEffect(() => {
    if (match.phase !== "reveal") return;
    const id = window.setTimeout(() => {
      locked.current = false;
      setMatch((current) => advanceRound(current));
      setUiPhase("choose");
    }, MATCH_RULES.revealMs);
    return () => window.clearTimeout(id);
  }, [match.phase, match.round]);

  const status =
    phase === "choose"
      ? "Pick a hand"
      : phase === "thinking"
        ? "CPU is choosing"
        : phase === "done"
          ? `Match winner ${youWonMatch ? "You" : "CPU"}`
          : lastRound?.outcome === "draw"
            ? "Draw"
            : lastRound?.outcome === "a"
              ? "You won the round"
              : "CPU won the round";

  const view: MatchView = {
    gameId: "rps",
    gameName: "Rock Paper Scissors",
    title: `${stake.amount} MATCH`,
    modeLabel: `First to ${MATCH_RULES.winScore}`,
    potLabel: `Pot ${stake.amount}`,
    round: match.round,
    firstTo: MATCH_RULES.winScore,
    secondsLeft: seconds,
    showCountdown: phase === "choose",
    status,
    role: "player",
    badge: "VS CPU",
    left: {
      id: YOU,
      name: "You",
      avatar: 64,
      score: match.seats.a.score,
      move: moveView(match.seats.a.hand, false),
      you: true,
    },
    right: {
      id: CPU,
      name: "CPU",
      avatar: 21,
      score: match.seats.b.score,
      move: moveView(match.seats.b.hand, hideCpu),
      bot: true,
    },
    log: match.log.map((entry) => ({
      round: entry.round,
      detail: viewerRoundDetail(entry, "a"),
    })),
    backTo: "/games/rps",
    backLabel: "RPS Lobby",
  };

  return (
    <MatchShell
      view={view}
      onPlayAgain={
        phase === "done"
          ? () => {
              timers.current.forEach((id) => window.clearTimeout(id));
              timers.current = [];
              locked.current = false;
              setMatch(createMatch());
              setUiPhase("choose");
              setSeconds(MATCH_RULES.roundSeconds);
            }
          : undefined
      }
      board={
        <GameSurface
          gameId="rps"
          role="player"
          leftMove={view.left.move}
          rightMove={view.right.move}
          selected={selected}
          disabled={phase !== "choose"}
          onPick={play}
        />
      }
    />
  );
}

export function CpuMatchPage() {
  const { stakeId = "" } = useParams();
  const stake = findStake(stakeId);

  if (!stake) {
    return (
      <MatchClosed
        title="Stake closed"
        detail="That match is not on the board."
        backTo="/games/rps"
      />
    );
  }

  return <CpuTable key={stake.id} stake={stake} />;
}
