import type { CollusionFlag, IpCluster, LinkedAccount, LoginEvent, RiskReport, WinRateFlag } from "@game-platform/shared";
import type { AppDatabase } from "../db/client";

/**
 * Risk flags for admins. Every one is a reason to look, not proof: a family
 * shares a router, and friends play each other. They only ever surface
 * accounts; nothing here blocks or changes anything by itself.
 */

export const RISK_THRESHOLDS = {
  windowDays: 30,
  /** Two players met at least this often in USDT within the window... */
  collusionMinMatches: 5,
  /** ...and one of them won at least this share. */
  collusionMinShare: 0.8,
  /** Rock Paper Scissors is chance: 80%+ over 20 matches happens well under 1% of the time by luck. */
  winRateMinMatches: 20,
  winRateMinShare: 0.8,
} as const;

function since(days: number, now: Date) {
  return new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
}

export function loginsFor(db: AppDatabase, userId: string, limit = 50): LoginEvent[] {
  const rows = db
    .prepare("SELECT ip, user_agent, kind, created_at FROM login_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit) as { ip: string; user_agent: string | null; kind: "signup" | "login"; created_at: string }[];
  return rows.map((row) => ({ ip: row.ip, userAgent: row.user_agent, kind: row.kind, createdAt: row.created_at }));
}

/** Other accounts that signed in from any IP this account used, ever. */
export function linkedAccounts(db: AppDatabase, userId: string): LinkedAccount[] {
  const rows = db
    .prepare(
      `SELECT other.user_id, u.name, u.status, other.ip
       FROM (SELECT DISTINCT ip FROM login_events WHERE user_id = ?) mine
       JOIN (SELECT DISTINCT user_id, ip FROM login_events) other ON other.ip = mine.ip AND other.user_id != ?
       JOIN users u ON u.id = other.user_id
       ORDER BY u.name`,
    )
    .all(userId, userId) as { user_id: string; name: string; status: "active" | "suspended"; ip: string }[];

  const byUser = new Map<string, LinkedAccount>();
  for (const row of rows) {
    const entry = byUser.get(row.user_id) ?? { userId: row.user_id, name: row.name, status: row.status, sharedIps: [] };
    entry.sharedIps.push(row.ip);
    byUser.set(row.user_id, entry);
  }
  return [...byUser.values()];
}

function ipClusters(db: AppDatabase, from: string): IpCluster[] {
  const rows = db
    .prepare(
      `SELECT e.ip, e.user_id, u.name, MAX(e.created_at) AS last_seen
       FROM login_events e JOIN users u ON u.id = e.user_id
       WHERE e.created_at >= ?
         AND e.ip IN (
           SELECT ip FROM login_events WHERE created_at >= ? GROUP BY ip HAVING COUNT(DISTINCT user_id) > 1
         )
       GROUP BY e.ip, e.user_id
       ORDER BY e.ip, u.name`,
    )
    .all(from, from) as { ip: string; user_id: string; name: string; last_seen: string }[];

  const byIp = new Map<string, IpCluster>();
  for (const row of rows) {
    const cluster = byIp.get(row.ip) ?? { ip: row.ip, accounts: [], lastSeen: row.last_seen };
    cluster.accounts.push({ userId: row.user_id, name: row.name });
    if (row.last_seen > cluster.lastSeen) cluster.lastSeen = row.last_seen;
    byIp.set(row.ip, cluster);
  }
  return [...byIp.values()].sort((a, b) => b.accounts.length - a.accounts.length || b.lastSeen.localeCompare(a.lastSeen));
}

function sharesIp(db: AppDatabase, a: string, b: string) {
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM login_events x JOIN login_events y ON x.ip = y.ip WHERE x.user_id = ? AND y.user_id = ? LIMIT 1",
      )
      .get(a, b),
  );
}

function collusion(db: AppDatabase, from: string): CollusionFlag[] {
  // One row per settled USDT match, with the winner and loser.
  const pairs = db
    .prepare(
      `SELECT w.user_id AS winner_id, wu.name AS winner_name, l.user_id AS loser_id, lu.name AS loser_name, m.id AS match_id
       FROM matches m
       JOIN match_players w ON w.match_id = m.id AND w.seat = m.winner_seat
       JOIN match_players l ON l.match_id = m.id AND l.seat != m.winner_seat
       JOIN users wu ON wu.id = w.user_id
       JOIN users lu ON lu.id = l.user_id
       WHERE m.currency = 'usdt' AND m.status IN ('finished', 'forfeited') AND m.finished_at >= ?`,
    )
    .all(from) as { winner_id: string; winner_name: string; loser_id: string; loser_name: string; match_id: string }[];

  const byPair = new Map<
    string,
    { ids: [string, string]; names: Record<string, string>; wins: Record<string, number>; matches: string[] }
  >();
  for (const row of pairs) {
    const ids = [row.winner_id, row.loser_id].sort() as [string, string];
    const key = ids.join("|");
    const pair = byPair.get(key) ?? { ids, names: {}, wins: { [ids[0]]: 0, [ids[1]]: 0 }, matches: [] };
    pair.names[row.winner_id] = row.winner_name;
    pair.names[row.loser_id] = row.loser_name;
    pair.wins[row.winner_id] = (pair.wins[row.winner_id] ?? 0) + 1;
    pair.matches.push(row.match_id);
    byPair.set(key, pair);
  }

  const flags: CollusionFlag[] = [];
  for (const pair of byPair.values()) {
    if (pair.matches.length < RISK_THRESHOLDS.collusionMinMatches) continue;
    const [a, b] = pair.ids;
    const top = (pair.wins[a] ?? 0) >= (pair.wins[b] ?? 0) ? a : b;
    const other = top === a ? b : a;
    const topWins = pair.wins[top] ?? 0;
    if (topWins / pair.matches.length < RISK_THRESHOLDS.collusionMinShare) continue;

    // What actually moved, from the ledger: the winner's net over these matches.
    const placeholders = pair.matches.map(() => "?").join(", ");
    const net = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries
         WHERE user_id = ? AND kind IN ('payout', 'house_cut') AND match_id IN (${placeholders})`,
      )
      .get(top, ...pair.matches) as { total: number };

    flags.push({
      winner: { userId: top, name: pair.names[top] ?? top },
      loser: { userId: other, name: pair.names[other] ?? other },
      matches: pair.matches.length,
      winnerWins: topWins,
      netFlow: net.total,
      sharedIp: sharesIp(db, top, other),
    });
  }
  return flags.sort((x, y) => Number(y.sharedIp) - Number(x.sharedIp) || y.netFlow - x.netFlow);
}

function winRates(db: AppDatabase, from: string): WinRateFlag[] {
  const rows = db
    .prepare(
      `SELECT p.user_id, u.name, COUNT(*) AS matches, SUM(CASE WHEN p.seat = m.winner_seat THEN 1 ELSE 0 END) AS wins
       FROM match_players p
       JOIN matches m ON m.id = p.match_id
       JOIN users u ON u.id = p.user_id
       WHERE m.currency = 'usdt' AND m.status IN ('finished', 'forfeited') AND m.finished_at >= ?
       GROUP BY p.user_id
       HAVING COUNT(*) >= ?`,
    )
    .all(from, RISK_THRESHOLDS.winRateMinMatches) as { user_id: string; name: string; matches: number; wins: number }[];
  return rows
    .map((row) => ({ userId: row.user_id, name: row.name, matches: row.matches, wins: row.wins, winRate: row.wins / row.matches }))
    .filter((row) => row.winRate >= RISK_THRESHOLDS.winRateMinShare)
    .sort((a, b) => b.winRate - a.winRate);
}

export function riskReport(db: AppDatabase, now = new Date()): RiskReport {
  const from = since(RISK_THRESHOLDS.windowDays, now);
  return {
    windowDays: RISK_THRESHOLDS.windowDays,
    ipClusters: ipClusters(db, from),
    collusion: collusion(db, from),
    winRates: winRates(db, from),
    thresholds: {
      collusionMinMatches: RISK_THRESHOLDS.collusionMinMatches,
      collusionMinShare: RISK_THRESHOLDS.collusionMinShare,
      winRateMinMatches: RISK_THRESHOLDS.winRateMinMatches,
      winRateMinShare: RISK_THRESHOLDS.winRateMinShare,
    },
  };
}
