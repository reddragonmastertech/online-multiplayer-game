import { z } from "zod";
import { isoDateSchema } from "./common";
import { depositNetworkSchema } from "./deposit";
import { USDT_UNIT, amountSchema } from "./economy";

/**
 * USDT withdrawals (Roadmap 4.2 part C), approved by hand. The player asks;
 * the amount is locked at once so it cannot be staked; an admin sends the
 * USDT from their own wallet and marks the request paid, or rejects it and
 * the amount goes back. The server never holds a key or sends money itself.
 *
 * The payout goes to the wallet the player saved for deposits on that
 * network, so there is one wallet per network per player for both ways.
 */

export const WITHDRAWAL_RULES = {
  /** Smallest request, in 0.000001 USDT. */
  minimum: 10 * USDT_UNIT,
  /** Fee in basis points, taken from the amount requested: 100 = 1%. */
  feeBps: 100,
  /** How many requests one player may have waiting at once. */
  maxPending: 1,
} as const;

/** The fee on a request of `amount`, rounded down in the player's favour. */
export function withdrawalFee(amount: number) {
  return Math.floor((amount * WITHDRAWAL_RULES.feeBps) / 10_000);
}

export const withdrawalStatusSchema = z.enum(["pending", "paid", "rejected"]);
export type WithdrawalStatus = z.infer<typeof withdrawalStatusSchema>;

export const withdrawalRequestSchema = z.object({
  network: depositNetworkSchema,
  /** In 0.000001 USDT. */
  amount: amountSchema,
});
export type WithdrawalRequest = z.infer<typeof withdrawalRequestSchema>;

export const withdrawalRecordSchema = z.object({
  id: z.string().min(1),
  network: depositNetworkSchema,
  address: z.string().min(1),
  /** Taken from the balance. */
  amount: amountSchema,
  fee: amountSchema,
  /** What the admin sends on-chain: amount − fee. */
  payout: amountSchema,
  status: withdrawalStatusSchema,
  payoutTxId: z.string().nullable(),
  /** The reason given when a request is rejected. */
  note: z.string().nullable(),
  createdAt: isoDateSchema,
  decidedAt: isoDateSchema.nullable(),
});
export type WithdrawalRecord = z.infer<typeof withdrawalRecordSchema>;

export const withdrawalListSchema = z.object({
  withdrawals: z.array(withdrawalRecordSchema),
});
export type WithdrawalList = z.infer<typeof withdrawalListSchema>;

export const adminWithdrawalSchema = withdrawalRecordSchema.extend({
  userName: z.string().min(1),
  decidedBy: z.string().nullable(),
});
export type AdminWithdrawal = z.infer<typeof adminWithdrawalSchema>;

export const adminWithdrawalListSchema = z.object({
  withdrawals: z.array(adminWithdrawalSchema),
});
export type AdminWithdrawalList = z.infer<typeof adminWithdrawalListSchema>;

export const withdrawalDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("paid"), txId: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(1).max(200) }),
]);
export type WithdrawalDecision = z.infer<typeof withdrawalDecisionSchema>;
