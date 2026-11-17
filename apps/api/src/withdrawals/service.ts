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
import type { AppDatabase } from "../db/client";
import { withTransaction } from "../db/client";
import { completeWithdrawal, lockWithdrawal, returnWithdrawal } from "../economy/wallet";
import { recordAudit } from "../admin/audit";
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
  created_at: string;
  decided_at: string | null;
};

const COLUMNS =
  "w.id, w.user_id, w.network, w.address, w.amount, w.fee, w.payout, w.status, w.payout_tx_id, w.note, w.decided_by, w.created_at, w.decided_at";

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

export function createWithdrawalService(deps: { db: AppDatabase; now?: () => string }) {
  const { db } = deps;
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
      created_at: now(),
      decided_at: null,
    };

    withTransaction(db, () => {
      const waiting = db
        .prepare("SELECT COUNT(*) AS n FROM withdrawals WHERE user_id = ? AND status = 'pending'")
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

  /** Every pending request first, oldest first, then the latest decided ones. */
  /** For admins; the route checks the permission. */
  function adminList(): AdminWithdrawal[] {
    const rows = db
      .prepare(
        `SELECT ${COLUMNS}, u.name AS user_name, a.name AS admin_name
         FROM withdrawals w
         JOIN users u ON u.id = w.user_id
         LEFT JOIN users a ON a.id = w.decided_by
         ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END,
                  CASE w.status WHEN 'pending' THEN w.created_at END ASC,
                  w.decided_at DESC
         LIMIT 200`,
      )
      .all() as (WithdrawalRow & { user_name: string; admin_name: string | null })[];
    return rows.map((row) => ({ ...toRecord(row), userName: row.user_name, decidedBy: row.admin_name }));
  }

  /**
   * An admin marks a request paid (after sending the USDT themselves) or
   * rejects it. Only a pending request can be decided, and only once: the
   * status check is part of the UPDATE, so two admins cannot both decide it.
   */
  function decide(
    admin: { userId: string; ip?: string | null },
    withdrawalId: string,
    decision: WithdrawalDecision,
  ): WithdrawalRecord {
    const adminId = admin.userId;

    const row = db.prepare(`SELECT ${COLUMNS} FROM withdrawals w WHERE w.id = ?`).get(withdrawalId) as
      | WithdrawalRow
      | undefined;
    if (!row) throw notFound("That withdrawal does not exist.");
    if (row.status !== "pending") {
      throw new HttpError(409, "invalid_input", `That withdrawal is already ${row.status}.`);
    }

    const decidedAt = now();
    let txId: string | null = null;
    if (decision.action === "paid") {
      txId = normalizeTxId(row.network, decision.txId) ?? null;
      if (!txId) {
        throw invalidInput(`That is not a ${NETWORK_INFO[row.network].label} transaction ID.`);
      }
    }

    try {
      withTransaction(db, () => {
        const updated = db
          .prepare(
            `UPDATE withdrawals SET status = ?, payout_tx_id = ?, note = ?, decided_by = ?, decided_at = ?
             WHERE id = ? AND status = 'pending'`,
          )
          .run(
            decision.action === "paid" ? "paid" : "rejected",
            txId,
            decision.action === "reject" ? decision.reason : null,
            adminId,
            decidedAt,
            withdrawalId,
          );
        if (Number(updated.changes) !== 1) {
          throw new HttpError(409, "invalid_input", "That withdrawal was decided a moment ago.");
        }

        if (decision.action === "paid") {
          completeWithdrawal(db, { userId: row.user_id, withdrawalId, amount: row.amount, fee: row.fee, now: decidedAt });
        } else {
          returnWithdrawal(db, { userId: row.user_id, withdrawalId, amount: row.amount, now: decidedAt });
        }

        recordAudit(db, {
          adminId,
          action: decision.action === "paid" ? "withdrawal.paid" : "withdrawal.rejected",
          targetUserId: row.user_id,
          details: {
            withdrawalId,
            network: row.network,
            payout: row.payout,
            ...(decision.action === "paid" ? { txId } : { reason: decision.reason }),
          },
          ip: admin.ip,
          now: decidedAt,
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw invalidInput("That transaction ID already settles another withdrawal.");
      }
      throw error;
    }

    const decided = db.prepare(`SELECT ${COLUMNS} FROM withdrawals w WHERE w.id = ?`).get(withdrawalId) as WithdrawalRow;
    return toRecord(decided);
  }

  return { list, request, adminList, decide };
}

export type WithdrawalService = ReturnType<typeof createWithdrawalService>;
