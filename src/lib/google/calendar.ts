import type { Interval } from "../scheduling/slots";

/** Name of the app calendar in each tattooer's Google account. */
export const APP_CALENDAR_NAME = "Studio-Termine";

/** Connection data of one tattooer's Google account. */
export interface CalendarConnection {
  tattooerId: string;
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
  /** Busy intervals over ALL calendars of the person. */
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
