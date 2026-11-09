import { randomUUID } from "node:crypto";
import {
  MATCH_RULES,
  type MatchSummary,
  type PlayableCurrency,
  type PlayableGameId,
  type PlayableRpsMode,
  type Seat,
} from "@game-platform/shared";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";
import { refundRacStake } from "../economy/wallet";

export function matchRoom(matchId: string) {
  return `match:${matchId}`;
}

export type SeatAssignment = {
  seat: Seat;
  userId: string;
  name: string;
};

export type MatchRecordParams = {
  gameId: PlayableGameId;
  mode: PlayableRpsMode;
  currency: PlayableCurrency;
  stake: number;
  players: [SeatAssignment, SeatAssignment];
  now?: string;
};

/**
 * Writes the match and its two seats. The match starts `queued`; Step 7's
 * server loop is what flips it to `live` and plays the rounds.
 */
export function createQueuedMatch(db: AppDatabase, params: MatchRecordParams) {
  const matchId = randomUUID();
  const createdAt = params.now ?? new Date().toISOString();

  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO matches (id, game_id, mode, currency, stake, status, round, winner_seat, created_at, finished_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 1, NULL, ?, NULL)`,
    ).run(matchId, params.gameId, params.mode, params.currency, params.stake, createdAt);

    for (const player of params.players) {
      db.prepare(
        "INSERT INTO match_players (match_id, user_id, seat, score) VALUES (?, ?, ?, 0)",
      ).run(matchId, player.userId, player.seat);
    }
  });

  return { matchId, createdAt };
}

export function toMatchSummary(
  params: MatchRecordParams & { matchId: string; status?: MatchSummary["status"] },
): MatchSummary {
  const [first, second] = params.players;
  const seated = first.seat === "a" ? [first, second] : [second, first];

  return {
    matchId: params.matchId,
    gameId: params.gameId,
    mode: params.mode,
    currency: params.currency,
    stake: params.stake,
    pot: params.stake * 2,
    status: params.status ?? "queued",
    round: 1,
    firstTo: MATCH_RULES.winScore,
    secondsLeft: MATCH_RULES.roundSeconds,
    players: [
      {
        userId: seated[0]!.userId,
        name: seated[0]!.name,
        seat: seated[0]!.seat,
        score: 0,
        move: { status: "choosing" },
      },
      {
        userId: seated[1]!.userId,
        name: seated[1]!.name,
        seat: seated[1]!.seat,
        score: 0,
        move: { status: "choosing" },
      },
    ],
  };
}

type UnsettledRow = {
  id: string;
  stake: number;
  user_id: string;
};

/**
 * Matchmaking and live match state are in-memory, so any match left `queued` or
 * `live` by a previous process can never resume. Refund the locked stakes and
 * cancel it, otherwise a restart would strand a tester's RAC in `locked`.
 */
export function releaseUnsettledMatches(db: AppDatabase, now = new Date().toISOString()) {
  const rows = db
    .prepare(
      `SELECT m.id, m.stake, p.user_id
       FROM matches m
       JOIN match_players p ON p.match_id = m.id
       WHERE m.status IN ('queued', 'live')`,
    )
    .all() as UnsettledRow[];

  const matchIds = new Set(rows.map((row) => row.id));
  let refunded = 0;

  for (const row of rows) {
    const result = refundRacStake(db, {
      userId: row.user_id,
      stake: row.stake,
      matchId: row.id,
      now,
    });

    if (result.ok) refunded += 1;
  }

  for (const matchId of matchIds) {
    db.prepare("UPDATE matches SET status = 'cancelled', finished_at = ? WHERE id = ?").run(
      now,
      matchId,
    );
  }

  return { matches: matchIds.size, refunded };
}
