/**
 * TeamUp calendar (https://teamup.com) as alternative to Google Calendar.
 *
 * Model: the whole studio shares ONE TeamUp calendar. Every entry has an "Artist"
 * field that says whose entry it is – either TeamUp's built-in "Wer" field ("who")
 * or a custom field. The app writes its consultations and tattoo sessions into one
 * configured sub-calendar and marks them with the tattooer's artist value; a tattooer
 * is busy whenever any entry carries their artist value (app entries excluded).
 *
 * API: https://api.teamup.com, header "Teamup-Token: <API key>", calendar key in the path.
 * Only the endpoints we need: events (list/get/create/update/delete), sub-calendars and
 * field definitions (for the admin settings).
 */
import { randomUUID } from "node:crypto";
import type { Interval } from "../scheduling/slots";
import { addDays, localDateOf, weekdayOf, zonedTimeToUtc } from "../time";
import {
  CalendarError,
  TEAMUP_PREFIX,
  type CalendarClient,
  type CalendarConnection,
  type CalendarEventInput,
} from "../google/calendar";
import { setting } from "@/lib/integrations/store";

export const TEAMUP_API = "https://api.teamup.com";

/**
 * The calendar key from TEAMUP_CALENDAR_KEY: accepts the bare key ("ks…") as well as a
 * pasted sharing link ("https://teamup.com/ks…/") and ignores quotes and spaces.
 */
export function normalizeCalendarKey(value: string | null | undefined): string | undefined {
  const v = value
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!v) return undefined;
  const m = /teamup\.com\/([^/?#\s]+)/i.exec(v);
  return (m ? m[1] : v.replace(/^\/+|\/+$/g, "")) || undefined;
}
/** Built-in "Wer" field of TeamUp entries. */
export const WHO_FIELD = "who";
/** TeamUp lets studios rename the built-in field (e.g. "Künstler"); internally it stays "who". */
export const WHO_FIELD_LABEL = "Eingebautes Feld (z. B. „Wer“ oder „Künstler“)";
/** remote_id prefix of entries written by this app (excluded from busy times). */
export const REMOTE_ID_PREFIX = "needl:";

export interface TeamupConfig {
  apiKey: string;
  calendarKey: string;
  /** Sub-calendar the app writes to. */
  subcalendarId: string | null;
  /** "who" or the id of a custom field. */
  artistFieldId: string | null;
}

export interface TeamupChoice {
  id: string;
  name: string;
}
export interface TeamupField {
  id: string;
  name: string;
  /** Choice fields: the allowed values; text fields (incl. "who"): null. */
  choices: TeamupChoice[] | null;
}
export interface TeamupSubcalendar {
  id: string;
  name: string;
}

/** Shape of a TeamUp event as far as we use it. */
export interface TeamupEvent {
  id: string;
  version?: string;
  subcalendar_ids?: number[];
  start_dt: string;
  end_dt: string;
  all_day?: boolean;
  title?: string;
  notes?: string | null;
  location?: string | null;
  who?: string | null;
  remote_id?: string | null;
  custom?: Record<string, unknown> | null;
  tz?: string;
}

export function teamupConfigured(cfg: TeamupConfig | null): cfg is TeamupConfig {
  // The default sub-calendar is optional: tattooers can choose their own
  return Boolean(cfg?.apiKey && cfg.calendarKey && cfg.artistFieldId);
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Does the entry belong to the given artist? */
export function eventHasArtist(ev: TeamupEvent, fieldId: string, artist: string): boolean {
  if (fieldId === WHO_FIELD) {
    return (ev.who ?? "").split(/[,;/&]|\bund\b/).some((name) => name.trim() && same(name, artist));
  }
  const value = ev.custom?.[fieldId];
  if (Array.isArray(value)) return value.some((v) => same(String(v), artist));
  if (typeof value === "string" || typeof value === "number") return same(String(value), artist);
  return false;
}

/**
 * Busy intervals of one artist: entries with their artist value or in their own
 * sub-calendar (entries written by the app are ignored – NEEDL knows them itself).
 */
/** Date of an all-day TeamUp value ("2026-11-10T23:59:00+00:00" -> "2026-11-10"). */
function allDayDate(value: string, timeZone: string): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? localDateOf(new Date(value), timeZone);
}

export function busyOfArtist(
  events: TeamupEvent[],
  fieldId: string,
  artist: string,
  timeZone: string,
  ownSubcalendarId?: string | null,
): Array<Interval & { title: string | null }> {
  const busy: Array<Interval & { title: string | null }> = [];
  for (const ev of events) {
    if (ev.remote_id?.startsWith(REMOTE_ID_PREFIX)) continue;
    const inOwn =
      Boolean(ownSubcalendarId) &&
      (ev.subcalendar_ids ?? []).some((id) => String(id) === String(ownSubcalendarId));
    if (!inOwn && !eventHasArtist(ev, fieldId, artist)) continue;
    if (ev.all_day) {
      // All-day entries are calendar dates: read the date as written, without converting
      // through a time zone (a TeamUp calendar in another zone would shift the end into
      // the next day and make every all-day entry one day too long)
      const startDay = allDayDate(ev.start_dt, timeZone);
      const endDay = allDayDate(ev.end_dt, timeZone);
      busy.push({
        start: zonedTimeToUtc(startDay, 0, timeZone),
        end: zonedTimeToUtc(addDays(endDay, 1), 0, timeZone),
        title: ev.title?.trim() || null,
      });
    } else {
      busy.push({
        start: new Date(ev.start_dt),
        end: new Date(ev.end_dt),
        title: ev.title?.trim() || null,
      });
    }
  }
  return busy;
}

/** "2026-11-06T14:00:00+01:00" – local wall time with offset, as TeamUp shows it. */
export function isoWithOffset(date: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const offset = parts.timeZoneName === "GMT" ? "+00:00" : parts.timeZoneName.replace("GMT", "");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** TeamUp notes are HTML: paragraphs per line, links stay clickable. */
export function notesHtml(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      escapeHtml(line).replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}">${url}</a>`),
    )
    .map((line) => `<p>${line || "&nbsp;"}</p>`)
    .join("");
}

/** Request body for creating/updating an entry. */
export function teamupEventBody(
  event: CalendarEventInput,
  cfg: Pick<TeamupConfig, "subcalendarId" | "artistFieldId">,
  artist: string,
  remoteId: string,
) {
  const timeFields = event.allDay
    ? {
        all_day: true,
        start_dt: isoWithOffset(
          zonedTimeToUtc(event.allDay.startDate, 0, event.timeZone),
          event.timeZone,
        ),
        // TeamUp's all-day end is the last day itself (inclusive)
        end_dt: isoWithOffset(
          zonedTimeToUtc(addDays(event.allDay.endDate, -1), 0, event.timeZone),
          event.timeZone,
        ),
      }
    : {
        all_day: false,
        start_dt: isoWithOffset(event.start, event.timeZone),
        end_dt: isoWithOffset(event.end, event.timeZone),
      };
  return {
    subcalendar_ids: [Number(cfg.subcalendarId)],
    title: event.summary,
    notes: notesHtml(event.description),
    location: event.location ?? "",
    tz: event.timeZone,
    remote_id: remoteId,
    ...timeFields,
    ...(cfg.artistFieldId === WHO_FIELD
      ? { who: artist }
      : { custom: { [cfg.artistFieldId!]: [artist] } }),
  };
}

function subcalendarOf(calendarId: string): string {
  return calendarId.slice(TEAMUP_PREFIX.length);
}

/** Pick a display name from TeamUp's name values (plain string or translations). */
function nameOf(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const first = v.de ?? v.en ?? Object.values(v)[0];
    if (typeof first === "string") return first;
  }
  return fallback;
}

export function parseFieldDefinitions(json: unknown): TeamupField[] {
  const root = json as Record<string, unknown>;
  const list = (root?.definitions ?? root?.field_definitions ?? root?.fields ?? json) as unknown;
  if (!Array.isArray(list)) return [];
  return list
    .filter((f) => f && typeof f === "object" && (f as { id?: unknown }).id !== undefined)
    .filter((f) => (f as { active?: boolean }).active !== false)
    .map((f) => {
      const d = f as Record<string, unknown>;
      const choices = Array.isArray(d.choices)
        ? (d.choices as Array<Record<string, unknown>>)
            .filter((c) => c.archived !== true)
            .map((c) => ({ id: String(c.id), name: nameOf(c.name, String(c.id)) }))
        : null;
      return { id: String(d.id), name: nameOf(d.name, String(d.id)), choices };
    });
}

/** Real TeamUp REST client. */
export class TeamupClient implements CalendarClient {
  readonly mock = false;

  constructor(
    private readonly loadConfig: () => Promise<TeamupConfig | null>,
    private readonly timeZone = process.env.APP_TIMEZONE || "Europe/Berlin",
  ) {}

  private async config(): Promise<TeamupConfig> {
    const cfg = await this.loadConfig();
    if (!cfg?.apiKey || !cfg.calendarKey)
      throw new CalendarError("TeamUp ist nicht eingerichtet (API-Schlüssel/Kalender fehlen).");
    return cfg;
  }

  async request<T>(path: string, init: RequestInit = {}, cfg?: TeamupConfig): Promise<T> {
    const c = cfg ?? (await this.config());
    const res = await fetch(`${TEAMUP_API}/${encodeURIComponent(c.calendarKey)}${path}`, {
      ...init,
      headers: {
        "Teamup-Token": c.apiKey,
        "content-type": "application/json",
        accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new CalendarError(
        `TeamUp ${res.status}: ${(await res.text()).slice(0, 300)}`,
        res.status,
      );
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  /** Short-lived cache: one calendar page asks for the same range once per tattooer. */
  private eventCache = new Map<string, { at: number; events: Promise<TeamupEvent[]> }>();

  async listEvents(from: Date, to: Date, cfg?: TeamupConfig): Promise<TeamupEvent[]> {
    if (!cfg) {
      const key = `${from.toISOString()}|${to.toISOString()}`;
      const hit = this.eventCache.get(key);
      if (hit && Date.now() - hit.at < 20_000) return hit.events;
      const events = this.fetchEvents(from, to);
      this.eventCache.set(key, { at: Date.now(), events });
      events.catch(() => this.eventCache.delete(key));
      if (this.eventCache.size > 50) this.eventCache.delete(this.eventCache.keys().next().value!);
      return events;
    }
    return this.fetchEvents(from, to, cfg);
  }

  private async fetchEvents(from: Date, to: Date, cfg?: TeamupConfig): Promise<TeamupEvent[]> {
    const qs = new URLSearchParams({
      startDate: localDateOf(from, this.timeZone),
      endDate: localDateOf(to, this.timeZone),
    });
    const res = await this.request<{ events?: TeamupEvent[] }>(`/events?${qs}`, {}, cfg);
    return (res.events ?? []).filter((e) => new Date(e.end_dt) > from && new Date(e.start_dt) < to);
  }

  async getBusy(conn: CalendarConnection, from: Date, to: Date): Promise<Interval[]> {
    const cfg = await this.config();
    if (!cfg.artistFieldId || !conn.teamupArtist)
      throw new CalendarError("TeamUp: Artist ist nicht zugeordnet.");
    const events = await this.listEvents(from, to, cfg);
    return busyOfArtist(
      events,
      cfg.artistFieldId,
      conn.teamupArtist,
      this.timeZone,
      conn.teamupSubcalendarId,
    );
  }

  async listBusyEntries(conn: CalendarConnection, from: Date, to: Date) {
    return this.getBusy(conn, from, to) as Promise<Array<Interval & { title: string | null }>>;
  }

  /** The tattooer's own sub-calendar, otherwise the studio default from the settings. */
  async ensureConsultationCalendar(conn?: CalendarConnection): Promise<string> {
    const cfg = await this.config();
    const sub = conn?.teamupSubcalendarId || cfg.subcalendarId;
    if (!sub)
      throw new CalendarError(
        "TeamUp: Kein Unterkalender gewählt (eigenen unter Verfügbarkeit wählen oder Standard in den Einstellungen).",
      );
    return `${TEAMUP_PREFIX}${sub}`;
  }

  private bodyFor(
    conn: CalendarConnection,
    calendarId: string,
    event: CalendarEventInput,
    cfg: TeamupConfig,
    remoteId: string,
  ) {
    if (!conn.teamupArtist || !cfg.artistFieldId)
      throw new CalendarError("TeamUp: Artist ist nicht zugeordnet.");
    return teamupEventBody(
      event,
      { subcalendarId: subcalendarOf(calendarId), artistFieldId: cfg.artistFieldId },
      conn.teamupArtist,
      remoteId,
    );
  }

  async createEvent(conn: CalendarConnection, calendarId: string, event: CalendarEventInput) {
    const cfg = await this.config();
    const res = await this.request<{ event: { id: string | number } }>(
      "/events",
      {
        method: "POST",
        body: JSON.stringify(
          this.bodyFor(conn, calendarId, event, cfg, `${REMOTE_ID_PREFIX}${randomUUID()}`),
        ),
      },
      cfg,
    );
    return String(res.event.id);
  }

  private async getEvent(eventId: string, cfg: TeamupConfig): Promise<TeamupEvent | null> {
    try {
      const res = await this.request<{ event: TeamupEvent }>(
        `/events/${encodeURIComponent(eventId)}`,
        {},
        cfg,
      );
      return res.event;
    } catch (err) {
      if (err instanceof CalendarError && (err.status === 404 || err.status === 410)) return null;
      throw err;
    }
  }

  async updateEvent(
    conn: CalendarConnection,
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ) {
    const cfg = await this.config();
    const current = await this.getEvent(eventId, cfg);
    if (!current) throw new CalendarError("TeamUp: Eintrag nicht gefunden.", 404);
    await this.request(
      `/events/${encodeURIComponent(eventId)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          ...current,
          ...this.bodyFor(
            conn,
            calendarId,
            event,
            cfg,
            current.remote_id ?? `${REMOTE_ID_PREFIX}${randomUUID()}`,
          ),
          id: current.id,
          ...(current.version ? { version: current.version } : {}),
        }),
      },
      cfg,
    );
  }

  async deleteEvent(_conn: CalendarConnection, _calendarId: string, eventId: string) {
    const cfg = await this.config();
    const current = await this.getEvent(eventId, cfg);
    if (!current) return; // already gone
    const qs = current.version ? `?version=${encodeURIComponent(current.version)}` : "";
    try {
      await this.request(`/events/${encodeURIComponent(eventId)}${qs}`, { method: "DELETE" }, cfg);
    } catch (err) {
      if (err instanceof CalendarError && (err.status === 404 || err.status === 410)) return;
      throw err;
    }
  }

  /** Admin settings: available sub-calendars. */
  async listSubcalendars(): Promise<TeamupSubcalendar[]> {
    const res = await this.request<{
      subcalendars?: Array<{ id: number | string; name: string; active?: boolean }>;
    }>("/subcalendars");
    return (res.subcalendars ?? [])
      .filter((s) => s.active !== false)
      .map((s) => ({ id: String(s.id), name: s.name }));
  }

  /** Names used in the built-in "Wer" field of recent entries (suggestions for tattooers). */
  async recentWhoValues(days = 60): Promise<string[]> {
    const now = new Date();
    const events = await this.listEvents(new Date(now.getTime() - days * 86_400_000), now);
    const names = new Set<string>();
    for (const e of events)
      for (const n of String(e.who ?? "").split(/[,;]/)) if (n.trim()) names.add(n.trim());
    return [...names].sort((a, b) => a.localeCompare(b, "de"));
  }

  /** Admin settings: fields that can serve as "Artist" (built-in "Wer" + custom fields). */
  async listFields(): Promise<TeamupField[]> {
    const who: TeamupField = { id: WHO_FIELD, name: WHO_FIELD_LABEL, choices: null };
    try {
      return [who, ...parseFieldDefinitions(await this.request<unknown>("/field-definitions"))];
    } catch (err) {
      // Custom field definitions need an administrator link; "Wer" works without them.
      if (err instanceof CalendarError && err.status === 403) return [who];
      throw err;
    }
  }
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Development stand-in for TeamUp: one sample sub-calendar and an "Artist" choice field.
 * Busy times are deterministic per artist and day; writes are only logged.
 */
export class MockTeamupClient implements CalendarClient {
  readonly mock = true;

  constructor(private readonly artists: () => Promise<TeamupChoice[]> = async () => []) {}

  async getBusy(conn: CalendarConnection, from: Date, to: Date): Promise<Interval[]> {
    const busy: Interval[] = [];
    for (let day = localDateOf(from); day <= localDateOf(to); day = addDays(day, 1)) {
      if (weekdayOf(day) > 6) continue;
      const h = hash(`${conn.teamupArtist ?? conn.tattooerId}${day}`);
      if (h % 2 === 0) {
        const start = (10 + (h % 7)) * 60;
        busy.push({ start: zonedTimeToUtc(day, start), end: zonedTimeToUtc(day, start + 120) });
      }
    }
    return busy.filter((b) => b.end > from && b.start < to);
  }

  async ensureConsultationCalendar() {
    return `${TEAMUP_PREFIX}mock-studio-termine`;
  }

  async createEvent(conn: CalendarConnection, calendarId: string, event: CalendarEventInput) {
    const id = `mock-teamup-${randomUUID()}`;
    console.info(
      `[mock-teamup] create ${id} in ${calendarId} (Artist ${conn.teamupArtist}): ${event.summary}`,
    );
    return id;
  }

  async updateEvent(
    _c: CalendarConnection,
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ) {
    console.info(`[mock-teamup] update ${eventId} in ${calendarId}: ${event.summary}`);
  }

  async deleteEvent(_c: CalendarConnection, calendarId: string, eventId: string) {
    console.info(`[mock-teamup] delete ${eventId} in ${calendarId}`);
  }

  async listSubcalendars(): Promise<TeamupSubcalendar[]> {
    return [
      { id: "mock-studio-termine", name: "Studio-Termine (Beispiel)" },
      { id: "mock-privat", name: "Privat (Beispiel)" },
    ];
  }

  async recentWhoValues(): Promise<string[]> {
    return ["Kim", "Alex"];
  }

  async listFields(): Promise<TeamupField[]> {
    return [
      { id: WHO_FIELD, name: WHO_FIELD_LABEL, choices: null },
      { id: "artist", name: "Artist (Beispiel)", choices: await this.artists() },
    ];
  }
}

export function isTeamupMock(): boolean {
  return setting("TEAMUP_MOCK") === "true";
}
