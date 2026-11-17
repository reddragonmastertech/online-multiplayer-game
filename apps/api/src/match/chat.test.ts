import { CHAT_RULES } from "@game-platform/shared";
import { describe, expect, it } from "vitest";
import { createMatchChat, type ChatSender } from "./chat";

const ann: ChatSender = { userId: "ann", name: "Ann", seat: "a" };
const ben: ChatSender = { userId: "ben", name: "Ben", seat: "b" };

function harness() {
  let clock = 1_000_000;
  const chat = createMatchChat({ now: () => clock });
  return {
    chat,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("match chat", () => {
  it("stamps a message with the sender's seat and name", () => {
    const { chat } = harness();
    const result = chat.post("m1", ann, "good luck");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toMatchObject({ matchId: "m1", seat: "a", name: "Ann", text: "good luck" });
    expect(chat.history("m1")).toEqual([result.message]);
  });

  it("trims and collapses whitespace, and refuses a blank message", () => {
    const { chat } = harness();

    const result = chat.post("m1", ann, "  hi \n\n\n  there  ");
    expect(result.ok && result.message.text).toBe("hi there");
    expect(chat.post("m1", ann, " \n\t ")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses a message over the length cap", () => {
    const { chat } = harness();
    expect(chat.post("m1", ann, "x".repeat(CHAT_RULES.maxLength + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(chat.post("m1", ann, "x".repeat(CHAT_RULES.maxLength)).ok).toBe(true);
  });

  it("rate-limits each player separately, then lets them talk again", () => {
    const { chat, advance } = harness();

    for (let i = 0; i < CHAT_RULES.burst; i += 1) {
      expect(chat.post("m1", ann, `msg ${i}`).ok).toBe(true);
    }
    expect(chat.post("m1", ann, "one too many")).toEqual({ ok: false, reason: "rate_limited" });

    // Ben is not punished for Ann's spam.
    expect(chat.post("m1", ben, "calm down").ok).toBe(true);

    advance(CHAT_RULES.windowMs);
    expect(chat.post("m1", ann, "sorry").ok).toBe(true);
  });

  it("keeps only the most recent messages", () => {
    const chat = createMatchChat({ limits: { historyLimit: 3, burst: 100 } });
    for (const text of ["1", "2", "3", "4", "5"]) chat.post("m1", ann, text);

    expect(chat.history("m1").map((m) => m.text)).toEqual(["3", "4", "5"]);
  });

  it("keeps matches apart and forgets a match when it closes", () => {
    const { chat } = harness();
    chat.post("m1", ann, "in one");
    chat.post("m2", ben, "in two");

    chat.close("m1");

    expect(chat.history("m1")).toEqual([]);
    expect(chat.history("m2").map((m) => m.text)).toEqual(["in two"]);
  });
});
