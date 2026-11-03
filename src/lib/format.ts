export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Berlin";

const dateTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("de-DE", { timeZone: APP_TIMEZONE, dateStyle: "medium" });

export function formatDateTime(date: Date | null | undefined): string {
  return date ? dateTime.format(date) : "–";
}

export function formatDate(date: Date | null | undefined): string {
  return date ? dateOnly.format(date) : "–";
}

/** Prefers the normalised E.164 number, falls back to the raw input. */
export function formatPhone(e164: string | null, raw: string | null): string {
  return e164 ?? raw ?? "–";
}

function isLocalMidnight(d: Date): boolean {
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return hhmm === "00:00";
}

/** Formats a range; whole local days are shown as dates only ("22.12.2026 – 31.12.2026, ganztägig"). */
export function formatRange(start: Date, end: Date): string {
  if (isLocalMidnight(start) && isLocalMidnight(end)) {
    const from = formatDate(start);
    const to = formatDate(new Date(end.getTime() - 60_000));
    return `${from === to ? from : `${from} – ${to}`}, ganztägig`;
  }
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

const shortTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const shortDate = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
});

/** "gerade eben", "vor 5 Min.", "vor 3 Std.", "gestern, 14:20", "02.11." */
export function formatRelative(date: Date, now = new Date()): string {
  const diff = now.getTime() - date.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const hours = Math.round(min / 60);
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(d);
  if (dayOf(date) === dayOf(now)) return `vor ${hours} Std.`;
  const yesterday = new Date(now.getTime() - 24 * 3600_000);
  if (dayOf(date) === dayOf(yesterday)) return `gestern, ${shortTime.format(date)}`;
  return shortDate.format(date);
}
