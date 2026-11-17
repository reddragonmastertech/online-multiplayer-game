import { z } from "zod";
import { isoDateSchema, matchIdSchema } from "./common";
import { seatSchema } from "./match";

/**
 * Match chat: the two seated players only, for the length of the match. It
 * lives in the server's memory and is gone when the match ends. Spectators
 * neither see nor send it.
 */
export const CHAT_RULES = {
  maxLength: 200,
  /** At most `burst` messages per `windowMs` per player. */
  burst: 5,
  windowMs: 10_000,
  /** Messages kept per match, so a reload can show the recent history. */
  historyLimit: 50,
} as const;

/** One-tap messages, so nobody has to type during a ten-second round. */
export const quickReactions = ["👍", "😄", "😮", "🔥", "GG", "Nice!"] as const;

export const chatSendSchema = z.object({
  matchId: matchIdSchema,
  text: z.string().trim().min(1).max(CHAT_RULES.maxLength),
});
export type ChatSend = z.infer<typeof chatSendSchema>;

export const chatMessageSchema = z.object({
  matchId: matchIdSchema,
  id: z.string().min(1),
  seat: seatSchema,
  name: z.string().min(1),
  text: z.string().min(1).max(CHAT_RULES.maxLength),
  sentAt: isoDateSchema,
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatHistorySchema = z.object({
  matchId: matchIdSchema,
  messages: z.array(chatMessageSchema),
});
export type ChatHistory = z.infer<typeof chatHistorySchema>;
