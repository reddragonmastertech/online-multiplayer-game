import { z } from "zod";
import { matchIdSchema, type ProtocolError } from "./common";
import {
  matchSummarySchema,
  queueEntrySchema,
  rpsHandSchema,
  seatSchema,
  type MatchOver,
  type MatchReveal,
  type MatchState,
} from "./match";

export const clientEvent = {
  queueJoin: "queue:join",
  queueLeave: "queue:leave",
  matchMove: "match:move",
  matchForfeit: "match:forfeit",
  /** Read-only: subscribes a non-player to a public match's visible state. */
  matchWatch: "match:watch",
  matchUnwatch: "match:unwatch",
} as const;

export const serverEvent = {
  queueWaiting: "queue:waiting",
  matchFound: "match:found",
  matchState: "match:state",
  matchReveal: "match:reveal",
  matchOver: "match:over",
  error: "protocol:error",
} as const;

export const queueJoinSchema = queueEntrySchema;
export type QueueJoin = z.infer<typeof queueJoinSchema>;

export const queueLeaveSchema = queueEntrySchema.partial();
export type QueueLeave = z.infer<typeof queueLeaveSchema>;

export const matchMoveSchema = z.object({
  matchId: matchIdSchema,
  hand: rpsHandSchema,
});
export type MatchMove = z.infer<typeof matchMoveSchema>;

export const matchForfeitSchema = z.object({
  matchId: matchIdSchema,
});
export type MatchForfeit = z.infer<typeof matchForfeitSchema>;

export const matchWatchSchema = z.object({
  matchId: matchIdSchema,
});
export type MatchWatch = z.infer<typeof matchWatchSchema>;

export const queueWaitingSchema = queueEntrySchema.extend({
  queuedAt: z.string().min(1),
});
export type QueueWaiting = z.infer<typeof queueWaitingSchema>;

export const matchFoundSchema = z.object({
  matchId: matchIdSchema,
  seat: seatSchema,
  match: matchSummarySchema,
});
export type MatchFound = z.infer<typeof matchFoundSchema>;

export type ClientToServerEvents = {
  [clientEvent.queueJoin]: (payload: QueueJoin) => void;
  [clientEvent.queueLeave]: (payload?: QueueLeave) => void;
  [clientEvent.matchMove]: (payload: MatchMove) => void;
  [clientEvent.matchForfeit]: (payload: MatchForfeit) => void;
  [clientEvent.matchWatch]: (payload: MatchWatch) => void;
  [clientEvent.matchUnwatch]: (payload: MatchWatch) => void;
};

export type ServerToClientEvents = {
  [serverEvent.queueWaiting]: (payload: QueueWaiting) => void;
  [serverEvent.matchFound]: (payload: MatchFound) => void;
  [serverEvent.matchState]: (payload: MatchState) => void;
  [serverEvent.matchReveal]: (payload: MatchReveal) => void;
  [serverEvent.matchOver]: (payload: MatchOver) => void;
  [serverEvent.error]: (payload: ProtocolError) => void;
};

export type SocketData = {
  userId: string;
  name: string;
};
