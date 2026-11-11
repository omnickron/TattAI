/**
 * Anti-spam staggering for automatic WhatsApp messages (pure, no I/O).
 *
 * - First contacts and follow-ups ("bulk") are only released at fixed send
 *   times; a batch lasts at most `batchWindowMinutes` (or until the next send time).
 * - Per batch and per day there is a maximum; the daily maximum ramps up
 *   during the warm-up of a new number.
 * - Between any two messages there is a random gap.
 * - Reminders are time-critical: they ignore send times and limits, but keep the gap.
 */
import {
  addDays,
  DEFAULT_TIME_ZONE,
  localDateOf,
  localMinuteOf,
  parseTimeOfDay,
  weekdayOf,
  zonedTimeToUtc,
} from "../time";

export interface SendTime {
  /** ISO weekday 1 = Monday … 7 = Sunday */
  weekday: number;
  /** "HH:MM" local time */
  time: string;
}

export interface ThrottleConfig {
  sendTimes: SendTime[];
  batchWindowMinutes: number;
  maxPerBatch: number;
  maxPerDay: number;
  minGapSeconds: number;
  maxGapSeconds: number;
  /** Local date the warm-up started; null = no warm-up */
  warmupStartDate: string | null;
  warmupStartPerDay: number;
  warmupIncreasePerDay: number;
  timeZone?: string;
}

export interface DispatchCounters {
  /** Messages (all kinds) sent today, local day */
  sentToday: number;
  /** Bulk messages sent since the start of the current batch */
  sentInBatch: number;
  nextSendAllowedAt: Date | null;
}

export type Decision = { send: true } | { send: false; reason: string; retryAt: Date | null };

const MIN = 60_000;

/** Send-time instants on a local day, sorted. */
function sendTimesOn(day: string, cfg: ThrottleConfig): Date[] {
  const tz = cfg.timeZone ?? DEFAULT_TIME_ZONE;
  const wd = weekdayOf(day);
  return cfg.sendTimes
    .filter((s) => s.weekday === wd)
    .map((s) => parseTimeOfDay(s.time))
    .filter((m): m is number => m !== null && m < 1440)
    .sort((a, b) => a - b)
    .map((m) => zonedTimeToUtc(day, m, tz));
}

function sendTimesAround(
  now: Date,
  cfg: ThrottleConfig,
  daysBack: number,
  daysAhead: number,
): Date[] {
  const today = localDateOf(now, cfg.timeZone ?? DEFAULT_TIME_ZONE);
  const result: Date[] = [];
  for (let d = -daysBack; d <= daysAhead; d++) result.push(...sendTimesOn(addDays(today, d), cfg));
  // Deduplicate (DST may map two local times to the same instant)
  return [...new Set(result.map((d) => d.getTime()))].sort((a, b) => a - b).map((t) => new Date(t));
}

/** The batch currently running, if any. */
export function activeBatch(now: Date, cfg: ThrottleConfig): { start: Date; end: Date } | null {
  const times = sendTimesAround(now, cfg, 1, 1);
  for (let i = times.length - 1; i >= 0; i--) {
    const start = times[i];
    if (start > now) continue;
    const windowEnd = new Date(start.getTime() + cfg.batchWindowMinutes * MIN);
    const next = times[i + 1];
    const end = next && next < windowEnd ? next : windowEnd;
    return now < end ? { start, end } : null;
  }
  return null;
}

/** Next send time strictly after `now` (within 8 days), or null if none configured. */
export function nextSendTime(now: Date, cfg: ThrottleConfig): Date | null {
  return sendTimesAround(now, cfg, 0, 8).find((t) => t > now) ?? null;
}

function daysBetween(fromLocal: string, toLocal: string): number {
  return Math.round(
    (Date.parse(`${toLocal}T00:00:00Z`) - Date.parse(`${fromLocal}T00:00:00Z`)) / (24 * 60 * MIN),
  );
}

/** Daily maximum for a local date, taking the warm-up into account. */
export function dailyLimit(localDate: string, cfg: ThrottleConfig): number {
  if (!cfg.warmupStartDate) return cfg.maxPerDay;
  const days = Math.max(0, daysBetween(cfg.warmupStartDate, localDate));
  return Math.min(cfg.maxPerDay, cfg.warmupStartPerDay + days * cfg.warmupIncreasePerDay);
}

/** Random gap between two messages in ms. */
export function randomGapMs(cfg: ThrottleConfig, random: () => number = Math.random): number {
  const min = Math.max(0, cfg.minGapSeconds);
  const max = Math.max(min, cfg.maxGapSeconds);
  return Math.round((min + (max - min) * random()) * 1000);
}

/** May a first contact / follow-up be sent right now? */
export function bulkDecision(now: Date, cfg: ThrottleConfig, counters: DispatchCounters): Decision {
  const batch = activeBatch(now, cfg);
  if (!batch) {
    return { send: false, reason: "Außerhalb der Sendezeiten", retryAt: nextSendTime(now, cfg) };
  }
  if (counters.nextSendAllowedAt && counters.nextSendAllowedAt > now) {
    return {
      send: false,
      reason: "Abstand zwischen Nachrichten",
      retryAt: counters.nextSendAllowedAt,
    };
  }
  const limit = dailyLimit(localDateOf(now, cfg.timeZone ?? DEFAULT_TIME_ZONE), cfg);
  if (counters.sentToday >= limit) {
    return {
      send: false,
      reason: `Tageslimit erreicht (${limit})`,
      retryAt: nextSendTime(now, cfg),
    };
  }
  if (counters.sentInBatch >= cfg.maxPerBatch) {
    return {
      send: false,
      reason: `Limit pro Sendezeit erreicht (${cfg.maxPerBatch})`,
      retryAt: nextSendTime(now, cfg),
    };
  }
  return { send: true };
}

/** Reminders only keep the gap between messages. */
export function reminderDecision(now: Date, counters: DispatchCounters): Decision {
  if (counters.nextSendAllowedAt && counters.nextSendAllowedAt > now) {
    return {
      send: false,
      reason: "Abstand zwischen Nachrichten",
      retryAt: counters.nextSendAllowedAt,
    };
  }
  return { send: true };
}

/** Validates and normalises send times coming from the admin form. */
export function parseSendTimes(value: unknown): SendTime[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: SendTime[] = [];
  for (const item of value) {
    const weekday = Number((item as SendTime)?.weekday);
    const time = String((item as SendTime)?.time ?? "");
    const minutes = parseTimeOfDay(time);
    if (
      !Number.isInteger(weekday) ||
      weekday < 1 ||
      weekday > 7 ||
      minutes === null ||
      minutes >= 1440
    )
      continue;
    const normalized = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const key = `${weekday}-${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ weekday, time: normalized });
  }
  return result.sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time));
}

/**
 * End of the quiet hours if `now` lies within them, else null. Start and end are local
 * "HH:MM"; the span may cross midnight (e.g. 21:00–08:00). Equal times = no quiet hours.
 */
export function quietUntil(
  now: Date,
  start: string,
  end: string,
  timeZone = DEFAULT_TIME_ZONE,
): Date | null {
  const s = parseTimeOfDay(start);
  const e = parseTimeOfDay(end);
  if (s === null || e === null || s === e) return null;
  const today = localDateOf(now, timeZone);
  const minute = localMinuteOf(now, timeZone);
  if (s < e) return minute >= s && minute < e ? zonedTimeToUtc(today, e, timeZone) : null;
  if (minute >= s) return zonedTimeToUtc(addDays(today, 1), e, timeZone);
  if (minute < e) return zonedTimeToUtc(today, e, timeZone);
  return null;
}

/**
 * Immediate first contact: outside the quiet hours, independent of the send times, but
 * with the gap between messages and the daily limit (incl. warm-up).
 */
export function immediateDecision(
  now: Date,
  cfg: ThrottleConfig,
  counters: DispatchCounters,
  quiet: { start: string; end: string } | null,
): Decision {
  const tz = cfg.timeZone ?? DEFAULT_TIME_ZONE;
  const until = quiet ? quietUntil(now, quiet.start, quiet.end, tz) : null;
  if (until) return { send: false, reason: "Ruhezeit", retryAt: until };
  if (counters.nextSendAllowedAt && counters.nextSendAllowedAt > now) {
    return {
      send: false,
      reason: "Abstand zwischen Nachrichten",
      retryAt: counters.nextSendAllowedAt,
    };
  }
  const limit = dailyLimit(localDateOf(now, tz), cfg);
  if (counters.sentToday >= limit) {
    return { send: false, reason: `Tageslimit erreicht (${limit})`, retryAt: null };
  }
  return { send: true };
}
