import { z } from "zod";

export const idSchema = z.string().min(1);
export type EntityId = z.infer<typeof idSchema>;

export const userIdSchema = idSchema;
export type UserId = z.infer<typeof userIdSchema>;

export const matchIdSchema = idSchema;
export type MatchId = z.infer<typeof matchIdSchema>;

export const playerIdSchema = userIdSchema;
export type PlayerId = z.infer<typeof playerIdSchema>;

export const isoDateSchema = z.string().min(1);
export type IsoDate = z.infer<typeof isoDateSchema>;

export const errorCodeSchema = z.enum([
  "unauthorized",
  "invalid_input",
  "not_found",
  "rate_limited",
  "email_taken",
  "invalid_credentials",
  "insufficient_balance",
  "not_in_queue",
  "match_not_found",
  "not_your_match",
  "already_moved",
  "match_not_live",
  "queue_unavailable",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const protocolErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
});
export type ProtocolError = z.infer<typeof protocolErrorSchema>;
