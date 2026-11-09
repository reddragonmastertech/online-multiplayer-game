import { MATCH_RULES, type MatchPlayer, type MatchState, type RpsHand } from "@game-platform/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GameSurface } from "@/components/match/game-surface";
import { MatchClosed } from "@/components/match/match-closed";
import { MatchShell } from "@/components/match/match-shell";
import type { MatchMoveView, MatchSeatView, MatchView } from "@/components/match/match-types";
import { Button } from "@/components/ui/button";
import { useMatchStore } from "@/stores/match-store";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";

function moveView(player: MatchPlayer): MatchMoveView {
  if (player.move.status === "revealed") return player.move.hand;
  return player.move.status;
}

function seatView(player: MatchPlayer, you: boolean): MatchSeatView {
  return {
    id: player.userId,
    name: player.name,
    // Stable per-player portrait without inventing an avatar the user picked.
    avatar: (player.userId.charCodeAt(0) + player.userId.charCodeAt(1)) % 70,
    score: player.score,
    move: moveView(player),
    you,
  };
}

function statusText(state: MatchState, you: MatchPlayer | undefined, finished: boolean) {
  if (finished) return "Match over";
  if (state.status === "reveal") return "Round result";
  if (you && you.move.status !== "choosing") return "Opponent is choosing…";
  return "Pick a hand";
}

export function GameRoomPage() {
  const { matchId = "" } = useParams();
  const user = useSessionStore((state) => state.user);
  const sessionStatus = useSessionStore((state) => state.status);
  const openAuth = useUiStore((state) => state.openAuth);

  const state = useMatchStore((store) => store.state);
  const over = useMatchStore((store) => store.over);
  const log = useMatchStore((store) => store.log);
  const pending = useMatchStore((store) => store.pending);
  const error = useMatchStore((store) => store.error);
  const watch = useMatchStore((store) => store.watch);
  const move = useMatchStore((store) => store.move);
  const forfeit = useMatchStore((store) => store.forfeit);
  const clear = useMatchStore((store) => store.clear);

  const [confirmingExit, setConfirmingExit] = useState(false);

  useEffect(() => {
    if (!matchId || !user) return;
    watch(matchId);
  }, [matchId, user, watch]);

  useEffect(() => () => clear(), [clear]);

  if (sessionStatus === "boot") {
    return (
      <div className="grid h-full place-items-center p-6">
        <p className="text-sm text-muted-foreground">Loading match…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid h-full place-items-center p-6">
        <section className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <h1 className="font-display text-3xl font-bold">Match room</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Log in to rejoin your match. Spectating other people's matches is not available yet.
          </p>
          <Button className="mt-6" onClick={() => openAuth("login")}>
            Log in
          </Button>
        </section>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="grid h-full place-items-center p-6">
        <section className="max-w-md rounded-3xl border border-border bg-card p-8 text-center">
          <h1 className="font-display text-3xl font-bold">
            {error ? "Match unavailable" : "Joining match…"}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {error ??
              "Waiting for the server to send this match. If it has already finished, it will not reopen."}
          </p>
          <Button className="mt-6" variant="secondary" asChild>
            <Link to="/games/rps">Back to RPS Lobby</Link>
          </Button>
        </section>
      </div>
    );
  }

  if (state.viewerRole !== "player") {
    return (
      <MatchClosed
        title="Not your match"
        detail="You are not seated in this match, and spectating is not available yet."
        backTo="/lobby"
      />
    );
  }

  const you = state.players.find((player) => player.userId === state.yourUserId);
  const opponent = state.players.find((player) => player.userId !== state.yourUserId);

  if (!you || !opponent) {
    return (
      <MatchClosed title="Match unavailable" detail="That match is missing a player." backTo="/lobby" />
    );
  }

  const finished = Boolean(over);
  const youWon = over?.winnerSeat === you.seat;
  const yourDelta = over?.payouts.find((payout) => payout.userId === you.userId)?.delta;
  const choosing = state.status === "live" && you.move.status === "choosing";
  const selected: RpsHand | undefined =
    you.move.status === "revealed" ? you.move.hand : (pending ?? undefined);

  const view: MatchView = {
    gameId: state.gameId,
    gameName: "Rock Paper Scissors",
    title: `${state.stake} RAC MATCH`,
    modeLabel: `First to ${state.firstTo}`,
    potLabel: `Pot ${state.pot} RAC`,
    round: state.round,
    firstTo: state.firstTo,
    secondsLeft: state.secondsLeft,
    showCountdown: choosing,
    status: statusText(state, you, finished),
    role: "player",
    left: seatView(you, true),
    right: seatView(opponent, false),
    log,
    backTo: "/games/rps",
    backLabel: "RPS Lobby",
  };

  return (
    <div className="relative">
      <MatchShell
        view={view}
        board={
          <GameSurface
            gameId={state.gameId}
            role="player"
            leftMove={view.left.move}
            rightMove={view.right.move}
            selected={selected}
            disabled={!choosing || Boolean(pending)}
            onPick={move}
          />
        }
      />

      <div className="mx-auto max-w-6xl px-3 pb-6 sm:px-4">
        {error ? (
          <p role="status" className="mb-3 text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}

        {finished ? (
          <section className="rounded-3xl border border-primary/40 bg-card p-6 text-center">
            <h2 className="font-display text-3xl font-bold">
              {youWon ? "You won" : "You lost"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {over?.reason === "forfeit"
                ? "The match ended by forfeit."
                : over?.reason === "disconnect"
                  ? "The match ended because a player disconnected."
                  : `Final score ${you.score} – ${opponent.score}.`}
            </p>
            {yourDelta !== undefined ? (
              <p className="mt-2 font-display text-2xl font-bold text-primary">
                {yourDelta > 0 ? `+${yourDelta}` : yourDelta} RAC
              </p>
            ) : (
              <p className="mt-2 text-sm text-danger">
                Settlement did not complete. Check your balance on your account page.
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/games/rps">Back to RPS Lobby</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/account">View balance</Link>
              </Button>
            </div>
          </section>
        ) : confirmingExit ? (
          <section className="rounded-3xl border border-danger/40 bg-card p-6 text-center">
            <h2 className="font-semibold">Forfeit this match?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your {state.stake} RAC stake goes to your opponent. This cannot be undone.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  forfeit();
                  setConfirmingExit(false);
                }}
              >
                Forfeit and lose {state.stake} RAC
              </Button>
              <Button onClick={() => setConfirmingExit(false)}>Keep playing</Button>
            </div>
          </section>
        ) : (
          <div className="text-center">
            <Button variant="ghost" onClick={() => setConfirmingExit(true)}>
              Forfeit match
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Leaving this page keeps the match running. You have{" "}
              {MATCH_RULES.disconnectGraceSeconds}s to return before a disconnect forfeits it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
