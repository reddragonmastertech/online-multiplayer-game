import { formatAmount, houseCut, winnerTakes, type Currency } from "@game-platform/shared";

type Staked = { currency: Currency; stake: number };

/** "1 RAC MATCH", "0.2 USDT MATCH". */
export function matchTitle(match: Staked) {
  return `${formatAmount(match.currency, match.stake)} MATCH`;
}

/** "Pot 2 RAC", or for USDT "Pot 2 USDT · winner gets 1.8 USDT". */
export function potLabel(match: Staked, prefix = "Pot") {
  const pot = `${prefix} ${formatAmount(match.currency, match.stake * 2)}`;
  return houseCut(match.currency, match.stake) > 0
    ? `${pot} · winner gets ${formatAmount(match.currency, winnerTakes(match.currency, match.stake))}`
    : pot;
}
