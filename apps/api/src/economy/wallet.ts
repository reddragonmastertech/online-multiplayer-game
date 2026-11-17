import { randomUUID } from "node:crypto";
import { CURRENCY_RULES, currencies, houseCut, type Currency } from "@game-platform/shared";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";

/**
 * Ledger `amount` is always the delta applied to the wallet's **available**
 * balance, so summing a user's entries in one currency reproduces
 * `wallets.available` for that currency. Locking a stake moves value out of
 * available, so it records a negative amount.
 *
 * Every statement here names its currency. Nothing moves value from one
 * currency to another: RAC and USDT are separate wallets that never mix.
 */
export const ledgerKind = {
  signupBonus: "signup_bonus",
  stakeLock: "stake_lock",
  stakeRefund: "stake_refund",
  payout: "payout",
  /** The winner's share of the house cut, taken from their winnings. */
  houseCut: "house_cut",
  /** A correction made by hand with `pnpm balance`, never by the app. */
  adjustment: "adjustment",
  /** An on-chain USDT deposit, after the 1% fee. */
  deposit: "deposit",
  /** A withdrawal request: the amount moves from available to locked. */
  withdrawalLock: "withdrawal_lock",
  /** A rejected withdrawal: the locked amount comes back. */
  withdrawalRefund: "withdrawal_refund",
} as const;

export type LedgerKind = (typeof ledgerKind)[keyof typeof ledgerKind];

export type Balance = {
  available: number;
  locked: number;
};

export type WalletMoveResult =
  | { ok: true; wallet: Balance }
  | { ok: false; reason: "insufficient_balance" | "no_wallet" };

type StakeParams = {
  userId: string;
  currency: Currency;
  stake: number;
  matchId?: string | null;
  now?: string;
};

export function readWallet(db: AppDatabase, userId: string, currency: Currency): Balance | undefined {
  const row = db
    .prepare("SELECT available, locked FROM wallets WHERE user_id = ? AND currency = ?")
    .get(userId, currency) as Balance | undefined;

  return row ? { available: row.available, locked: row.locked } : undefined;
}

function writeLedger(
  db: AppDatabase,
  entry: {
    userId: string;
    currency: Currency;
    kind: LedgerKind;
    amount: number;
    matchId: string | null;
    createdAt: string;
  },
) {
  db.prepare(
    "INSERT INTO ledger_entries (id, user_id, currency, kind, amount, match_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), entry.userId, entry.currency, entry.kind, entry.amount, entry.matchId, entry.createdAt);
}

/**
 * Opens one wallet per currency for a new account, at that currency's signup
 * balance (100 RAC, 0 USDT). Call inside the signup transaction.
 */
export function openWallets(db: AppDatabase, userId: string, now: string) {
  for (const currency of currencies) {
    const opening = CURRENCY_RULES[currency].signupBalance;
    db.prepare("INSERT INTO wallets (user_id, currency, available, locked) VALUES (?, ?, ?, 0)").run(
      userId,
      currency,
      opening,
    );
    if (opening > 0) {
      writeLedger(db, {
        userId,
        currency,
        kind: ledgerKind.signupBonus,
        amount: opening,
        matchId: null,
        createdAt: now,
      });
    }
  }
}

/** Every wallet of a user, in the fixed currency order, with 0 for any missing. */
export function readWallets(db: AppDatabase, userId: string) {
  return currencies.map((currency) => ({
    currency,
    ...(readWallet(db, userId, currency) ?? { available: 0, locked: 0 }),
  }));
}

/**
 * Moves `stake` from available to locked. The `available >= stake` guard
 * lives in the UPDATE itself, so two concurrent joins can never overdraw.
 */
export function lockStake(db: AppDatabase, params: StakeParams): WalletMoveResult {
  const { userId, currency, stake } = params;
  const createdAt = params.now ?? new Date().toISOString();

  if (!readWallet(db, userId, currency)) {
    return { ok: false, reason: "no_wallet" };
  }

  return withTransaction(db, () => {
    const updated = db
      .prepare(
        `UPDATE wallets SET available = available - ?, locked = locked + ?
         WHERE user_id = ? AND currency = ? AND available >= ?`,
      )
      .run(stake, stake, userId, currency, stake);

    if (Number(updated.changes) !== 1) {
      return { ok: false, reason: "insufficient_balance" } as const;
    }

    writeLedger(db, {
      userId,
      currency,
      kind: ledgerKind.stakeLock,
      amount: -stake,
      matchId: params.matchId ?? null,
      createdAt,
    });

    const wallet = readWallet(db, userId, currency);
    return wallet ? ({ ok: true, wallet } as const) : ({ ok: false, reason: "no_wallet" } as const);
  });
}

/**
 * Returns a previously locked stake to available, in full. Used when a player
 * leaves the queue, disconnects while waiting, or a match is abandoned before
 * it settles. There is no house cut on a refund.
 */
export function refundStake(db: AppDatabase, params: StakeParams): WalletMoveResult {
  const { userId, currency, stake } = params;
  const createdAt = params.now ?? new Date().toISOString();

  if (!readWallet(db, userId, currency)) {
    return { ok: false, reason: "no_wallet" };
  }

  return withTransaction(db, () => {
    const updated = db
      .prepare(
        `UPDATE wallets SET available = available + ?, locked = locked - ?
         WHERE user_id = ? AND currency = ? AND locked >= ?`,
      )
      .run(stake, stake, userId, currency, stake);

    if (Number(updated.changes) !== 1) {
      // Nothing locked to give back. Never invent money to paper over this.
      return { ok: false, reason: "insufficient_balance" } as const;
    }

    writeLedger(db, {
      userId,
      currency,
      kind: ledgerKind.stakeRefund,
      amount: stake,
      matchId: params.matchId ?? null,
      createdAt,
    });

    const wallet = readWallet(db, userId, currency);
    return wallet ? ({ ok: true, wallet } as const) : ({ ok: false, reason: "no_wallet" } as const);
  });
}

export type SettlementResult = {
  deltas: { userId: string; delta: number }[];
  houseCut: number;
};

/**
 * Settles a finished match in one transaction.
 *
 * Both players had `stake` locked at join. Each gets that stake unlocked, then
 * the loser's stake moves to the winner, and the house cut (10% of the pot in
 * USDT, nothing in RAC) comes out of the winner's side. With a 1 USDT stake:
 * winner +0.8, loser -1, house +0.2. `locked` returns to zero for both.
 *
 * The unlock, the transfer and the cut are separate ledger lines, so a loss
 * and a cut are visible rows rather than absent ones. The cut is also written
 * to `house_ledger`, which is what the house has earned.
 */
export function settleMatch(
  db: AppDatabase,
  params: {
    matchId: string;
    currency: Currency;
    stake: number;
    winnerUserId: string;
    loserUserId: string;
    now?: string;
  },
): SettlementResult {
  const { matchId, currency, stake, winnerUserId, loserUserId } = params;
  const createdAt = params.now ?? new Date().toISOString();
  const cut = houseCut(currency, stake);

  return withTransaction(db, () => {
    for (const userId of [winnerUserId, loserUserId]) {
      const unlocked = db
        .prepare(
          `UPDATE wallets SET available = available + ?, locked = locked - ?
           WHERE user_id = ? AND currency = ? AND locked >= ?`,
        )
        .run(stake, stake, userId, currency, stake);

      if (Number(unlocked.changes) !== 1) {
        throw new Error(`cannot settle ${matchId}: ${userId} has no ${stake} ${currency} locked`);
      }

      writeLedger(db, { userId, currency, kind: ledgerKind.stakeRefund, amount: stake, matchId, createdAt });
    }

    const taken = db
      .prepare(
        `UPDATE wallets SET available = available - ?
         WHERE user_id = ? AND currency = ? AND available >= ?`,
      )
      .run(stake, loserUserId, currency, stake);

    if (Number(taken.changes) !== 1) {
      throw new Error(`cannot settle ${matchId}: ${loserUserId} cannot cover the stake`);
    }

    db.prepare("UPDATE wallets SET available = available + ? WHERE user_id = ? AND currency = ?").run(
      stake - cut,
      winnerUserId,
      currency,
    );

    writeLedger(db, { userId: loserUserId, currency, kind: ledgerKind.payout, amount: -stake, matchId, createdAt });
    writeLedger(db, { userId: winnerUserId, currency, kind: ledgerKind.payout, amount: stake, matchId, createdAt });

    if (cut > 0) {
      writeLedger(db, { userId: winnerUserId, currency, kind: ledgerKind.houseCut, amount: -cut, matchId, createdAt });
      db.prepare(
        "INSERT INTO house_ledger (id, currency, kind, amount, match_id, created_at) VALUES (?, ?, 'match_cut', ?, ?, ?)",
      ).run(randomUUID(), currency, cut, matchId, createdAt);
    }

    return {
      deltas: [
        { userId: winnerUserId, delta: stake - cut },
        { userId: loserUserId, delta: -stake },
      ],
      houseCut: cut,
    };
  });
}

/**
 * Adds `amount` (negative to take away) to a user's available balance, with a
 * matching `adjustment` ledger row. Only the admin script calls this. Refuses
 * to take a balance below zero; locked stakes are never touched.
 */
export function adjustBalance(
  db: AppDatabase,
  params: { userId: string; currency: Currency; amount: number; now?: string },
): WalletMoveResult {
  const { userId, currency, amount } = params;
  const createdAt = params.now ?? new Date().toISOString();

  if (!readWallet(db, userId, currency)) {
    return { ok: false, reason: "no_wallet" };
  }

  return withTransaction(db, () => {
    const updated = db
      .prepare(
        `UPDATE wallets SET available = available + ?
         WHERE user_id = ? AND currency = ? AND available + ? >= 0`,
      )
      .run(amount, userId, currency, amount);

    if (Number(updated.changes) !== 1) {
      return { ok: false, reason: "insufficient_balance" } as const;
    }

    writeLedger(db, { userId, currency, kind: ledgerKind.adjustment, amount, matchId: null, createdAt });

    const wallet = readWallet(db, userId, currency);
    return wallet ? ({ ok: true, wallet } as const) : ({ ok: false, reason: "no_wallet" } as const);
  });
}

/**
 * Adds a verified deposit to the USDT balance: `credited` to the player, the
 * fee to the house. **Call inside the transaction that inserts the deposit
 * row**, so the money and the record commit or roll back together.
 */
export function creditDeposit(
  db: AppDatabase,
  params: { userId: string; depositId: string; credited: number; fee: number; now: string },
) {
  const updated = db
    .prepare("UPDATE wallets SET available = available + ? WHERE user_id = ? AND currency = 'usdt'")
    .run(params.credited, params.userId);
  if (Number(updated.changes) !== 1) {
    throw new Error(`cannot credit deposit ${params.depositId}: ${params.userId} has no USDT wallet`);
  }

  writeLedger(db, {
    userId: params.userId,
    currency: "usdt",
    kind: ledgerKind.deposit,
    amount: params.credited,
    matchId: null,
    createdAt: params.now,
  });

  if (params.fee > 0) {
    db.prepare(
      "INSERT INTO house_ledger (id, currency, kind, amount, match_id, created_at) VALUES (?, 'usdt', 'deposit_fee', ?, NULL, ?)",
    ).run(randomUUID(), params.fee, params.now);
  }
}

/*
 * Withdrawals. A request moves the amount from available to locked, so it can
 * neither be staked nor requested twice. Paying it removes it from locked for
 * good (it has left on-chain) and books the fee to the house; rejecting it
 * puts it back in available. Each of these must run inside the transaction
 * that changes the withdrawal row, so the money and the status move together.
 */

/** Locks `amount` USDT for a withdrawal. Returns false if it is not available. */
export function lockWithdrawal(db: AppDatabase, params: { userId: string; amount: number; now: string }) {
  const updated = db
    .prepare(
      `UPDATE wallets SET available = available - ?, locked = locked + ?
       WHERE user_id = ? AND currency = 'usdt' AND available >= ?`,
    )
    .run(params.amount, params.amount, params.userId, params.amount);
  if (Number(updated.changes) !== 1) return false;

  writeLedger(db, {
    userId: params.userId,
    currency: "usdt",
    kind: ledgerKind.withdrawalLock,
    amount: -params.amount,
    matchId: null,
    createdAt: params.now,
  });
  return true;
}

/** The USDT has been sent: drop it from locked and book the fee. */
export function completeWithdrawal(
  db: AppDatabase,
  params: { userId: string; withdrawalId: string; amount: number; fee: number; now: string },
) {
  const updated = db
    .prepare("UPDATE wallets SET locked = locked - ? WHERE user_id = ? AND currency = 'usdt' AND locked >= ?")
    .run(params.amount, params.userId, params.amount);
  if (Number(updated.changes) !== 1) {
    throw new Error(`cannot complete withdrawal ${params.withdrawalId}: the amount is not locked`);
  }
  if (params.fee > 0) {
    db.prepare(
      "INSERT INTO house_ledger (id, currency, kind, amount, match_id, created_at) VALUES (?, 'usdt', 'withdrawal_fee', ?, NULL, ?)",
    ).run(randomUUID(), params.fee, params.now);
  }
}

/** The request was rejected: the locked amount goes back to available, in full. */
export function returnWithdrawal(
  db: AppDatabase,
  params: { userId: string; withdrawalId: string; amount: number; now: string },
) {
  const updated = db
    .prepare(
      `UPDATE wallets SET available = available + ?, locked = locked - ?
       WHERE user_id = ? AND currency = 'usdt' AND locked >= ?`,
    )
    .run(params.amount, params.amount, params.userId, params.amount);
  if (Number(updated.changes) !== 1) {
    throw new Error(`cannot return withdrawal ${params.withdrawalId}: the amount is not locked`);
  }
  writeLedger(db, {
    userId: params.userId,
    currency: "usdt",
    kind: ledgerKind.withdrawalRefund,
    amount: params.amount,
    matchId: null,
    createdAt: params.now,
  });
}

/** Everything the house has earned in one currency, in smallest units. */
export function houseTotal(db: AppDatabase, currency: Currency) {
  const row = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM house_ledger WHERE currency = ?")
    .get(currency) as { total: number };
  return row.total;
}
