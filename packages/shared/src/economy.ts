import { z } from "zod";

export const currencySchema = z.enum(["rac", "usdt"]);
export type Currency = z.infer<typeof currencySchema>;

/** Whole RAC units for this goal (signup 100, stakes 1 / 5 / 10). */
export const racAmountSchema = z.number().int().nonnegative();
export type RacAmount = z.infer<typeof racAmountSchema>;

export const MATCH_RULES = {
  winScore: 2,
  roundSeconds: 10,
  disconnectGraceSeconds: 20,
  revealMs: 1500,
  signupBonusRac: 100,
  racStakes: [1, 5, 10],
} as const;

export const playableCurrencySchema = z.literal("rac");
export type PlayableCurrency = z.infer<typeof playableCurrencySchema>;

export const walletSchema = z.object({
  currency: currencySchema,
  available: racAmountSchema,
  locked: racAmountSchema,
});
export type Wallet = z.infer<typeof walletSchema>;
