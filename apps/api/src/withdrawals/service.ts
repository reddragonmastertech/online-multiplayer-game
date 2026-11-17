import { randomUUID } from "node:crypto";
import {
  NETWORK_INFO,
  WITHDRAWAL_RULES,
  formatAmount,
  normalizeTxId,
  withdrawalFee,
  type AdminWithdrawal,
  type DepositNetwork,
  type WithdrawalDecision,
  type WithdrawalRecord,
  type WithdrawalStatus,
} from "@game-platform/shared";
import { recordAudit } from "../admin/audit";
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";
import { ChainUnavailableError, USDT_CONTRACTS, canonicalAddress, toUsdtUnits, type ChainClient } from "../deposits/chain";
import { completeWithdrawal, lockWithdrawal, returnWithdrawal } from "../economy/wallet";
import { HttpError, invalidInput, notFound } from "../http/errors";

type WithdrawalRow = {
  id: string;
  user_id: string;
  network: DepositNetwork;
  address: string;
  amount: number;
  fee: number;
  payout: number;
  status: WithdrawalStatus;
  payout_tx_id: string | null;
  note: string | null;
  decided_by: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  decided_at: string | null;
};

const COLUMNS =
  "w.id, w.user_id, w.network, w.address, w.amount, w.fee, w.payout, w.status, w.payout_tx_id, w.note, w.decided_by, w.claimed_by, w.claimed_at, w.created_at, w.decided_at";

function toRecord(row: WithdrawalRow): WithdrawalRecord {
  return {
    id: row.id,
    network: row.network,
    address: row.address,
    amount: row.amount,
    fee: row.fee,
    payout: row.payout,
    status: row.status,
    payoutTxId: row.payout_tx_id,
    note: row.note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

const conflict = (message: string) => new HttpError(409, "invalid_input", message);

export function createWithdrawalService(deps: { db: AppDatabase; chain: ChainClient; now?: () => string }) {
  const { db, chain } = deps;
  const now = deps.now ?? (() => new Date().toISOString());

  function list(userId: string): WithdrawalRecord[] {
    const rows = db
      .prepare(`SELECT ${COLUMNS} FROM withdrawals w WHERE w.user_id = ? ORDER BY w.created_at DESC LIMIT 50`)
      .all(userId) as WithdrawalRow[];
    return rows.map(toRecord);
  }

  /**
   * A player asks to withdraw `amount` to the wallet they saved for that
   * network. The amount is locked straight away, in the same transaction as
   * the request, so it cannot be staked or asked for twice.
   */
  function request(userId: string, network: DepositNetwork, amount: number): WithdrawalRecord {
    const label = NETWORK_INFO[network].label;
    const frozen = db.prepare("SELECT usdt_frozen FROM users WHERE id = ?").get(userId) as { usdt_frozen: number } | undefined;
    if (frozen?.usdt_frozen === 1) {
      throw new HttpError(403, "forbidden", "Your USDT is frozen. Contact support.");
    }
    if (!Number.isSafeInteger(amount) || amount < WITHDRAWAL_RULES.minimum) {
      throw invalidInput(`The minimum withdrawal is ${formatAmount("usdt", WITHDRAWAL_RULES.minimum)}.`);
    }

    const wallet = db
      .prepare("SELECT address FROM deposit_wallets WHERE user_id = ? AND network = ?")
      .get(userId, network) as { address: string } | undefined;
    if (!wallet) {
      throw invalidInput(`Save your ${label} wallet under Top up first. Withdrawals are paid to it.`);
    }

    const fee = withdrawalFee(amount);
    const row: WithdrawalRow = {
      id: randomUUID(),
      user_id: userId,
      network,
      address: wallet.address,
      amount,
      fee,
      payout: amount - fee,
      status: "pending",
      payout_tx_id: null,
      note: null,
      decided_by: null,
      claimed_by: null,
      claimed_at: null,
      created_at: now(),
      decided_at: null,
    };

    withTransaction(db, () => {
      const waiting = db
        .prepare("SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ? AND status IN ('pending', 'processing')")
        .get(userId) as { n: number };
      if (waiting.n >= WITHDRAWAL_RULES.maxPending) {
        throw new HttpError(
          409,
          "withdrawal_pending",
          "You already have a withdrawal waiting. Wait for it to be paid or rejected.",
        );
      }

      if (!lockWithdrawal(db, { userId, amount, now: row.created_at })) {
        throw new HttpError(
          400,
          "insufficient_balance",
          `You do not have ${formatAmount("usdt", amount)} available. Stakes in a match or queue are locked.`,
        );
      }

      db.prepare(
        `INSERT INTO withdrawals (id, user_id, network, address, amount, fee, payout, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).run(row.id, userId, network, row.address, amount, fee, row.payout, row.created_at);
    });

    return toRecord(row);
  }

  /** Waiting and claimed requests first, oldest first, then the latest decided ones. For admins. */
  function adminList(): AdminWithdrawal[] {
    const rows = db
      .prepare(
        `SELECT ${COLUMNS}, u.name AS user_name, a.name AS admin_name, c.name AS claimer_name
         FROM withdrawals w
         JOIN users u ON u.id = w.user_id
         LEFT JOIN users a ON a.id = w.decided_by
         LEFT JOIN users c ON c.id = w.claimed_by
         ORDER BY CASE WHEN w.status IN ('pending', 'processing') THEN 0 ELSE 1 END,
                  CASE WHEN w.status IN ('pending', 'processing') THEN w.created_at END ASC,
                  w.decided_at DESC
         LIMIT 200`,
      )
      .all() as (WithdrawalRow & { user_name: string; admin_name: string | null; claimer_name: string | null })[];
    return rows.map((row) => ({
      ...toRecord(row),
      userId: row.user_id,
      userName: row.user_name,
      decidedBy: row.admin_name,
      claimedById: row.claimed_by,
      claimedBy: row.claimer_name,
      claimedAt: row.claimed_at,
    }));
  }

  function load(withdrawalId: string) {
    const row = db.prepare(`SELECT ${COLUMNS} FROM withdrawals w WHERE w.id = ?`).get(withdrawalId) as WithdrawalRow | undefined;
    if (!row) throw notFound("That withdrawal does not exist.");
    return row;
  }

  /**
   * Reads the payout transaction from the chain and refuses it unless it
   * succeeded and sent at least the payout in real USDT to the player's
   * address. This stops a typo, or the wrong transaction, from closing a
   * request that was never really paid.
   */
  async function checkPayout(row: WithdrawalRow, txId: string) {
    const info = NETWORK_INFO[row.network];
    let lookup;
    try {
      lookup = await chain.lookup(row.network, txId);
    } catch (error) {
      if (error instanceof ChainUnavailableError) {
        throw conflict(`We could not reach the ${info.chain} network to check the payout. Try again in a minute.`);
      }
      throw error;
    }
    if (lookup.status === "not_found") {
      throw conflict(`That transaction is not on the ${info.chain} network yet. Wait a moment and try again.`);
    }
    if (lookup.status === "failed") throw invalidInput("That transaction failed on the chain, so nothing was sent.");

    const usdt = canonicalAddress(row.network, USDT_CONTRACTS[row.network].contract);
    const to = canonicalAddress(row.network, row.address);
    const sent = lookup.transfers
      .filter((transfer) => transfer.contract === usdt && transfer.to === to)
      .reduce((sum, transfer) => sum + transfer.amount, 0n);
    const units = toUsdtUnits(row.network, sent);
    if (units === 0) {
      throw invalidInput(`That transaction sent no USDT to the player's address ${row.address}.`);
    }
    if (units < row.payout) {
      throw invalidInput(
        `That transaction sent ${formatAmount("usdt", units)}, but the payout is ${formatAmount("usdt", row.payout)}.`,
      );
    }
    return units;
  }

  /**
   * The admin side of a withdrawal:
   * - **claim**: "I am sending this one". Only a waiting request can be
   *   claimed, by one admin at a time, so two admins never both pay it.
   * - **release**: give up a claim (the claimer, or an owner).
   * - **paid**: only the claimer, and only after the chain confirms the
   *   payout reached the player's address.
   * - **reject**: a waiting request, or one you have claimed. The full amount
   *   goes back to the player.
   * Every status check sits inside the UPDATE, so a race cannot slip past it.
   */
  async function decide(
    admin: { userId: string; role?: string; ip?: string | null },
    withdrawalId: string,
    decision: WithdrawalDecision,
  ): Promise<WithdrawalRecord> {
    const adminId = admin.userId;
    const row = load(withdrawalId);
    const at = now();
    const audit = (action: string, details: Record<string, unknown>) =>
      recordAudit(db, {
        adminId,
        action,
        targetUserId: row.user_id,
        details: { withdrawalId, network: row.network, payout: row.payout, ...details },
        ip: admin.ip,
        now: at,
      });

    if (decision.action === "claim") {
      withTransaction(db, () => {
        const updated = db
          .prepare("UPDATE withdrawals SET status = 'processing', claimed_by = ?, claimed_at = ? WHERE id = ? AND status = 'pending'")
          .run(adminId, at, withdrawalId);
        if (Number(updated.changes) !== 1) {
          throw conflict(
            row.status === "processing" ? "Another admin is already sending this one." : `That withdrawal is already ${row.status}.`,
          );
        }
        audit("withdrawal.claimed", {});
      });
      return toRecord(load(withdrawalId));
    }

    if (decision.action === "release") {
      withTransaction(db, () => {
        const updated = db
          .prepare(
            `UPDATE withdrawals SET status = 'pending', claimed_by = NULL, claimed_at = NULL
             WHERE id = ? AND status = 'processing' AND (claimed_by = ? OR ? = 'owner')`,
          )
          .run(withdrawalId, adminId, admin.role ?? "");
        if (Number(updated.changes) !== 1) throw conflict("Only the admin who claimed it, or an owner, can release it.");
        audit("withdrawal.released", { claimedBy: row.claimed_by });
      });
      return toRecord(load(withdrawalId));
    }

    if (decision.action === "paid") {
      if (row.status !== "processing" || row.claimed_by !== adminId) {
        throw conflict("Claim the withdrawal first; only the admin who claimed it can mark it paid.");
      }
      const txId = normalizeTxId(row.network, decision.txId);
      if (!txId) throw invalidInput(`That is not a ${NETWORK_INFO[row.network].label} transaction ID.`);
      const sent = await checkPayout(row, txId);

      try {
        withTransaction(db, () => {
          const updated = db
            .prepare(
              `UPDATE withdrawals SET status = 'paid', payout_tx_id = ?, decided_by = ?, decided_at = ?
               WHERE id = ? AND status = 'processing' AND claimed_by = ?`,
            )
            .run(txId, adminId, at, withdrawalId, adminId);
          if (Number(updated.changes) !== 1) throw conflict("That withdrawal changed a moment ago. Reload it.");
          completeWithdrawal(db, { userId: row.user_id, withdrawalId, amount: row.amount, fee: row.fee, now: at });
          audit("withdrawal.paid", { txId, sentOnChain: sent });
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
          throw invalidInput("That transaction ID already settles another withdrawal.");
        }
        throw error;
      }
      return toRecord(load(withdrawalId));
    }

    const reason = decision.reason;
    withTransaction(db, () => {
      const updated = db
        .prepare(
          `UPDATE withdrawals SET status = 'rejected', note = ?, decided_by = ?, decided_at = ?
           WHERE id = ? AND (status = 'pending' OR (status = 'processing' AND claimed_by = ?))`,
        )
        .run(reason, adminId, at, withdrawalId, adminId);
      if (Number(updated.changes) !== 1) {
        throw conflict(row.status === "processing" ? "Another admin has claimed this one." : `That withdrawal is already ${row.status}.`);
      }
      returnWithdrawal(db, { userId: row.user_id, withdrawalId, amount: row.amount, now: at });
      audit("withdrawal.rejected", { reason });
    });
    return toRecord(load(withdrawalId));
  }

  return { list, request, adminList, decide };
}

export type WithdrawalService = ReturnType<typeof createWithdrawalService>;
