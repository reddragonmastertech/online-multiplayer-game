import {
  advanceRound,
  bothReady,
  randomHand,
  roundDetail,
  rpsEngine,
  seatOf,
  type RpsState,
} from "@game-platform/game-rps";
import {
  MATCH_RULES,
  type LiveMatchSummary,
  type MatchOver,
  type MatchOverReason,
  type MatchReveal,
  type MatchState,
  type MoveView,
  type PlayableCurrency,
  type PlayableGameId,
  type PlayableRpsMode,
  type RpsHand,
  type Seat,
} from "@game-platform/shared";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";
import { settleRacMatch } from "../economy/wallet";

const TICK_MS = 250;

export type MatchPhase = "choosing" | "reveal" | "over";

export type LivePlayer = {
  userId: string;
  name: string;
  connected: boolean;
  /** When the socket dropped, for the disconnect grace period. */
  droppedAt: number | null;
};

export type LiveMatch = {
  matchId: string;
  gameId: PlayableGameId;
  mode: PlayableRpsMode;
  currency: PlayableCurrency;
  stake: number;
  players: Record<Seat, LivePlayer>;
  state: RpsState;
  phase: MatchPhase;
  /** Epoch ms when the current choosing round or reveal pause ends. */
  deadline: number;
  startedAt: string;
  /** Last whole second already sent, so the clock is not resent every tick. */
  lastSentSecond: number | null;
};

export type RuntimeEmitter = {
  /** Per-viewer, because each player may only see their own unrevealed hand. */
  state: (userId: string, payload: MatchState) => void;
  /** One shared payload: every spectator sees the same restricted view. */
  spectatorState: (matchId: string, payload: MatchState) => void;
  reveal: (matchId: string, payload: MatchReveal) => void;
  over: (matchId: string, payload: MatchOver) => void;
};

export type RuntimeLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
  warn: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
};

function otherSeat(seat: Seat): Seat {
  return seat === "a" ? "b" : "a";
}

function secondsLeft(match: LiveMatch, now: number) {
  if (match.phase !== "choosing") return 0;
  return Math.max(0, Math.ceil((match.deadline - now) / 1000));
}

/**
 * What one viewer is allowed to see. An opponent's hand is never included
 * before the round resolves; it is reported as `locked` instead.
 */
function moveViewFor(match: LiveMatch, seat: Seat, viewerUserId: string | null): MoveView {
  const hand = match.state.seats[seat].hand;
  if (!hand) return { status: "choosing" };

  const isOwn = viewerUserId !== null && match.players[seat].userId === viewerUserId;
  if (match.phase === "choosing" && !isOwn) {
    return { status: "locked" };
  }

  return { status: "revealed", hand };
}

export function stateFor(
  match: LiveMatch,
  viewerUserId: string | null,
  now: number,
): MatchState {
  const isPlayer =
    viewerUserId !== null &&
    (match.players.a.userId === viewerUserId || match.players.b.userId === viewerUserId);

  return {
    matchId: match.matchId,
    gameId: match.gameId,
    mode: match.mode,
    currency: match.currency,
    stake: match.stake,
    pot: match.stake * 2,
    status: match.phase === "over" ? "finished" : match.phase === "reveal" ? "reveal" : "live",
    round: match.state.round,
    firstTo: match.state.firstTo,
    secondsLeft: secondsLeft(match, now),
    players: [
      {
        userId: match.players.a.userId,
        name: match.players.a.name,
        seat: "a",
        score: match.state.seats.a.score,
        move: moveViewFor(match, "a", viewerUserId),
      },
      {
        userId: match.players.b.userId,
        name: match.players.b.name,
        seat: "b",
        score: match.state.seats.b.score,
        move: moveViewFor(match, "b", viewerUserId),
      },
    ],
    viewerRole: isPlayer ? "player" : "spectator",
    yourUserId: isPlayer ? viewerUserId : undefined,
    startedAt: match.startedAt,
    log: match.state.log.map((entry) => ({
      round: entry.round,
      detail: roundDetail(entry),
    })),
  };
}

export type MoveRejection =
  | "match_not_found"
  | "not_your_match"
  | "match_not_live"
  | "already_moved";

export function createMatchRuntime(deps: {
  db: AppDatabase;
  emit: RuntimeEmitter;
  log: RuntimeLogger;
  now?: () => number;
}) {
  const { db, emit, log } = deps;
  const now = deps.now ?? (() => Date.now());

  const live = new Map<string, LiveMatch>();
  const byUser = new Map<string, string>();
  let ticker: NodeJS.Timeout | null = null;

  function broadcastState(match: LiveMatch) {
    const at = now();
    match.lastSentSecond = secondsLeft(match, at);
    for (const seat of ["a", "b"] as const) {
      const player = match.players[seat];
      emit.state(player.userId, stateFor(match, player.userId, at));
    }
    emit.spectatorState(match.matchId, stateFor(match, null, at));
  }

  function forget(match: LiveMatch) {
    live.delete(match.matchId);
    byUser.delete(match.players.a.userId);
    byUser.delete(match.players.b.userId);
    if (live.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function persistRound(match: LiveMatch, handA: RpsHand, handB: RpsHand, outcome: Seat | "draw") {
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO match_rounds (match_id, round, hand_a, hand_b, outcome, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (match_id, round) DO NOTHING`,
      ).run(
        match.matchId,
        match.state.round,
        handA,
        handB,
        outcome,
        new Date(now()).toISOString(),
      );

      for (const seat of ["a", "b"] as const) {
        db.prepare("UPDATE match_players SET score = ? WHERE match_id = ? AND user_id = ?").run(
          match.state.seats[seat].score,
          match.matchId,
          match.players[seat].userId,
        );
      }

      db.prepare("UPDATE matches SET round = ? WHERE id = ?").run(
        match.state.round,
        match.matchId,
      );
    });
  }

  function finish(match: LiveMatch, winnerSeat: Seat, reason: MatchOverReason) {
    const winner = match.players[winnerSeat];
    const loser = match.players[otherSeat(winnerSeat)];
    const finishedAt = new Date(now()).toISOString();
    let payouts: MatchOver["payouts"] = [];

    try {
      const settlement = settleRacMatch(db, {
        matchId: match.matchId,
        stake: match.stake,
        winnerUserId: winner.userId,
        loserUserId: loser.userId,
        now: finishedAt,
      });
      payouts = settlement.deltas;
    } catch (error) {
      // Report the real outcome rather than a payout that did not happen.
      log.error(
        { matchId: match.matchId, error: String(error) },
        "settlement failed; match still ends",
      );
    }

    db.prepare(
      `UPDATE matches SET status = ?, winner_seat = ?, finished_at = ?, round = ? WHERE id = ?`,
    ).run(
      reason === "completed" ? "finished" : "forfeited",
      winnerSeat,
      finishedAt,
      match.state.round,
      match.matchId,
    );

    match.phase = "over";
    broadcastState(match);
    emit.over(match.matchId, {
      matchId: match.matchId,
      winnerSeat,
      reason,
      payouts,
    });

    log.info(
      { matchId: match.matchId, winner: winner.userId, reason, stake: match.stake },
      "match settled",
    );

    forget(match);
  }

  function resolve(match: LiveMatch) {
    const resolved = rpsEngine.resolveRound(match.state);
    const entry = resolved.log.at(-1);
    if (!entry) return;

    match.state = resolved;
    persistRound(match, entry.hands.a, entry.hands.b, entry.outcome);

    emit.reveal(match.matchId, {
      matchId: match.matchId,
      round: entry.round,
      hands: entry.hands,
      outcome: entry.outcome,
      scores: { a: resolved.seats.a.score, b: resolved.seats.b.score },
      detail: roundDetail(entry),
    });

    if (resolved.winnerSeat) {
      finish(match, resolved.winnerSeat, "completed");
      return;
    }

    match.phase = "reveal";
    match.deadline = now() + MATCH_RULES.revealMs;
    broadcastState(match);
  }

  function tick() {
    const at = now();

    for (const match of [...live.values()]) {
      if (match.phase === "over") continue;

      // A player who stays gone past the grace period forfeits.
      for (const seat of ["a", "b"] as const) {
        const player = match.players[seat];
        if (
          !player.connected &&
          player.droppedAt !== null &&
          at - player.droppedAt >= MATCH_RULES.disconnectGraceSeconds * 1000
        ) {
          finish(match, otherSeat(seat), "disconnect");
          break;
        }
      }

      if (!live.has(match.matchId)) continue;

      if (match.phase === "reveal") {
        if (at >= match.deadline) {
          match.state = advanceRound(match.state);
          match.phase = "choosing";
          match.deadline = at + MATCH_RULES.roundSeconds * 1000;
          broadcastState(match);
        }
        continue;
      }

      if (at >= match.deadline) {
        // Timer expired: a missing hand is chosen at random, same as the CPU.
        for (const seat of ["a", "b"] as const) {
          if (!match.state.seats[seat].hand) {
            match.state = rpsEngine.applyMove(
              match.state,
              match.players[seat].userId,
              randomHand(),
            );
          }
        }
        resolve(match);
        continue;
      }

      // The clock is the only thing changing, so only speak on the second.
      if (secondsLeft(match, at) !== match.lastSentSecond) {
        broadcastState(match);
      }
    }
  }

  function ensureTicker() {
    if (!ticker) {
      ticker = setInterval(tick, TICK_MS);
      // Never hold the process open for the sake of the match clock.
      ticker.unref?.();
    }
  }

  return {
    start(params: {
      matchId: string;
      gameId: PlayableGameId;
      mode: PlayableRpsMode;
      currency: PlayableCurrency;
      stake: number;
      players: Record<Seat, { userId: string; name: string }>;
    }) {
      const startedAt = new Date(now()).toISOString();
      const match: LiveMatch = {
        matchId: params.matchId,
        gameId: params.gameId,
        mode: params.mode,
        currency: params.currency,
        stake: params.stake,
        players: {
          a: { ...params.players.a, connected: true, droppedAt: null },
          b: { ...params.players.b, connected: true, droppedAt: null },
        },
        state: rpsEngine.initialState({
          a: params.players.a.userId,
          b: params.players.b.userId,
        }),
        phase: "choosing",
        deadline: now() + MATCH_RULES.roundSeconds * 1000,
        startedAt,
        lastSentSecond: null,
      };

      live.set(match.matchId, match);
      byUser.set(params.players.a.userId, match.matchId);
      byUser.set(params.players.b.userId, match.matchId);

      db.prepare("UPDATE matches SET status = 'live' WHERE id = ?").run(match.matchId);

      ensureTicker();
      broadcastState(match);
      return match;
    },

    /** The hand is recorded here and nowhere else; the browser never judges. */
    move(userId: string, matchId: string, hand: RpsHand): MoveRejection | null {
      const match = live.get(matchId);
      if (!match) return "match_not_found";

      const isPlayer =
        match.players.a.userId === userId || match.players.b.userId === userId;
      if (!isPlayer) return "not_your_match";

      if (match.phase !== "choosing") return "match_not_live";

      const seat = seatOf(match.state, userId);
      if (match.state.seats[seat].hand) return "already_moved";

      match.state = rpsEngine.applyMove(match.state, userId, hand);

      if (bothReady(match.state)) {
        resolve(match);
      } else {
        broadcastState(match);
      }

      return null;
    },

    forfeit(userId: string, matchId: string): MoveRejection | null {
      const match = live.get(matchId);
      if (!match) return "match_not_found";

      const seat =
        match.players.a.userId === userId
          ? "a"
          : match.players.b.userId === userId
            ? "b"
            : null;
      if (!seat) return "not_your_match";

      finish(match, otherSeat(seat), "forfeit");
      return null;
    },

    /** Re-seats a player after a refresh or a brief network drop. */
    attach(userId: string) {
      const matchId = byUser.get(userId);
      if (!matchId) return null;

      const match = live.get(matchId);
      if (!match) return null;

      const seat = match.players.a.userId === userId ? "a" : "b";
      match.players[seat].connected = true;
      match.players[seat].droppedAt = null;

      return match;
    },

    detach(userId: string) {
      const matchId = byUser.get(userId);
      if (!matchId) return null;

      const match = live.get(matchId);
      if (!match) return null;

      const seat = match.players.a.userId === userId ? "a" : "b";
      match.players[seat].connected = false;
      match.players[seat].droppedAt = now();

      return match;
    },

    matchFor(userId: string) {
      const matchId = byUser.get(userId);
      return matchId ? (live.get(matchId) ?? null) : null;
    },

    /**
     * Public directory of matches in progress. Carries names, scores and the
     * stake, never a hand, so it is safe to serve to anyone.
     */
    list(): LiveMatchSummary[] {
      return [...live.values()]
        .filter((match) => match.phase !== "over")
        .map((match) => ({
          matchId: match.matchId,
          gameId: match.gameId,
          mode: match.mode,
          currency: match.currency,
          stake: match.stake,
          pot: match.stake * 2,
          round: match.state.round,
          firstTo: match.state.firstTo,
          startedAt: match.startedAt,
          players: [
            {
              name: match.players.a.name,
              seat: "a" as const,
              score: match.state.seats.a.score,
            },
            {
              name: match.players.b.name,
              seat: "b" as const,
              score: match.state.seats.b.score,
            },
          ] as LiveMatchSummary["players"],
        }));
    },

    get(matchId: string) {
      return live.get(matchId) ?? null;
    },

    size() {
      return live.size;
    },

    stop() {
      if (ticker) {
        clearInterval(ticker);
        ticker = null;
      }
      live.clear();
      byUser.clear();
    },

    /** Exposed for tests so the clock can be driven without waiting. */
    tick,
  };
}

export type MatchRuntime = ReturnType<typeof createMatchRuntime>;
