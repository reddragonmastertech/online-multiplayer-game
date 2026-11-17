import {
  formatAmount,
  houseCut,
  isStakeAllowed,
  parseAmount,
  stakesFor,
  USDT_UNIT,
  winnerTakes,
} from "@game-platform/shared";
import { describe, expect, it } from "vitest";

// The shared money helpers. They live in packages/shared, which has no test
// runner of its own, and the server settles with them, so they are tested here.

describe("money rules", () => {
  it("offers the agreed stakes in each currency", () => {
    expect(stakesFor("rac")).toEqual([1, 5, 10]);
    expect(stakesFor("usdt").map((stake) => stake / USDT_UNIT)).toEqual([0.2, 0.5, 1, 2, 5, 10]);
    expect(isStakeAllowed("usdt", 200_000)).toBe(true);
    expect(isStakeAllowed("usdt", 5)).toBe(false);
    expect(isStakeAllowed("rac", 200_000)).toBe(false);
  });

  it("keeps 10% of the pot in USDT and nothing in RAC", () => {
    expect(houseCut("usdt", 1_000_000)).toBe(200_000);
    expect(winnerTakes("usdt", 1_000_000)).toBe(1_800_000);
    expect(houseCut("rac", 10)).toBe(0);
    expect(winnerTakes("rac", 10)).toBe(20);
  });

  it("divides every USDT stake exactly, so no fraction is ever lost", () => {
    for (const stake of stakesFor("usdt")) {
      expect(houseCut("usdt", stake) + winnerTakes("usdt", stake)).toBe(stake * 2);
      expect((stake * 2 * 1000) % 10_000).toBe(0);
    }
  });

  it("reads typed amounts without floating-point noise", () => {
    expect(parseAmount("usdt", "1.5")).toBe(1_500_000);
    expect(parseAmount("usdt", "0.2")).toBe(200_000);
    expect(parseAmount("usdt", "-0.5")).toBe(-500_000);
    expect(parseAmount("usdt", "0.1234567")).toBeUndefined();
    expect(parseAmount("rac", "5")).toBe(5);
    expect(parseAmount("rac", "1.5")).toBeUndefined();
    expect(parseAmount("usdt", "abc")).toBeUndefined();
    expect(parseAmount("usdt", "1e3")).toBeUndefined();
  });

  it("formats amounts without floating-point noise", () => {
    expect(formatAmount("usdt", 1_800_000)).toBe("1.8 USDT");
    expect(formatAmount("usdt", 200_000)).toBe("0.2 USDT");
    expect(formatAmount("usdt", 10_000_000)).toBe("10 USDT");
    expect(formatAmount("usdt", 1)).toBe("0.000001 USDT");
    expect(formatAmount("usdt", 0)).toBe("0 USDT");
    expect(formatAmount("rac", 100)).toBe("100 RAC");
    expect(formatAmount("usdt", 800_000, { sign: true })).toBe("+0.8 USDT");
    expect(formatAmount("usdt", -1_000_000, { sign: true })).toBe("-1 USDT");
    expect(formatAmount("rac", 5, { unit: false })).toBe("5");
  });
});
