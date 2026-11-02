import { describe, expect, it } from "vitest";
import {
  addDays,
  isLocalDate,
  localDateOf,
  localMinuteOf,
  parseLocalDateTime,
  parseTimeOfDay,
  startOfWeek,
  weekdayOf,
  zonedTimeToUtc,
} from "./time";

describe("zonedTimeToUtc (Europe/Berlin)", () => {
  it("uses +01:00 in winter", () => {
    expect(zonedTimeToUtc("2026-01-15", 10 * 60).toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("uses +02:00 in summer", () => {
    expect(zonedTimeToUtc("2026-07-15", 10 * 60).toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });

  it("handles the spring-forward day (2026-03-29)", () => {
    expect(zonedTimeToUtc("2026-03-29", 60).toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-29", 3 * 60).toISOString()).toBe("2026-03-29T01:00:00.000Z");
    expect(zonedTimeToUtc("2026-03-29", 10 * 60).toISOString()).toBe("2026-03-29T08:00:00.000Z");
    // 02:30 does not exist; it is shifted to 03:30 CEST
    expect(zonedTimeToUtc("2026-03-29", 150).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("handles the fall-back day (2026-10-25)", () => {
    expect(zonedTimeToUtc("2026-10-25", 60).toISOString()).toBe("2026-10-24T23:00:00.000Z");
    // 02:30 happens twice; the earlier (CEST) instant is used
    expect(zonedTimeToUtc("2026-10-25", 150).toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(zonedTimeToUtc("2026-10-25", 10 * 60).toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("handles midnight across the year boundary", () => {
    expect(zonedTimeToUtc("2027-01-01", 0).toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
});

describe("local date helpers", () => {
  it("returns local date and minute of an instant", () => {
    const d = new Date("2026-06-30T22:30:00Z"); // 00:30 on July 1st in Berlin
    expect(localDateOf(d)).toBe("2026-07-01");
    expect(localMinuteOf(d)).toBe(30);
  });

  it("adds days across month and DST boundaries", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("computes ISO weekdays and week start", () => {
    expect(weekdayOf("2026-11-02")).toBe(1);
    expect(weekdayOf("2026-11-08")).toBe(7);
    expect(startOfWeek("2026-11-08")).toBe("2026-11-02");
  });

  it("validates dates and times", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(parseTimeOfDay("09:30")).toBe(570);
    expect(parseTimeOfDay("24:00")).toBe(1440);
    expect(parseTimeOfDay("25:00")).toBeNull();
    expect(parseTimeOfDay("9:75")).toBeNull();
  });

  it("parses datetime-local input as Berlin time", () => {
    expect(parseLocalDateTime("2026-07-01T14:00")?.toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(parseLocalDateTime("2026-13-01T14:00")).toBeNull();
  });
});
