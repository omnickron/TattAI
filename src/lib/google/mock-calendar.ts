import { randomUUID } from "node:crypto";
import type { Interval } from "../scheduling/slots";
import { addDays, localDateOf, weekdayOf, zonedTimeToUtc } from "../time";
import type { CalendarClient, CalendarConnection, CalendarEventInput } from "./calendar";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Development stand-in for Google Calendar. Busy times are deterministic
 * per tattooer and day (lunch break + one private appointment on some days);
 * events are only logged.
 */
export class MockCalendarClient implements CalendarClient {
  readonly mock = true;

  async getBusy(conn: CalendarConnection, from: Date, to: Date): Promise<Interval[]> {
    const busy: Interval[] = [];
    for (let day = localDateOf(from); day <= localDateOf(to); day = addDays(day, 1)) {
      if (weekdayOf(day) > 5) continue;
      busy.push({ start: zonedTimeToUtc(day, 13 * 60), end: zonedTimeToUtc(day, 14 * 60) });
      const h = hash(conn.tattooerId + day);
      if (h % 3 === 0) {
        const start = (9 + (h % 8)) * 60;
        busy.push({ start: zonedTimeToUtc(day, start), end: zonedTimeToUtc(day, start + 90) });
      }
    }
    return busy.filter((b) => b.end > from && b.start < to);
  }

  async ensureConsultationCalendar(conn: CalendarConnection) {
    return conn.calendarId ?? `mock-beratungen-${conn.tattooerId}`;
  }

  async createEvent(_conn: CalendarConnection, calendarId: string, event: CalendarEventInput) {
    const id = `mock-${randomUUID()}`;
    console.info(
      `[mock-calendar] create ${id} in ${calendarId}: ${event.summary} ${event.start.toISOString()}`,
    );
    return id;
  }

  async updateEvent(
    _conn: CalendarConnection,
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ) {
    console.info(`[mock-calendar] update ${eventId} in ${calendarId}: ${event.summary}`);
  }

  async deleteEvent(_conn: CalendarConnection, calendarId: string, eventId: string) {
    console.info(`[mock-calendar] delete ${eventId} in ${calendarId}`);
  }
}

export function isCalendarMock(): boolean {
  return process.env.GOOGLE_CALENDAR_MOCK === "true";
}
