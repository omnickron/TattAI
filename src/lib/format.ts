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
