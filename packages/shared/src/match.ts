import { z } from "zod";
import { displayNameSchema } from "./auth";
import { isoDateSchema, matchIdSchema, userIdSchema } from "./common";
import { playableCurrencySchema, racAmountSchema } from "./economy";

export const catalogGameIdSchema = z.enum(["rps", "chess", "four-by-four"]);
export type CatalogGameId = z.infer<typeof catalogGameIdSchema>;

export const playableGameIdSchema = z.literal("rps");
export type PlayableGameId = z.infer<typeof playableGameIdSchema>;

export const gameIdSchema = catalogGameIdSchema;
export type GameId = z.infer<typeof gameIdSchema>;

export const rpsModeSchema = z.enum(["quick", "first-to-2", "best-of-5", "private"]);
export type RpsMode = z.infer<typeof rpsModeSchema>;

/** Only this mode is live for the hosted two-player goal. */
export const playableRpsModeSchema = z.literal("first-to-2");
export type PlayableRpsMode = z.infer<typeof playableRpsModeSchema>;

export const rpsHands = ["Rock", "Paper", "Scissors"] as const;
export const rpsHandSchema = z.enum(rpsHands);
export type RpsHand = z.infer<typeof rpsHandSchema>;

export const roundOutcomeSchema = z.enum(["a", "b", "draw"]);
export type RoundOutcome = z.infer<typeof roundOutcomeSchema>;

export const matchStatusSchema = z.enum([
  "queued",
  "live",
  "reveal",
  "finished",
  "cancelled",
  "forfeited",
]);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const viewerRoleSchema = z.enum(["player", "spectator"]);
export type ViewerRole = z.infer<typeof viewerRoleSchema>;

export const seatSchema = z.enum(["a", "b"]);
export type Seat = z.infer<typeof seatSchema>;

export const moveViewSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("choosing") }),
  z.object({ status: z.literal("locked") }),
  z.object({ status: z.literal("revealed"), hand: rpsHandSchema }),
]);
export type MoveView = z.infer<typeof moveViewSchema>;

export const matchPlayerSchema = z.object({
  userId: userIdSchema,
  name: displayNameSchema,
  seat: seatSchema,
  score: z.number().int().nonnegative(),
  move: moveViewSchema,
});
export type MatchPlayer = z.infer<typeof matchPlayerSchema>;

export const lobbyStakeSchema = z.object({
  id: z.string().min(1),
  gameId: playableGameIdSchema,
  mode: playableRpsModeSchema,
  currency: playableCurrencySchema,
  stake: racAmountSchema,
  enabled: z.boolean(),
});
export type LobbyStake = z.infer<typeof lobbyStakeSchema>;

export const queueEntrySchema = z.object({
  gameId: playableGameIdSchema,
  mode: playableRpsModeSchema,
  currency: playableCurrencySchema,
  stake: racAmountSchema,
});
export type QueueEntry = z.infer<typeof queueEntrySchema>;

export function queueKey(entry: QueueEntry) {
  return `${entry.gameId}:${entry.mode}:${entry.currency}:${entry.stake}`;
}

export const matchSummarySchema = z.object({
  matchId: matchIdSchema,
  gameId: playableGameIdSchema,
  mode: playableRpsModeSchema,
  currency: playableCurrencySchema,
  stake: racAmountSchema,
  pot: racAmountSchema,
  status: matchStatusSchema,
  round: z.number().int().positive(),
  firstTo: z.number().int().positive(),
  secondsLeft: z.number().int().nonnegative(),
  players: z.tuple([matchPlayerSchema, matchPlayerSchema]),
});
export type MatchSummary = z.infer<typeof matchSummarySchema>;

export const roundLogEntrySchema = z.object({
  round: z.number().int().positive(),
  detail: z.string().min(1),
});
export type RoundLogEntry = z.infer<typeof roundLogEntrySchema>;

export const matchStateSchema = matchSummarySchema.extend({
  viewerRole: viewerRoleSchema,
  yourUserId: userIdSchema.optional(),
  startedAt: isoDateSchema.optional(),
  /**
   * Rounds already resolved. Carried on the state so a player who reloads gets
   * their history back instead of only seeing rounds played since they
   * reconnected.
   */
  log: z.array(roundLogEntrySchema),
});
export type MatchState = z.infer<typeof matchStateSchema>;

export const matchRevealSchema = z.object({
  matchId: matchIdSchema,
  round: z.number().int().positive(),
  hands: z.object({
    a: rpsHandSchema,
    b: rpsHandSchema,
  }),
  outcome: roundOutcomeSchema,
  scores: z.object({
    a: z.number().int().nonnegative(),
    b: z.number().int().nonnegative(),
  }),
  detail: z.string().min(1),
});
export type MatchReveal = z.infer<typeof matchRevealSchema>;

export const matchOverReasonSchema = z.enum(["completed", "forfeit", "disconnect"]);
export type MatchOverReason = z.infer<typeof matchOverReasonSchema>;

export const matchOverSchema = z.object({
  matchId: matchIdSchema,
  winnerSeat: seatSchema.nullable(),
  reason: matchOverReasonSchema,
  payouts: z.array(
    z.object({
      userId: userIdSchema,
      delta: z.number().int(),
    }),
  ),
});
export type MatchOver = z.infer<typeof matchOverSchema>;

export const matchResultSchema = z.enum(["win", "loss"]);
export type MatchResult = z.infer<typeof matchResultSchema>;

export const matchHistoryEntrySchema = z.object({
  matchId: matchIdSchema,
  gameId: playableGameIdSchema,
  mode: playableRpsModeSchema,
  currency: playableCurrencySchema,
  stake: racAmountSchema,
  result: matchResultSchema,
  reason: matchOverReasonSchema,
  opponentName: displayNameSchema,
  yourScore: z.number().int().nonnegative(),
  opponentScore: z.number().int().nonnegative(),
  /** Net RAC change for this match: +stake on a win, -stake on a loss. */
  delta: z.number().int(),
  finishedAt: isoDateSchema,
});
export type MatchHistoryEntry = z.infer<typeof matchHistoryEntrySchema>;

export const matchHistoryResponseSchema = z.object({
  matches: z.array(matchHistoryEntrySchema),
});
export type MatchHistoryResponse = z.infer<typeof matchHistoryResponseSchema>;
