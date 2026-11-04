import type { Interval } from "../scheduling/slots";
import {
  isTeamupCalendarId,
  type CalendarClient,
  type CalendarConnection,
  type CalendarEventInput,
} from "../google/calendar";

/**
 * Dispatches calendar calls to Google or TeamUp: busy times and the app calendar
 * by the tattooer's chosen provider, event operations by the calendar the event lives in
 * (so old Google events can still be removed after a switch to TeamUp, and vice versa).
 */
export class RoutingCalendarClient implements CalendarClient {
  readonly mock: boolean;

  constructor(
    readonly google: CalendarClient,
    readonly teamup: CalendarClient,
  ) {
    this.mock = google.mock && teamup.mock;
  }

  private byProvider(conn: CalendarConnection) {
    return conn.provider === "TEAMUP" ? this.teamup : this.google;
  }

  private byCalendar(calendarId: string) {
    return isTeamupCalendarId(calendarId) ? this.teamup : this.google;
  }

  getBusy(conn: CalendarConnection, from: Date, to: Date): Promise<Interval[]> {
    return this.byProvider(conn).getBusy(conn, from, to);
  }

  ensureConsultationCalendar(conn: CalendarConnection): Promise<string> {
    if (conn.provider !== "TEAMUP" && isTeamupCalendarId(conn.calendarId)) {
      // Switched back to Google: never hand a TeamUp id to Google
      return this.google.ensureConsultationCalendar({ ...conn, calendarId: null });
    }
    return this.byProvider(conn).ensureConsultationCalendar(conn);
  }

  createEvent(conn: CalendarConnection, calendarId: string, event: CalendarEventInput) {
    return this.byCalendar(calendarId).createEvent(conn, calendarId, event);
  }

  updateEvent(
    conn: CalendarConnection,
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ) {
    return this.byCalendar(calendarId).updateEvent(conn, calendarId, eventId, event);
  }

  deleteEvent(conn: CalendarConnection, calendarId: string, eventId: string) {
    return this.byCalendar(calendarId).deleteEvent(conn, calendarId, eventId);
  }

  async renameCalendar(conn: CalendarConnection, calendarId: string, name: string) {
    // The shared TeamUp sub-calendar is named by the studio, not by the app.
    if (isTeamupCalendarId(calendarId) || !this.google.renameCalendar) return "ok" as const;
    return this.google.renameCalendar(conn, calendarId, name);
  }
}
