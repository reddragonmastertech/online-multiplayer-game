import type { MatchHistoryEntry } from "@game-platform/shared";
import type { AppDatabase } from "../db/client";

type HistoryRow = {
  id: string;
  game_id: string;
  mode: string;
  currency: string;
  stake: number;
  status: string;
  winner_seat: string | null;
  finished_at: string;
  your_seat: string;
  your_score: number;
  opponent_name: string;
  opponent_score: number;
};

/**
 * Settled matches for one user, newest first. The net RAC change is read back
 * from the ledger rather than inferred from the result, so the number shown
 * always matches what actually moved.
 */
export function loadMatchHistory(
  db: AppDatabase,
  userId: string,
  limit = 50,
): MatchHistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT m.id, m.game_id, m.mode, m.currency, m.stake, m.status, m.winner_seat,
              m.finished_at,
              mine.seat AS your_seat, mine.score AS your_score,
              theirs.score AS opponent_score, u.name AS opponent_name
       FROM matches m
       JOIN match_players mine ON mine.match_id = m.id AND mine.user_id = ?
       JOIN match_players theirs ON theirs.match_id = m.id AND theirs.user_id != ?
       JOIN users u ON u.id = theirs.user_id
       WHERE m.status IN ('finished', 'forfeited') AND m.finished_at IS NOT NULL
       ORDER BY m.finished_at DESC
       LIMIT ?`,
    )
    .all(userId, userId, limit) as HistoryRow[];

  return rows.map((row) => {
    const won = row.winner_seat === row.your_seat;
    const delta = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM ledger_entries
         WHERE user_id = ? AND match_id = ? AND kind = 'payout'`,
      )
      .get(userId, row.id) as { total: number };

    return {
      matchId: row.id,
      gameId: "rps",
      mode: "first-to-2",
      currency: "rac",
      stake: row.stake,
      result: won ? "win" : "loss",
      reason: row.status === "forfeited" ? "forfeit" : "completed",
      opponentName: row.opponent_name,
      yourScore: row.your_score,
      opponentScore: row.opponent_score,
      delta: delta.total,
      finishedAt: row.finished_at,
    };
  });
}
