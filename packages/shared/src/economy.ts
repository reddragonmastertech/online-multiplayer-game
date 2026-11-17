import { z } from "zod";

/**
 * Two currencies that never mix. RAC is the free version: play-only credit
 * with no cash value. USDT is the paid version: deposited on-chain. Nothing
 * converts or transfers one into the other.
 */
export const currencySchema = z.enum(["rac", "usdt"]);
export type Currency = z.infer<typeof currencySchema>;

/**
 * Every amount on the wire and in the database is a whole number of the
 * currency's smallest unit: 1 RAC, or 0.000001 USDT (the token's own
 * precision). Never a decimal, so rounding can never create or lose money.
 */
export const amountSchema = z.number().int().nonnegative();
export type Amount = z.infer<typeof amountSchema>;

/** Smallest units per whole USDT. */
export const USDT_UNIT = 1_000_000;

export const CURRENCY_RULES = {
  rac: {
    label: "RAC",
    unit: 1,
    decimals: 0,
    stakes: [1, 5, 10],
    /** House cut of the pot, in basis points (1/100 of a percent). */
    houseCutBps: 0,
    signupBalance: 100,
    cpuPractice: true,
  },
  usdt: {
    label: "USDT",
    unit: USDT_UNIT,
    decimals: 6,
    stakes: [0.2, 0.5, 1, 2, 5, 10].map((whole) => Math.round(whole * USDT_UNIT)),
    houseCutBps: 1000,
    signupBalance: 0,
    cpuPractice: false,
  },
} as const satisfies Record<
  Currency,
  {
    label: string;
    unit: number;
    decimals: number;
    stakes: readonly number[];
    houseCutBps: number;
    signupBalance: number;
    cpuPractice: boolean;
  }
>;

export const currencies = currencySchema.options;

export const MATCH_RULES = {
  winScore: 2,
  roundSeconds: 10,
  disconnectGraceSeconds: 20,
  revealMs: 1500,
  signupBonusRac: CURRENCY_RULES.rac.signupBalance,
  racStakes: CURRENCY_RULES.rac.stakes,
} as const;

export const walletSchema = z.object({
  currency: currencySchema,
  available: amountSchema,
  locked: amountSchema,
});
export type Wallet = z.infer<typeof walletSchema>;

export function stakesFor(currency: Currency): readonly number[] {
  return CURRENCY_RULES[currency].stakes;
}

export function isStakeAllowed(currency: Currency, stake: number) {
  return stakesFor(currency).includes(stake);
}

/** What the house keeps from a match where each player staked `stake`. */
export function houseCut(currency: Currency, stake: number) {
  return Math.floor((stake * 2 * CURRENCY_RULES[currency].houseCutBps) / 10_000);
}

/** What the winner receives in total: the pot minus the house cut. */
export function winnerTakes(currency: Currency, stake: number) {
  return stake * 2 - houseCut(currency, stake);
}

/** The house cut as a percentage, e.g. `10` for USDT. */
export function houseCutPercent(currency: Currency) {
  return CURRENCY_RULES[currency].houseCutBps / 100;
}

/**
 * Reads a typed amount such as `"1.5"` or `"-0.2"` into smallest units without
 * floating-point maths. Returns `undefined` for anything that is not a plain
 * number, or that has more decimals than the currency allows.
 */
export function parseAmount(currency: Currency, text: string): number | undefined {
  const { unit, decimals } = CURRENCY_RULES[currency];
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return undefined;

  const [, sign, whole = "0", fraction = ""] = match;
  if (fraction.length > decimals) return undefined;

  const units = Number(whole) * unit + (fraction ? Number(fraction.padEnd(decimals, "0")) : 0);
  if (!Number.isSafeInteger(units)) return undefined;
  return sign ? -units : units;
}

/**
 * Formats a whole number of smallest units without floating-point maths:
 * `formatAmount("usdt", 1_800_000)` is `"1.8 USDT"`, `formatAmount("rac", 5)`
 * is `"5 RAC"`. Pass `{ unit: false }` to leave the label off, or
 * `{ sign: true }` to always show `+` or `-`.
 */
export function formatAmount(
  currency: Currency,
  amount: number,
  options: { unit?: boolean; sign?: boolean } = {},
) {
  const { unit: perWhole, decimals, label } = CURRENCY_RULES[currency];
  const negative = amount < 0;
  const magnitude = Math.abs(Math.trunc(amount));

  let text = String(Math.floor(magnitude / perWhole));
  if (decimals > 0) {
    const fraction = String(magnitude % perWhole).padStart(decimals, "0").replace(/0+$/, "");
    if (fraction) text += `.${fraction}`;
  }

  const sign = negative ? "-" : options.sign && magnitude > 0 ? "+" : "";
  return `${sign}${text}${options.unit === false ? "" : ` ${label}`}`;
}
