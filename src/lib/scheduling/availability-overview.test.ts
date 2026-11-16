import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "../time";
import { dayAvailability, toWeeklyRule } from "./availability-overview";

const at = (day: string, h: number, m = 0) => zonedTimeToUtc(day, h * 60 + m);
// Monday 10–14 and 15–19, Wednesday 12–20
const rules = [
  { weekday: 1, startMinute: 600, endMinute: 840 },
  { weekday: 1, startMinute: 900, endMinute: 1140 },
  { weekday: 3, startMinute: 720, endMinute: 1200 },
];

describe("availability overview", () => {
  it("shows the weekly windows of a day", () => {
    expect(dayAvailability({ rules, exceptions: [] }, "2026-11-16")).toEqual({
      windows: [
        { start: 600, end: 840 },
        { start: 900, end: 1140 },
      ],
      absences: [],
    });
    expect(dayAvailability({ rules, exceptions: [] }, "2026-11-17").windows).toEqual([]);
  });

  it("removes absences and lists them, adds extra availability", () => {
    const exceptions = [
      // Holiday over several days
      {
        kind: "UNAVAILABLE" as const,
        start: at("2026-11-16", 0),
        end: at("2026-11-19", 0),
        note: "Urlaub",
      },
      // Blocker on the following Monday afternoon
      {
        kind: "UNAVAILABLE" as const,
        start: at("2026-11-23", 16),
        end: at("2026-11-23", 17),
        note: null,
      },
      // Extra Saturday
      { kind: "AVAILABLE" as const, start: at("2026-11-21", 11), end: at("2026-11-21", 15) },
    ];
    const holiday = dayAvailability({ rules, exceptions }, "2026-11-16");
    expect(holiday.windows).toEqual([]);
    expect(holiday.absences).toEqual([{ note: "Urlaub", allDay: true, start: 0, end: 1440 }]);
    expect(dayAvailability({ rules, exceptions }, "2026-11-18").windows).toEqual([]);
    expect(dayAvailability({ rules, exceptions }, "2026-11-21").windows).toEqual([
      { start: 660, end: 900 },
    ]);
    const blocked = dayAvailability({ rules, exceptions }, "2026-11-23");
    expect(blocked.windows).toEqual([
      { start: 600, end: 840 },
      { start: 900, end: 960 },
      { start: 1020, end: 1140 },
    ]);
    expect(blocked.absences).toEqual([{ note: null, allDay: false, start: 960, end: 1020 }]);
  });

  it("respects the validity of a rule and keeps local times across the clock change", () => {
    const limited = [
      toWeeklyRule({
        weekday: 1,
        startMinute: 600,
        endMinute: 840,
        validFrom: new Date("2026-03-23T00:00:00Z"),
        validUntil: new Date("2026-03-30T00:00:00Z"),
      }),
    ];
    expect(dayAvailability({ rules: limited, exceptions: [] }, "2026-03-16").windows).toEqual([]);
    // 23.03. winter time, 30.03. summer time: both 10–14 local
    for (const day of ["2026-03-23", "2026-03-30"])
      expect(dayAvailability({ rules: limited, exceptions: [] }, day).windows).toEqual([
        { start: 600, end: 840 },
      ]);
    expect(dayAvailability({ rules: limited, exceptions: [] }, "2026-04-06").windows).toEqual([]);
  });
});
