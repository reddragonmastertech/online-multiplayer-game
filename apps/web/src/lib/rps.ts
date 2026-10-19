export type Hand = "Rock" | "Paper" | "Scissors";
export type RoundResult = "you" | "cpu" | "draw";

export const hands: Hand[] = ["Rock", "Paper", "Scissors"];

const beats: Record<Hand, Hand> = {
  Rock: "Scissors",
  Paper: "Rock",
  Scissors: "Paper",
};

export function randomHand() {
  return hands[Math.floor(Math.random() * hands.length)] ?? "Rock";
}

export function judgeRound(you: Hand, cpu: Hand): RoundResult {
  if (you === cpu) return "draw";
  return beats[you] === cpu ? "you" : "cpu";
}

export function roundDetail(result: RoundResult, you: Hand, cpu: Hand) {
  if (result === "draw") return `Draw · ${you} vs ${cpu}`;
  if (result === "you") return `You won · ${you} beats ${cpu}`;
  return `CPU won · ${cpu} beats ${you}`;
}
