import { MATCH_RULES } from "@game-platform/shared";
import { useParams } from "react-router-dom";
import { liveMatches, matchRounds, type Move } from "@/components/home/lobby-data";
import { GameSurface } from "@/components/match/game-surface";
import { MatchClosed } from "@/components/match/match-closed";
import { MatchShell } from "@/components/match/match-shell";
import type { MatchMoveView, MatchView } from "@/components/match/match-types";

function toMoveView(move: Move): MatchMoveView {
  return move === "Choosing" ? "choosing" : move;
}

export function GameRoomPage() {
  const { matchId = "" } = useParams();
  const match = liveMatches.find((item) => item.id === matchId);

  if (!match) {
    return <MatchClosed title="Match closed" detail="That room is no longer on the board." />;
  }

  const live = match.countdown !== undefined;
  const view: MatchView = {
    gameId: "rps",
    gameName: "Rock Paper Scissors",
    title: `${match.stake} MATCH`,
    modeLabel: `First to ${MATCH_RULES.winScore}`,
    potLabel: `Pot ${match.stake}`,
    round: match.round,
    firstTo: MATCH_RULES.winScore,
    secondsLeft: match.countdown,
    showCountdown: live,
    status: live ? "You’re watching this match" : `Round winner ${match.winner ?? "pending"}`,
    role: "spectator",
    left: {
      id: match.left.name,
      name: match.left.name,
      avatar: match.left.avatar,
      score: match.left.score,
      move: toMoveView(match.left.move),
    },
    right: {
      id: match.right.name,
      name: match.right.name,
      avatar: match.right.avatar,
      score: match.right.score,
      move: toMoveView(match.right.move),
    },
    log: (matchRounds[match.id] ?? []).map((round) => ({
      round: round.round,
      detail: round.detail,
    })),
    backTo: "/",
  };

  return (
    <MatchShell
      view={view}
      board={
        <GameSurface
          gameId="rps"
          role="spectator"
          leftMove={view.left.move}
          rightMove={view.right.move}
        />
      }
    />
  );
}
