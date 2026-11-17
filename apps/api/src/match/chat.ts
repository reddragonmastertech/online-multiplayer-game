import { randomUUID } from "node:crypto";
import { CHAT_RULES, type ChatMessage, type Seat } from "@game-platform/shared";

/**
 * Match chat, held in memory per live match. Pure: no sockets, no database.
 * The gateway decides who is seated and who receives a message; this only
 * validates, rate-limits and remembers recent messages.
 */

export type ChatSender = { userId: string; name: string; seat: Seat };

export type ChatPostResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; reason: "empty" | "too_long" | "rate_limited" };

type Limits = Record<"maxLength" | "burst" | "windowMs" | "historyLimit", number>;

export function createMatchChat(deps: { now?: () => number; limits?: Partial<Limits> } = {}) {
  const now = deps.now ?? Date.now;
  const limits: Limits = { ...CHAT_RULES, ...deps.limits };

  const histories = new Map<string, ChatMessage[]>();
  /** Send times per match and user, for the sliding rate-limit window. */
  const sendTimes = new Map<string, number[]>();

  function rateKey(matchId: string, userId: string) {
    return `${matchId}:${userId}`;
  }

  return {
    post(matchId: string, sender: ChatSender, rawText: string): ChatPostResult {
      // Collapse runs of whitespace so a message cannot be mostly blank lines.
      const text = rawText.replace(/\s+/g, " ").trim();
      if (text.length === 0) return { ok: false, reason: "empty" };
      if (text.length > limits.maxLength) return { ok: false, reason: "too_long" };

      const at = now();
      const key = rateKey(matchId, sender.userId);
      const recent = (sendTimes.get(key) ?? []).filter((time) => at - time < limits.windowMs);
      if (recent.length >= limits.burst) {
        sendTimes.set(key, recent);
        return { ok: false, reason: "rate_limited" };
      }
      sendTimes.set(key, [...recent, at]);

      const message: ChatMessage = {
        matchId,
        id: randomUUID(),
        seat: sender.seat,
        name: sender.name,
        text,
        sentAt: new Date(at).toISOString(),
      };

      const history = [...(histories.get(matchId) ?? []), message];
      histories.set(matchId, history.slice(-limits.historyLimit));
      return { ok: true, message };
    },

    history(matchId: string): ChatMessage[] {
      return histories.get(matchId) ?? [];
    },

    /** Drops everything for a match. Called when it ends. */
    close(matchId: string) {
      histories.delete(matchId);
      for (const key of sendTimes.keys()) {
        if (key.startsWith(`${matchId}:`)) sendTimes.delete(key);
      }
    },
  };
}

export type MatchChat = ReturnType<typeof createMatchChat>;
