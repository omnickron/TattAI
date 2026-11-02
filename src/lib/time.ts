/**
 * Minimal time zone helpers built on Intl (no dependencies).
 * The database stores UTC; business rules (availability) are in local time.
 * Local calendar dates are represented as "YYYY-MM-DD" strings.
 */

export const DEFAULT_TIME_ZONE = "Europe/Berlin";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday, 1 = Monday ... 7 = Sunday */
  weekday: number;
}

export function localParts(date: Date, timeZone = DEFAULT_TIME_ZONE): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of partsFormatter(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday],
  };
}

/** Offset of the time zone from UTC at the given instant, in milliseconds. */
export function timeZoneOffsetMs(date: Date, timeZone = DEFAULT_TIME_ZONE): number {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function parseLocalDate(localDate: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) throw new Error(`Invalid local date: ${localDate}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Converts a local wall-clock time to a UTC instant.
 * Times that do not exist (spring-forward gap) are shifted forward by the gap;
 * ambiguous times (fall-back) resolve to the earlier instant.
 */
export function zonedTimeToUtc(
  localDate: string,
  minuteOfDay: number,
  timeZone = DEFAULT_TIME_ZONE,
): Date {
  const [y, m, d] = parseLocalDate(localDate);
  const naive = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  // Try the offsets valid shortly before and after the naive instant.
  const candidates = [naive - 12 * 3600_000, naive + 12 * 3600_000].map((probe) => {
    const offset = timeZoneOffsetMs(new Date(probe), timeZone);
    return naive - offset;
  });
  const matching = candidates
    .filter((t) => {
      const p = localParts(new Date(t), timeZone);
      return toLocalDate(p) === localDate && p.hour * 60 + p.minute === minuteOfDay;
    })
    .sort((a, b) => a - b);
  if (matching.length) return new Date(matching[0]);
  // Gap: use the offset from before the transition, which lands after the gap.
  return new Date(Math.max(...candidates));
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, "0");
}

function toLocalDate(p: Pick<LocalParts, "year" | "month" | "day">): string {
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Local calendar date ("YYYY-MM-DD") of an instant. */
export function localDateOf(date: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return toLocalDate(localParts(date, timeZone));
}

/** Minutes since local midnight of an instant. */
export function localMinuteOf(date: Date, timeZone = DEFAULT_TIME_ZONE): number {
  const p = localParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

export function addDays(localDate: string, days: number): string {
  const [y, m, d] = parseLocalDate(localDate);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toLocalDate({ year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() });
}

/** ISO weekday (1 = Monday) of a local date. */
export function weekdayOf(localDate: string): number {
  const [y, m, d] = parseLocalDate(localDate);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Monday of the week containing the local date. */
export function startOfWeek(localDate: string): string {
  return addDays(localDate, 1 - weekdayOf(localDate));
}

export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return addDays(value, 0) === value;
}

/** Start of the local day as UTC instant. */
export function startOfLocalDay(localDate: string, timeZone = DEFAULT_TIME_ZONE): Date {
  return zonedTimeToUtc(localDate, 0, timeZone);
}

/** "HH:MM" → minutes since midnight (accepts "24:00"). */
export function parseTimeOfDay(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function formatTimeOfDay(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Parses an <input type="datetime-local"> value ("YYYY-MM-DDTHH:MM") as local time. */
export function parseLocalDateTime(value: string, timeZone = DEFAULT_TIME_ZONE): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value.trim());
  if (!m || !isLocalDate(m[1])) return null;
  const minutes = parseTimeOfDay(m[2]);
  return minutes === null ? null : zonedTimeToUtc(m[1], minutes, timeZone);
}
