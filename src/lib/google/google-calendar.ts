import { decryptSecret } from "../crypto";
import type { Interval } from "../scheduling/slots";
import {
  APP_CALENDAR_NAME,
  CalendarError,
  type CalendarClient,
  type CalendarConnection,
  type CalendarEventInput,
} from "./calendar";
import { refreshAccessToken } from "./oauth";

const API = "https://www.googleapis.com/calendar/v3";
const accessTokens = new Map<string, { token: string; expiresAt: number }>();

/** Google Calendar REST client (no SDK, only the few endpoints we need). */
export class GoogleCalendarClient implements CalendarClient {
  readonly mock = false;

  private async accessToken(conn: CalendarConnection): Promise<string> {
    const cached = accessTokens.get(conn.tattooerId);
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    if (!conn.refreshTokenEnc)
      throw new CalendarError(
        "Google-Kalender ist nicht verbunden (kein Google-Zugang gespeichert).",
      );
    const { accessToken, expiresAt } = await refreshAccessToken(
      decryptSecret(conn.refreshTokenEnc),
    );
    accessTokens.set(conn.tattooerId, { token: accessToken, expiresAt });
    return accessToken;
  }

  private async request<T>(
    conn: CalendarConnection,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${await this.accessToken(conn)}`,
        "content-type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) accessTokens.delete(conn.tattooerId);
    if (!res.ok) {
      throw new CalendarError(
        `Google Calendar ${res.status}: ${(await res.text()).slice(0, 300)}`,
        res.status,
      );
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async getBusy(conn: CalendarConnection, from: Date, to: Date): Promise<Interval[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const qs = new URLSearchParams({ minAccessRole: "freeBusyReader", maxResults: "250" });
      if (pageToken) qs.set("pageToken", pageToken);
      const page = await this.request<{
        items?: Array<{ id: string; deleted?: boolean }>;
        nextPageToken?: string;
      }>(conn, `/users/me/calendarList?${qs}`);
      for (const c of page.items ?? []) if (!c.deleted) ids.push(c.id);
      pageToken = page.nextPageToken;
    } while (pageToken);
    if (!ids.includes("primary")) ids.unshift("primary");
    // The app calendar ("Studio-Termine") only holds entries the database knows already;
    // excluding it lets a consultation move within its own old time slot.
    const relevant = ids.filter((id) => id !== conn.calendarId);
    ids.length = 0;
    ids.push(...relevant);

    const busy: Interval[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const result = await this.request<{
        calendars: Record<
          string,
          { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }
        >;
      }>(conn, "/freeBusy", {
        method: "POST",
        body: JSON.stringify({
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: ids.slice(i, i + 50).map((id) => ({ id })),
        }),
      });
      for (const [id, cal] of Object.entries(result.calendars ?? {})) {
        if (cal.errors?.length) {
          if (id === "primary")
            throw new CalendarError("Free/Busy des Hauptkalenders nicht abrufbar.");
          console.warn(`[calendar] free/busy error for a secondary calendar of ${conn.tattooerId}`);
          continue;
        }
        for (const b of cal.busy ?? [])
          busy.push({ start: new Date(b.start), end: new Date(b.end) });
      }
    }
    return busy;
  }

  async ensureConsultationCalendar(conn: CalendarConnection): Promise<string> {
    if (conn.calendarId) return conn.calendarId;
    const created = await this.request<{ id: string }>(conn, "/calendars", {
      method: "POST",
      body: JSON.stringify({
        summary: APP_CALENDAR_NAME,
        timeZone: process.env.APP_TIMEZONE || "Europe/Berlin",
      }),
    });
    return created.id;
  }

  private body(event: CalendarEventInput) {
    return JSON.stringify({
      summary: event.summary,
      description: event.description,
      location: event.location ?? undefined,
      ...(event.allDay
        ? { start: { date: event.allDay.startDate }, end: { date: event.allDay.endDate } }
        : {
            start: { dateTime: event.start.toISOString(), timeZone: event.timeZone },
            end: { dateTime: event.end.toISOString(), timeZone: event.timeZone },
          }),
      visibility: "private",
      reminders: { useDefault: true },
    });
  }

  async createEvent(conn: CalendarConnection, calendarId: string, event: CalendarEventInput) {
    const created = await this.request<{ id: string }>(
      conn,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: "POST", body: this.body(event) },
    );
    return created.id;
  }

  async updateEvent(
    conn: CalendarConnection,
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ) {
    await this.request(
      conn,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        body: this.body(event),
      },
    );
  }

  async deleteEvent(conn: CalendarConnection, calendarId: string, eventId: string) {
    try {
      await this.request(
        conn,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: "DELETE",
        },
      );
    } catch (err) {
      // Already deleted in Google: fine.
      if (err instanceof CalendarError && (err.status === 404 || err.status === 410)) return;
      throw err;
    }
  }

  async renameCalendar(conn: CalendarConnection, calendarId: string, name: string) {
    try {
      await this.request(conn, `/calendars/${encodeURIComponent(calendarId)}`, {
        method: "PATCH",
        body: JSON.stringify({ summary: name }),
      });
      return "ok" as const;
    } catch (err) {
      if (err instanceof CalendarError && (err.status === 404 || err.status === 410))
        return "missing" as const;
      throw err;
    }
  }
}
