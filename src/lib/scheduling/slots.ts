/**
 * Pure slot calculation: free consultation slots of ONE tattooer =
 * weekly availability rules (+ extra availability) − unavailability exceptions
 * − busy times (Google free/busy + booked consultations), with buffer.
 * No I/O; all instants are UTC Date objects, rules are in local time.
 */
import { addDays, DEFAULT_TIME_ZONE, localDateOf, weekdayOf, zonedTimeToUtc } from "../time";

export interface Interval {
  start: Date;
  end: Date;
}

export interface WeeklyRule {
  /** ISO weekday, 1 = Monday ... 7 = Sunday */
  weekday: number;
  startMinute: number;
  endMinute: number;
  /** Inclusive local dates ("YYYY-MM-DD"); null = unbounded */
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface AvailabilityException {
  kind: "AVAILABLE" | "UNAVAILABLE";
  start: Date;
  end: Date;
}

export interface SlotInput {
  rules: WeeklyRule[];
  exceptions: AvailabilityException[];
  busy: Interval[];
  durationMinutes: number;
  bufferMinutes: number;
  timeZone?: string;
}

export interface SlotSearch {
  from: Date;
  to: Date;
  now: Date;
  /** Earliest bookable start relative to now. */
  minNoticeMinutes: number;
  /** Grid for slot starts inside an availability window. */
  stepMinutes: number;
}

const MIN = 60_000;

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Sorts and merges overlapping/adjacent intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const result: Interval[] = [];
  for (const cur of sorted) {
    const last = result[result.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      result.push(cur);
    }
  }
  return result;
}

/** Removes all `cuts` from `intervals`. */
export function subtractIntervals(intervals: Interval[], cuts: Interval[]): Interval[] {
  let result = mergeIntervals(intervals);
  for (const cut of mergeIntervals(cuts)) {
    const next: Interval[] = [];
    for (const i of result) {
      if (!overlaps(i, cut)) {
        next.push(i);
        continue;
      }
      if (i.start < cut.start) next.push({ start: i.start, end: cut.start });
      if (cut.end < i.end) next.push({ start: cut.end, end: i.end });
    }
    result = next;
  }
  return result;
}

/** Availability windows (before subtracting busy times) between two instants. */
export function availabilityWindows(input: SlotInput, from: Date, to: Date): Interval[] {
  const tz = input.timeZone ?? DEFAULT_TIME_ZONE;
  const windows: Interval[] = [];
  // Iterate local days that can intersect [from, to).
  const lastDay = localDateOf(to, tz);
  for (let day = addDays(localDateOf(from, tz), -1); day <= lastDay; day = addDays(day, 1)) {
    const weekday = weekdayOf(day);
    for (const rule of input.rules) {
      if (rule.weekday !== weekday) continue;
      if (rule.validFrom && day < rule.validFrom) continue;
      if (rule.validUntil && day > rule.validUntil) continue;
      if (rule.endMinute <= rule.startMinute) continue;
      windows.push({
        start: zonedTimeToUtc(day, rule.startMinute, tz),
        end:
          rule.endMinute >= 1440
            ? zonedTimeToUtc(addDays(day, 1), 0, tz)
            : zonedTimeToUtc(day, rule.endMinute, tz),
      });
    }
  }
  for (const ex of input.exceptions) {
    if (ex.kind === "AVAILABLE") windows.push({ start: ex.start, end: ex.end });
  }
  const unavailable = input.exceptions.filter((e) => e.kind === "UNAVAILABLE");
  const clipped = mergeIntervals(windows)
    .map((w) => ({
      start: w.start < from ? from : w.start,
      end: w.end > to ? to : w.end,
    }))
    .filter((w) => w.end > w.start);
  return subtractIntervals(clipped, unavailable);
}

/** Whether a slot (incl. buffer) collides with busy times. */
export function blockedBy(input: SlotInput, slot: Interval): boolean {
  const buffer = input.bufferMinutes * MIN;
  const padded = {
    start: new Date(slot.start.getTime() - buffer),
    end: new Date(slot.end.getTime() + buffer),
  };
  return input.busy.some((b) => overlaps(padded, b));
}

/** All free slots of one tattooer in the search range. */
export function computeFreeSlots(input: SlotInput, search: SlotSearch): Interval[] {
  const duration = input.durationMinutes * MIN;
  const step = search.stepMinutes * MIN;
  const earliest = new Date(search.now.getTime() + search.minNoticeMinutes * MIN);
  const from = search.from > earliest ? search.from : earliest;
  if (duration <= 0 || step <= 0 || from >= search.to) return [];

  // Windows are computed unclipped so the step grid stays anchored at the rule start.
  const windows = availabilityWindows(input, new Date(from.getTime() - 24 * 3600_000), search.to);
  const slots: Interval[] = [];
  for (const w of windows) {
    for (let t = w.start.getTime(); t + duration <= w.end.getTime(); t += step) {
      if (t < from.getTime()) continue;
      const slot = { start: new Date(t), end: new Date(t + duration) };
      if (!blockedBy(input, slot)) slots.push(slot);
    }
  }
  return slots;
}

/**
 * Whether one exact start time is bookable (independent of the step grid):
 * fully inside an availability window and not blocked by busy times.
 */
export function isSlotFree(
  input: SlotInput,
  start: Date,
  opts: { now: Date; minNoticeMinutes: number },
): boolean {
  if (start.getTime() < opts.now.getTime() + opts.minNoticeMinutes * MIN) return false;
  const slot = { start, end: new Date(start.getTime() + input.durationMinutes * MIN) };
  const windows = availabilityWindows(input, slot.start, slot.end);
  const covered =
    windows.length === 1 &&
    windows[0].start.getTime() === slot.start.getTime() &&
    windows[0].end.getTime() === slot.end.getTime();
  return covered && !blockedBy(input, slot);
}

export interface PooledSlot {
  start: Date;
  /** Tattooers who are free at this start time (with their own end). */
  tattooers: Array<{ tattooerId: string; end: Date }>;
}

/** Combines free slots of several tattooers into start times with candidates. */
export function poolSlots(perTattooer: Map<string, Interval[]>): PooledSlot[] {
  const byStart = new Map<number, PooledSlot>();
  for (const [tattooerId, slots] of perTattooer) {
    for (const s of slots) {
      const key = s.start.getTime();
      let pooled = byStart.get(key);
      if (!pooled) byStart.set(key, (pooled = { start: s.start, tattooers: [] }));
      pooled.tattooers.push({ tattooerId, end: s.end });
    }
  }
  return [...byStart.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}
