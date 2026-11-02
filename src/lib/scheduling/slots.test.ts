import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "../time";
import {
  computeFreeSlots,
  isSlotFree,
  mergeIntervals,
  poolSlots,
  subtractIntervals,
  type SlotInput,
  type SlotSearch,
} from "./slots";

const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(day, h * 60 + m);
};
const iv = (day: string, from: string, to: string) => ({ start: at(day, from), end: at(day, to) });
const times = (slots: { start: Date }[]) =>
  slots.map((s) =>
    new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(s.start),
  );

// 2026-11-02 is a Monday
const MON = "2026-11-02";
const TUE = "2026-11-03";

function input(overrides: Partial<SlotInput> = {}): SlotInput {
  return {
    rules: [{ weekday: 1, startMinute: 10 * 60, endMinute: 12 * 60 }],
    exceptions: [],
    busy: [],
    durationMinutes: 30,
    bufferMinutes: 0,
    ...overrides,
  };
}

function search(overrides: Partial<SlotSearch> = {}): SlotSearch {
  return {
    from: at(MON, "00:00"),
    to: at("2026-11-09", "00:00"),
    now: at("2026-11-01", "12:00"),
    minNoticeMinutes: 0,
    stepMinutes: 30,
    ...overrides,
  };
}

describe("interval helpers", () => {
  it("merges overlapping and adjacent intervals", () => {
    const merged = mergeIntervals([
      iv(MON, "10:00", "11:00"),
      iv(MON, "10:30", "12:00"),
      iv(MON, "12:00", "13:00"),
    ]);
    expect(merged).toEqual([iv(MON, "10:00", "13:00")]);
  });

  it("subtracts intervals", () => {
    expect(subtractIntervals([iv(MON, "10:00", "12:00")], [iv(MON, "10:30", "11:00")])).toEqual([
      iv(MON, "10:00", "10:30"),
      iv(MON, "11:00", "12:00"),
    ]);
  });
});

describe("computeFreeSlots", () => {
  it("creates slots from a weekly rule", () => {
    expect(times(computeFreeSlots(input(), search()))).toEqual([
      "Mo., 10:00",
      "Mo., 10:30",
      "Mo., 11:00",
      "Mo., 11:30",
    ]);
  });

  it("removes slots overlapping busy times", () => {
    const slots = computeFreeSlots(input({ busy: [iv(MON, "10:15", "10:45")] }), search());
    expect(times(slots)).toEqual(["Mo., 11:00", "Mo., 11:30"]);
  });

  it("keeps the buffer around busy times", () => {
    const slots = computeFreeSlots(
      input({ busy: [iv(MON, "11:00", "11:30")], bufferMinutes: 15 }),
      search({ stepMinutes: 15 }),
    );
    // 10:30–11:00 would end directly at the busy block; buffer needs 15 min gap.
    expect(times(slots)).toEqual(["Mo., 10:00", "Mo., 10:15"]);
  });

  it("respects the step grid and duration", () => {
    const slots = computeFreeSlots(input({ durationMinutes: 45 }), search({ stepMinutes: 15 }));
    expect(times(slots)).toEqual([
      "Mo., 10:00",
      "Mo., 10:15",
      "Mo., 10:30",
      "Mo., 10:45",
      "Mo., 11:00",
      "Mo., 11:15",
    ]);
  });

  it("applies unavailability exceptions (vacation)", () => {
    const slots = computeFreeSlots(
      input({
        exceptions: [{ kind: "UNAVAILABLE", start: at(MON, "00:00"), end: at(TUE, "00:00") }],
      }),
      search(),
    );
    expect(slots).toEqual([]);
  });

  it("adds extra availability exceptions", () => {
    const slots = computeFreeSlots(
      input({
        exceptions: [{ kind: "AVAILABLE", start: at(TUE, "18:00"), end: at(TUE, "19:00") }],
      }),
      search(),
    );
    expect(times(slots)).toContain("Di., 18:00");
    expect(times(slots)).toContain("Di., 18:30");
  });

  it("respects validity dates of rules", () => {
    const rules = [{ weekday: 1, startMinute: 600, endMinute: 660, validFrom: "2026-11-09" }];
    expect(computeFreeSlots(input({ rules }), search())).toEqual([]);
    const next = computeFreeSlots(input({ rules }), search({ to: at("2026-11-10", "00:00") }));
    expect(next).toHaveLength(2);
  });

  it("respects minimum notice", () => {
    const slots = computeFreeSlots(
      input(),
      search({ now: at(MON, "09:00"), minNoticeMinutes: 90 }),
    );
    expect(times(slots)).toEqual(["Mo., 10:30", "Mo., 11:00", "Mo., 11:30"]);
  });

  it("keeps local wall-clock times across the DST change (spring)", () => {
    // Monday before and after 2026-03-29
    const slots = computeFreeSlots(
      input({ rules: [{ weekday: 1, startMinute: 600, endMinute: 630 }] }),
      search({
        from: at("2026-03-23", "00:00"),
        to: at("2026-04-01", "00:00"),
        now: at("2026-03-01", "00:00"),
      }),
    );
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      "2026-03-23T09:00:00.000Z", // CET  (+01:00)
      "2026-03-30T08:00:00.000Z", // CEST (+02:00)
    ]);
  });

  it("keeps local wall-clock times across the DST change (autumn)", () => {
    const slots = computeFreeSlots(
      input({ rules: [{ weekday: 7, startMinute: 0, endMinute: 4 * 60 }], durationMinutes: 60 }),
      search({
        from: at("2026-10-25", "00:00"),
        to: at("2026-10-26", "00:00"),
        now: at("2026-10-01", "00:00"),
        stepMinutes: 60,
      }),
    );
    // The night has 25 hours: 00:00–04:00 local spans 5 real hours → 5 one-hour slots.
    expect(slots).toHaveLength(5);
    expect(slots[0].start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(slots[4].end.toISOString()).toBe("2026-10-25T03:00:00.000Z");
  });
});

describe("isSlotFree", () => {
  const opts = { now: at("2026-11-01", "12:00"), minNoticeMinutes: 0 };

  it("accepts a start inside a window, off the grid", () => {
    expect(isSlotFree(input(), at(MON, "10:10"), opts)).toBe(true);
  });

  it("rejects slots exceeding the window", () => {
    expect(isSlotFree(input(), at(MON, "11:45"), opts)).toBe(false);
  });

  it("rejects slots outside any rule or blocked by busy time", () => {
    expect(isSlotFree(input(), at(TUE, "10:00"), opts)).toBe(false);
    expect(isSlotFree(input({ busy: [iv(MON, "10:20", "10:25")] }), at(MON, "10:00"), opts)).toBe(
      false,
    );
  });

  it("rejects starts in the past", () => {
    expect(
      isSlotFree(input(), at(MON, "10:00"), { now: at(MON, "10:05"), minNoticeMinutes: 0 }),
    ).toBe(false);
  });

  it("accepts slots spanning two adjacent rules", () => {
    const rules = [
      { weekday: 1, startMinute: 600, endMinute: 630 },
      { weekday: 1, startMinute: 630, endMinute: 700 },
    ];
    expect(isSlotFree(input({ rules }), at(MON, "10:15"), opts)).toBe(true);
  });
});

describe("poolSlots", () => {
  it("groups free slots of several tattooers by start time", () => {
    const pooled = poolSlots(
      new Map([
        ["a", [iv(MON, "10:00", "10:30"), iv(MON, "10:30", "11:00")]],
        ["b", [iv(MON, "10:30", "11:15")]],
      ]),
    );
    expect(pooled.map((p) => [times([p])[0], p.tattooers.map((t) => t.tattooerId)])).toEqual([
      ["Mo., 10:00", ["a"]],
      ["Mo., 10:30", ["a", "b"]],
    ]);
  });
});
