import type { AdminLive, AdminMatchDetail, AdminMatchSummary, Currency } from "@game-platform/shared";
import type { AppDatabase } from "../db/client";
import { notFound } from "../http/errors";
import type { QueueTicket } from "../match/queue";

type MatchRow = {
  id: string;
  currency: Currency;
  stake: number;
  status: string;
  round: number;
  winner_seat: "a" | "b" | null;
  created_at: string;
  finished_at: string | null;
};

/** Matches and the queue, for the admin area. Never exposes a hand in a live round. */
export function createAdminMatches(deps: {
  db: AppDatabase;
  isLive: (matchId: string) => boolean;
  liveIds: () => string[];
  tickets: () => QueueTicket[];
}) {
  const { db } = deps;

  function playersOf(matchId: string) {
    return db
      .prepare(
        `SELECT p.user_id, u.name, p.seat, p.score FROM match_players p JOIN users u ON u.id = p.user_id
         WHERE p.match_id = ? ORDER BY p.seat`,
      )
      .all(matchId)
      .map((row) => {
        const player = row as { user_id: string; name: string; seat: "a" | "b"; score: number };
        return { userId: player.user_id, name: player.name, seat: player.seat, score: player.score };
      });
  }

  function toSummary(row: MatchRow): AdminMatchSummary {
    return {
      id: row.id,
      currency: row.currency,
      stake: row.stake,
      status: row.status,
      round: row.round,
      winnerSeat: row.winner_seat,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
      players: playersOf(row.id),
      live: deps.isLive(row.id),
    };
  }

  const COLUMNS = "m.id, m.currency, m.stake, m.status, m.round, m.winner_seat, m.created_at, m.finished_at";

  /** Newest first, by match ID or a player's name; empty lists the latest 100. */
  function search(query: string): AdminMatchSummary[] {
    const q = query.trim();
    const rows = db
      .prepare(
        `SELECT ${COLUMNS} FROM matches m
         WHERE ? = '' OR m.id = ?
            OR EXISTS (SELECT 1 FROM match_players p JOIN users u ON u.id = p.user_id WHERE p.match_id = m.id AND u.name = ?)
         ORDER BY m.created_at DESC LIMIT 100`,
      )
      .all(q, q, q) as MatchRow[];
    return rows.map(toSummary);
  }

  function detail(matchId: string): AdminMatchDetail {
    const row = db.prepare(`SELECT ${COLUMNS} FROM matches m WHERE m.id = ?`).get(matchId) as MatchRow | undefined;
    if (!row) throw notFound("That match does not exist.");
    // Rounds are stored when they resolve, so a hand still being chosen never appears here.
    const rounds = (
      db
        .prepare("SELECT round, hand_a, hand_b, outcome, created_at FROM match_rounds WHERE match_id = ? ORDER BY round")
        .all(matchId) as { round: number; hand_a: string | null; hand_b: string | null; outcome: string | null; created_at: string }[]
    ).map((round) => ({
      round: round.round,
      handA: round.hand_a,
      handB: round.hand_b,
      outcome: round.outcome,
      createdAt: round.created_at,
    }));
    return { ...toSummary(row), rounds };
  }

  function live(): AdminLive {
    const ids = deps.liveIds();
    const matches = ids
      .map((id) => db.prepare(`SELECT ${COLUMNS} FROM matches m WHERE m.id = ?`).get(id) as MatchRow | undefined)
      .filter((row): row is MatchRow => Boolean(row))
      .map(toSummary);
    const queue = deps.tickets().map((ticket) => ({
      userId: ticket.userId,
      name: ticket.name,
      currency: ticket.entry.currency,
      stake: ticket.entry.stake,
      queuedAt: ticket.queuedAt,
    }));
    return { matches, queue };
  }

  return { search, detail, live };
}

export type AdminMatches = ReturnType<typeof createAdminMatches>;
