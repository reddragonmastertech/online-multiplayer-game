import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";

/**
 * Ledger `amount` is always the delta applied to the wallet's **available**
 * balance, so summing a user's entries reproduces `wallets.available`.
 * Locking a stake moves RAC out of available, so it records a negative amount.
 */
export const ledgerKind = {
  signupBonus: "signup_bonus",
  stakeLock: "stake_lock",
  stakeRefund: "stake_refund",
  payout: "payout",
} as const;

export type LedgerKind = (typeof ledgerKind)[keyof typeof ledgerKind];

export type RacWallet = {
  available: number;
  locked: number;
};

type WalletRow = {
  available: number;
  locked: number;
};

export type WalletMoveResult =
  | { ok: true; wallet: RacWallet }
  | { ok: false; reason: "insufficient_balance" | "no_wallet" };

export function readRacWallet(db: AppDatabase, userId: string): RacWallet | undefined {
  const row = db
    .prepare("SELECT available, locked FROM wallets WHERE user_id = ? AND currency = 'rac'")
    .get(userId) as WalletRow | undefined;

  return row ? { available: row.available, locked: row.locked } : undefined;
}

function writeLedger(
  db: AppDatabase,
  entry: { userId: string; kind: LedgerKind; amount: number; matchId: string | null; createdAt: string },
) {
  db.prepare(
    "INSERT INTO ledger_entries (id, user_id, currency, kind, amount, match_id, created_at) VALUES (?, ?, 'rac', ?, ?, ?, ?)",
  ).run(randomUUID(), entry.userId, entry.kind, entry.amount, entry.matchId, entry.createdAt);
}

/**
 * Moves `stake` RAC from available to locked. The `available >= stake` guard
 * lives in the UPDATE itself, so two concurrent joins can never overdraw.
 */
export function lockRacStake(
  db: AppDatabase,
  params: { userId: string; stake: number; matchId?: string | null; now?: string },
): WalletMoveResult {
  const { userId, stake } = params;
  const createdAt = params.now ?? new Date().toISOString();

  if (!readRacWallet(db, userId)) {
    return { ok: false, reason: "no_wallet" };
  }

  return withTransaction(db, () => {
    const updated = db
      .prepare(
        `UPDATE wallets SET available = available - ?, locked = locked + ?
         WHERE user_id = ? AND currency = 'rac' AND available >= ?`,
      )
      .run(stake, stake, userId, stake);

    if (Number(updated.changes) !== 1) {
      return { ok: false, reason: "insufficient_balance" } as const;
    }

    writeLedger(db, {
      userId,
      kind: ledgerKind.stakeLock,
      amount: -stake,
      matchId: params.matchId ?? null,
      createdAt,
    });

    const wallet = readRacWallet(db, userId);
    return wallet ? ({ ok: true, wallet } as const) : ({ ok: false, reason: "no_wallet" } as const);
  });
}

/**
 * Returns a previously locked stake to available. Used when a player leaves the
 * queue, disconnects while waiting, or a match is abandoned before it settles.
 */
export function refundRacStake(
  db: AppDatabase,
  params: { userId: string; stake: number; matchId?: string | null; now?: string },
): WalletMoveResult {
  const { userId, stake } = params;
  const createdAt = params.now ?? new Date().toISOString();

  if (!readRacWallet(db, userId)) {
    return { ok: false, reason: "no_wallet" };
  }

  return withTransaction(db, () => {
    const updated = db
      .prepare(
        `UPDATE wallets SET available = available + ?, locked = locked - ?
         WHERE user_id = ? AND currency = 'rac' AND locked >= ?`,
      )
      .run(stake, stake, userId, stake);

    if (Number(updated.changes) !== 1) {
      // Nothing locked to give back. Never invent RAC to paper over this.
      return { ok: false, reason: "insufficient_balance" } as const;
    }

    writeLedger(db, {
      userId,
      kind: ledgerKind.stakeRefund,
      amount: stake,
      matchId: params.matchId ?? null,
      createdAt,
    });

    const wallet = readRacWallet(db, userId);
    return wallet ? ({ ok: true, wallet } as const) : ({ ok: false, reason: "no_wallet" } as const);
  });
}

export type SettlementResult = {
  deltas: { userId: string; delta: number }[];
};

/**
 * Settles a finished match in one transaction.
 *
 * Both players had `stake` locked at join. Each gets that stake unlocked, then
 * the loser's stake moves to the winner. Net: winner +stake, loser -stake, and
 * `locked` returns to zero for both. The unlock and the transfer are separate
 * ledger lines so a loss is a visible row rather than an absent one.
 */
export function settleRacMatch(
  db: AppDatabase,
  params: {
    matchId: string;
    stake: number;
    winnerUserId: string;
    loserUserId: string;
    now?: string;
  },
): SettlementResult {
  const { matchId, stake, winnerUserId, loserUserId } = params;
  const createdAt = params.now ?? new Date().toISOString();

  return withTransaction(db, () => {
    for (const userId of [winnerUserId, loserUserId]) {
      const unlocked = db
        .prepare(
          `UPDATE wallets SET available = available + ?, locked = locked - ?
           WHERE user_id = ? AND currency = 'rac' AND locked >= ?`,
        )
        .run(stake, stake, userId, stake);

      if (Number(unlocked.changes) !== 1) {
        throw new Error(`cannot settle ${matchId}: ${userId} has no ${stake} RAC locked`);
      }

      writeLedger(db, {
        userId,
        kind: ledgerKind.stakeRefund,
        amount: stake,
        matchId,
        createdAt,
      });
    }

    const taken = db
      .prepare(
        `UPDATE wallets SET available = available - ?
         WHERE user_id = ? AND currency = 'rac' AND available >= ?`,
      )
      .run(stake, loserUserId, stake);

    if (Number(taken.changes) !== 1) {
      throw new Error(`cannot settle ${matchId}: ${loserUserId} cannot cover the stake`);
    }

    db.prepare(
      "UPDATE wallets SET available = available + ? WHERE user_id = ? AND currency = 'rac'",
    ).run(stake, winnerUserId);

    writeLedger(db, {
      userId: loserUserId,
      kind: ledgerKind.payout,
      amount: -stake,
      matchId,
      createdAt,
    });
    writeLedger(db, {
      userId: winnerUserId,
      kind: ledgerKind.payout,
      amount: stake,
      matchId,
      createdAt,
    });

    return {
      deltas: [
        { userId: winnerUserId, delta: stake },
        { userId: loserUserId, delta: -stake },
      ],
    };
  });
}
