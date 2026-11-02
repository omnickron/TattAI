import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "../time";
import {
  activeBatch,
  bulkDecision,
  dailyLimit,
  nextSendTime,
  parseSendTimes,
  randomGapMs,
  reminderDecision,
  type ThrottleConfig,
} from "./throttle";

const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(day, h * 60 + m);
};

// 2026-11-02 is a Monday
const cfg: ThrottleConfig = {
  sendTimes: [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, time: "10:00" },
    { weekday, time: "17:00" },
  ]),
  batchWindowMinutes: 90,
  maxPerBatch: 3,
  maxPerDay: 5,
  minGapSeconds: 60,
  maxGapSeconds: 180,
  warmupStartDate: null,
  warmupStartPerDay: 2,
  warmupIncreasePerDay: 1,
};
const idle = { sentToday: 0, sentInBatch: 0, nextSendAllowedAt: null };

describe("send times", () => {
  it("finds the active batch", () => {
    expect(activeBatch(at("2026-11-02", "10:30"), cfg)?.start).toEqual(at("2026-11-02", "10:00"));
    expect(activeBatch(at("2026-11-02", "11:31"), cfg)).toBeNull();
    expect(activeBatch(at("2026-11-02", "09:59"), cfg)).toBeNull();
  });

  it("ends a batch at the next send time if that comes first", () => {
    const close = {
      ...cfg,
      sendTimes: [
        { weekday: 1, time: "10:00" },
        { weekday: 1, time: "10:30" },
      ],
    };
    expect(activeBatch(at("2026-11-02", "10:20"), close)?.end).toEqual(at("2026-11-02", "10:30"));
    expect(activeBatch(at("2026-11-02", "10:40"), close)?.start).toEqual(at("2026-11-02", "10:30"));
  });

  it("finds the next send time across the weekend", () => {
    expect(nextSendTime(at("2026-11-06", "18:00"), cfg)).toEqual(at("2026-11-09", "10:00"));
    expect(nextSendTime(at("2026-11-02", "10:00"), cfg)).toEqual(at("2026-11-02", "17:00"));
    expect(nextSendTime(at("2026-11-02", "10:00"), { ...cfg, sendTimes: [] })).toBeNull();
  });

  it("keeps local send times across DST", () => {
    const sunday = { ...cfg, sendTimes: [{ weekday: 7, time: "10:00" }] };
    expect(nextSendTime(at("2026-03-28", "12:00"), sunday)?.toISOString()).toBe(
      "2026-03-29T08:00:00.000Z",
    );
    expect(nextSendTime(at("2026-10-24", "12:00"), sunday)?.toISOString()).toBe(
      "2026-10-25T09:00:00.000Z",
    );
  });
});

describe("bulkDecision", () => {
  const inBatch = at("2026-11-02", "10:05");

  it("sends inside a batch", () => {
    expect(bulkDecision(inBatch, cfg, idle)).toEqual({ send: true });
  });

  it("waits outside send times until the next one", () => {
    expect(bulkDecision(at("2026-11-02", "20:00"), cfg, idle)).toEqual({
      send: false,
      reason: "Außerhalb der Sendezeiten",
      retryAt: at("2026-11-03", "10:00"),
    });
  });

  it("keeps the gap", () => {
    const next = at("2026-11-02", "10:07");
    expect(bulkDecision(inBatch, cfg, { ...idle, nextSendAllowedAt: next })).toMatchObject({
      send: false,
      retryAt: next,
    });
  });

  it("stops at the batch and daily limits", () => {
    expect(bulkDecision(inBatch, cfg, { ...idle, sentInBatch: 3 })).toMatchObject({
      send: false,
      retryAt: at("2026-11-02", "17:00"),
    });
    expect(bulkDecision(inBatch, cfg, { ...idle, sentToday: 5 })).toMatchObject({ send: false });
  });
});

describe("warm-up", () => {
  const warm = {
    ...cfg,
    maxPerDay: 40,
    warmupStartDate: "2026-11-02",
    warmupStartPerDay: 10,
    warmupIncreasePerDay: 5,
  };

  it("ramps the daily limit up to the maximum", () => {
    expect(dailyLimit("2026-11-01", warm)).toBe(10);
    expect(dailyLimit("2026-11-02", warm)).toBe(10);
    expect(dailyLimit("2026-11-03", warm)).toBe(15);
    expect(dailyLimit("2026-11-08", warm)).toBe(40);
    expect(dailyLimit("2026-12-01", warm)).toBe(40);
  });

  it("uses the warm-up limit in decisions", () => {
    expect(
      bulkDecision(
        at("2026-11-02", "10:05"),
        { ...warm, maxPerBatch: 50 },
        { ...idle, sentToday: 10 },
      ),
    ).toMatchObject({
      send: false,
      reason: "Tageslimit erreicht (10)",
    });
  });
});

describe("reminders and helpers", () => {
  it("lets reminders ignore send times but keep the gap", () => {
    const night = at("2026-11-02", "22:00");
    expect(reminderDecision(night, idle)).toEqual({ send: true });
    expect(
      reminderDecision(night, { ...idle, nextSendAllowedAt: at("2026-11-02", "22:02") }),
    ).toMatchObject({ send: false });
  });

  it("draws gaps between min and max", () => {
    expect(randomGapMs(cfg, () => 0)).toBe(60_000);
    expect(randomGapMs(cfg, () => 1)).toBe(180_000);
  });

  it("normalises send times from the form", () => {
    expect(
      parseSendTimes([
        { weekday: 2, time: "9:00" },
        { weekday: 1, time: "17:00" },
        { weekday: 1, time: "17:00" },
        { weekday: 8, time: "10:00" },
        { weekday: 1, time: "25:00" },
      ]),
    ).toEqual([
      { weekday: 1, time: "17:00" },
      { weekday: 2, time: "09:00" },
    ]);
  });
});
