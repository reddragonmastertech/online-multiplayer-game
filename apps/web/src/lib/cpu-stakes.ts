import { MATCH_RULES } from "@game-platform/shared";

/**
 * The stakes CPU practice offers: the same RAC amounts as live play, from
 * `MATCH_RULES`, so the two never drift apart. Practice runs entirely in the
 * browser and moves no RAC; the stake is only a label.
 */
export const cpuStakes = MATCH_RULES.racStakes.map((amount) => ({
  id: `${amount}-rac`,
  amount: `${amount} RAC`,
}));

export type CpuStake = (typeof cpuStakes)[number];

export function findCpuStake(id: string) {
  return cpuStakes.find((stake) => stake.id === id);
}
