import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "../time";
import { botReplyDueAt, DEBOUNCE_MS, type BotTiming } from "./inbox";

const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(day, h * 60 + m);
};
const timing: BotTiming = {
  quietEnabled: true,
  quietStart: "22:00",
  quietEnd: "08:00",
  delayMinSeconds: 30,
  delayMaxSeconds: 120,
};

describe("bot reply timing", () => {
  it("waits the typing pause plus a stable random extra time within the range", () => {
    const msg = at("2026-11-12", "14:00");
    const due = botReplyDueAt(msg, "lead-1", timing);
    const wait = due.getTime() - msg.getTime() - DEBOUNCE_MS;
    expect(wait).toBeGreaterThanOrEqual(30_000);
    expect(wait).toBeLessThanOrEqual(120_000);
    // Same answer time on every worker run
    expect(botReplyDueAt(msg, "lead-1", timing)).toEqual(due);
  });

  it("answers night messages after the night rest, spread by the extra time", () => {
    const due = botReplyDueAt(at("2026-11-12", "23:15"), "lead-2", timing);
    const morning = at("2026-11-13", "08:00").getTime();
    expect(due.getTime()).toBeGreaterThanOrEqual(morning + 30_000);
    expect(due.getTime()).toBeLessThanOrEqual(morning + 120_000);
    // Early morning (before 08:00) likewise
    expect(botReplyDueAt(at("2026-11-13", "06:30"), "lead-2", timing).getTime()).toBeGreaterThan(
      morning,
    );
  });

  it("answers at night and without extra time when switched off", () => {
    const msg = at("2026-11-12", "23:15");
    const due = botReplyDueAt(msg, "lead-3", {
      ...timing,
      quietEnabled: false,
      delayMinSeconds: 0,
      delayMaxSeconds: 0,
    });
    expect(due.getTime() - msg.getTime()).toBe(DEBOUNCE_MS);
    expect(botReplyDueAt(msg, "lead-3", null).getTime() - msg.getTime()).toBe(DEBOUNCE_MS);
  });
});
