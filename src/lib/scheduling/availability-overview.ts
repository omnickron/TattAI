/**
 * Admin overview of the tattooers' availability: per local day the bookable windows
 * (weekly rules + extra availability − absences/blockers) and the absences themselves.
 * Busy times from Google/TeamUp are not subtracted here (they count at booking time).
 */
import { addDays, DEFAULT_TIME_ZONE, localMinuteOf, startOfLocalDay } from "../time";
import { availabilityWindows, type AvailabilityException, type WeeklyRule } from "./slots";

export interface DayAvailability {
  /** Local minutes since midnight; end 1440 = until midnight */
  windows: Array<{ start: number; end: number }>;
  /** Absences/blockers touching the day */
  absences: Array<{ note: string | null; allDay: boolean; start: number; end: number }>;
}

export function dayAvailability(
  input: {
    rules: WeeklyRule[];
    exceptions: Array<AvailabilityException & { note?: string | null }>;
  },
  day: string,
  tz = DEFAULT_TIME_ZONE,
): DayAvailability {
  const from = startOfLocalDay(day, tz);
  const to = startOfLocalDay(addDays(day, 1), tz);
  const minute = (d: Date, isEnd: boolean) =>
    isEnd && d.getTime() >= to.getTime() ? 1440 : d <= from ? 0 : localMinuteOf(d, tz);
  const windows = availabilityWindows(
    {
      rules: input.rules,
      exceptions: input.exceptions,
      busy: [],
      durationMinutes: 0,
      bufferMinutes: 0,
      timeZone: tz,
    },
    from,
    to,
  ).map((w) => ({ start: minute(w.start, false), end: minute(w.end, true) }));
  const absences = input.exceptions
    .filter((e) => e.kind === "UNAVAILABLE" && e.start < to && e.end > from)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((e) => ({
      note: e.note ?? null,
      allDay: e.start <= from && e.end >= to,
      start: minute(e.start, false),
      end: minute(e.end, true),
    }));
  return { windows, absences };
}

/** Rule as stored (validity as DB dates) → pure rule for the slot module. */
export function toWeeklyRule(r: {
  weekday: number;
  startMinute: number;
  endMinute: number;
  validFrom: Date | null;
  validUntil: Date | null;
}): WeeklyRule {
  return {
    weekday: r.weekday,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    validFrom: r.validFrom ? r.validFrom.toISOString().slice(0, 10) : null,
    validUntil: r.validUntil ? r.validUntil.toISOString().slice(0, 10) : null,
  };
}
