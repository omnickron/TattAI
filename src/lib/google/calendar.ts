import type { Interval } from "../scheduling/slots";

/** Name of the app calendar in each tattooer's Google account. */
export const APP_CALENDAR_NAME = "Studio-Termine";

export type CalendarProviderName = "GOOGLE" | "TEAMUP";

/** Prefix of app calendar ids that live in the shared TeamUp calendar. */
export const TEAMUP_PREFIX = "teamup:";

export function isTeamupCalendarId(calendarId: string | null | undefined): boolean {
  return Boolean(calendarId?.startsWith(TEAMUP_PREFIX));
}

/** Connection data of one tattooer's calendar (Google account or TeamUp artist). */
export interface CalendarConnection {
  tattooerId: string;
  /** Calendar the tattooer currently uses (default: Google). */
  provider?: CalendarProviderName;
  /** TeamUp: value of the "Artist" field that marks this tattooer's entries. */
  teamupArtist?: string | null;
  /** TeamUp: the tattooer's own sub-calendar (null = studio default). */
  teamupSubcalendarId?: string | null;
  /** Encrypted refresh token (null in mock mode). */
  refreshTokenEnc: string | null;
  /** The tattooer's app calendar ("Studio-Termine"): consultations and tattoo sessions. */
  calendarId: string | null;
}

export interface CalendarEventInput {
  summary: string;
  description: string;
  location?: string | null;
  start: Date;
  end: Date;
  timeZone: string;
  /** All-day event: local dates ("YYYY-MM-DD"), end exclusive. start/end are then ignored. */
  allDay?: { startDate: string; endDate: string };
}

export interface CalendarClient {
  readonly mock: boolean;
  /** Busy intervals of the person (Google: all calendars; TeamUp: entries with their artist). */
  getBusy(conn: CalendarConnection, from: Date, to: Date): Promise<Interval[]>;
  /** Returns the id of the app-created "Studio-Termine" calendar, creating it if needed. */
  ensureConsultationCalendar(conn: CalendarConnection): Promise<string>;
  createEvent(
    conn: CalendarConnection,
    calendarId: string,
    event: CalendarEventInput,
  ): Promise<string>;
  updateEvent(
    conn: CalendarConnection,
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<void>;
  deleteEvent(conn: CalendarConnection, calendarId: string, eventId: string): Promise<void>;
  /** Renames the app calendar; "missing" if it no longer exists in Google. */
  renameCalendar?(
    conn: CalendarConnection,
    calendarId: string,
    name: string,
  ): Promise<"ok" | "missing">;
}

export class CalendarError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CalendarError";
  }
}
