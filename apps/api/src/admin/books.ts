import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  depositNetworks,
  type BackupInfo,
  type DepositNetwork,
  type HouseSweep,
  type ReconciliationReport,
  type SolvencyReport,
} from "@game-platform/shared";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";
import { toUsdtUnits, type ChainClient } from "../deposits/chain";
import { invalidInput } from "../http/errors";
import { recordAudit } from "./audit";

/*
 * Keeping the USDT books honest.
 *
 * Every USDT movement is one of these, and each keeps the equation true:
 *   players (available + locked) + house earnings
 *     = deposits received + admin adjustments − withdrawal payouts sent
 *
 * - deposit: player +credited, house +fee           → both sides +amount
 * - match:   loser −stake, winner +stake − cut, house +cut → no change
 * - withdrawal requested / rejected: available ↔ locked     → no change
 * - withdrawal paid: player locked −amount, house +fee      → both sides −payout
 * - adjustment: player ±amount                              → both sides ±amount
 * - sweep: the owner takes house earnings out. That lowers what the house
 *   holds and what we hold on-chain by the same amount, so it cancels out
 *   here. Sweeps matter to the solvency check, which compares the chain with
 *   what is still owed (players + house − sweeps).
 */

const sum = (db: AppDatabase, sql: string, ...params: string[]) =>
  (db.prepare(sql).get(...params) as { total: number | null }).total ?? 0;

export function reconcileUsdt(db: AppDatabase, now = new Date()): ReconciliationReport {
  const players = sum(db, "SELECT SUM(available + locked) AS total FROM wallets WHERE currency = 'usdt'");
  const house = sum(db, "SELECT SUM(amount) AS total FROM house_ledger WHERE currency = 'usdt'");
  const sweeps = sum(db, "SELECT SUM(amount) AS total FROM house_sweeps WHERE currency = 'usdt'");
  const deposits = sum(db, "SELECT SUM(amount) AS total FROM deposits");
  const adjustments = sum(
    db,
    "SELECT SUM(amount) AS total FROM ledger_entries WHERE currency = 'usdt' AND kind IN ('adjustment', 'signup_bonus')",
  );
  const payouts = sum(db, "SELECT SUM(payout) AS total FROM withdrawals WHERE status = 'paid'");

  const actual = players + house;
  const expected = deposits + adjustments - payouts;
  return {
    ok: actual === expected,
    difference: actual - expected,
    actual: { players, house, sweeps, total: actual },
    expected: { deposits, adjustments, payouts, total: expected },
    checkedAt: now.toISOString(),
  };
}

/**
 * Reads what our receiving wallets really hold on each chain and compares it
 * with what we owe: player balances plus house earnings not yet swept. Money
 * the owner moved to other wallets will show as a shortfall here; the sweep
 * record is how to account for it.
 */
export async function checkSolvency(
  db: AppDatabase,
  chain: ChainClient,
  addresses: Partial<Record<DepositNetwork, string>>,
  now = new Date(),
): Promise<SolvencyReport> {
  const networks = await Promise.all(
    depositNetworks
      .filter((network) => addresses[network])
      .map(async (network) => {
        const address = addresses[network] as string;
        try {
          const raw = await chain.usdtBalance(network, address);
          return { network, address, reachable: true, balance: toUsdtUnits(network, raw) };
        } catch (error) {
          return { network, address, reachable: false, balance: null, error: (error as Error).message };
        }
      }),
  );
  const onChain = networks.reduce((total, row) => total + (row.balance ?? 0), 0);
  const players = sum(db, "SELECT SUM(available + locked) AS total FROM wallets WHERE currency = 'usdt'");
  const house =
    sum(db, "SELECT SUM(amount) AS total FROM house_ledger WHERE currency = 'usdt'") -
    sum(db, "SELECT SUM(amount) AS total FROM house_sweeps WHERE currency = 'usdt'");
  return {
    networks,
    onChain,
    owed: { players, house, total: players + house },
    margin: onChain - (players + house),
    checkedAt: now.toISOString(),
  };
}

/** House earnings not yet taken out. */
export function houseAvailable(db: AppDatabase) {
  return (
    sum(db, "SELECT SUM(amount) AS total FROM house_ledger WHERE currency = 'usdt'") -
    sum(db, "SELECT SUM(amount) AS total FROM house_sweeps WHERE currency = 'usdt'")
  );
}

/** Records the owner taking house earnings out. Never more than the house holds. */
export function recordSweep(
  db: AppDatabase,
  actor: { userId: string; ip?: string | null },
  amount: number,
  note: string,
  now = new Date(),
) {
  withTransaction(db, () => {
    const available = houseAvailable(db);
    if (amount > available) throw invalidInput("That is more than the house has earned and not yet swept.");
    const id = randomUUID();
    db.prepare("INSERT INTO house_sweeps (id, currency, amount, note, admin_id, created_at) VALUES (?, 'usdt', ?, ?, ?, ?)").run(
      id,
      amount,
      note,
      actor.userId,
      now.toISOString(),
    );
    recordAudit(db, { adminId: actor.userId, action: "house.swept", details: { amount, note, sweepId: id }, ip: actor.ip });
  });
}

export function listSweeps(db: AppDatabase): HouseSweep[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.amount, s.note, u.name AS admin_name, s.created_at FROM house_sweeps s
       JOIN users u ON u.id = s.admin_id ORDER BY s.created_at DESC LIMIT 100`,
    )
    .all() as { id: string; amount: number; note: string; admin_name: string; created_at: string }[];
  return rows.map((row) => ({ id: row.id, amount: row.amount, note: row.note, adminName: row.admin_name, createdAt: row.created_at }));
}

/* ---------- Backups ---------- */

export type BackupSettings = { dir: string; keep: number };

/**
 * A consistent copy of the live database, taken with SQLite's `VACUUM INTO`
 * while the server keeps running. Old copies beyond `keep` are deleted.
 */
export function createBackup(db: AppDatabase, settings: BackupSettings, adminId: string | null = null, now = new Date()): BackupInfo {
  mkdirSync(settings.dir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const file = join(settings.dir, `game-${stamp}.db`);
  rmSync(file, { force: true });
  // The path is ours, not user input; quotes are doubled for SQL anyway.
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const size = statSync(file).size;
  db.prepare("INSERT INTO backups (id, file, size, admin_id, created_at) VALUES (?, ?, ?, ?, ?)").run(
    randomUUID(),
    file,
    size,
    adminId,
    now.toISOString(),
  );
  if (adminId) recordAudit(db, { adminId, action: "system.backup", details: { file, size } });

  const copies = readdirSync(settings.dir)
    .filter((name) => /^game-\d{8}-\d{6}\.db$/.test(name))
    .sort()
    .reverse();
  for (const old of copies.slice(settings.keep)) rmSync(join(settings.dir, old), { force: true });

  return { file, size, createdAt: now.toISOString(), by: null };
}

export function lastBackup(db: AppDatabase): BackupInfo | null {
  const row = db
    .prepare(
      `SELECT b.file, b.size, b.created_at, u.name AS admin_name FROM backups b
       LEFT JOIN users u ON u.id = b.admin_id ORDER BY b.created_at DESC LIMIT 1`,
    )
    .get() as { file: string; size: number; created_at: string; admin_name: string | null } | undefined;
  return row ? { file: row.file, size: row.size, createdAt: row.created_at, by: row.admin_name } : null;
}
