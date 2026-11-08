import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutingCalendarClient } from "../calendar/routing";
import type { CalendarClient, CalendarConnection, CalendarEventInput } from "../google/calendar";
import {
  busyOfArtist,
  eventHasArtist,
  isoWithOffset,
  normalizeCalendarKey,
  notesHtml,
  parseFieldDefinitions,
  REMOTE_ID_PREFIX,
  TeamupClient,
  teamupEventBody,
  WHO_FIELD,
  WHO_FIELD_LABEL,
  type TeamupConfig,
  type TeamupEvent,
} from "./teamup";

const TZ = "Europe/Berlin";
const ev = (over: Partial<TeamupEvent>): TeamupEvent => ({
  id: "1",
  start_dt: "2026-11-09T10:00:00+01:00",
  end_dt: "2026-11-09T12:00:00+01:00",
  ...over,
});

describe("artist matching and busy times", () => {
  it("matches custom choice fields and the built-in 'who' field", () => {
    expect(eventHasArtist(ev({ custom: { artist: ["kim"] } }), "artist", "kim")).toBe(true);
    expect(eventHasArtist(ev({ custom: { artist: ["alex"] } }), "artist", "kim")).toBe(false);
    expect(eventHasArtist(ev({ custom: { artist: "Kim" } }), "artist", "kim")).toBe(true);
    expect(eventHasArtist(ev({ who: "Kim Novak, Alex" }), WHO_FIELD, "kim novak")).toBe(true);
    expect(eventHasArtist(ev({ who: "Kimberly" }), WHO_FIELD, "Kim")).toBe(false);
  });

  it("counts only the artist's entries, ignores the app's own and covers all-day entries", () => {
    const busy = busyOfArtist(
      [
        ev({ id: "a", custom: { artist: ["kim"] } }),
        ev({ id: "b", custom: { artist: ["alex"] } }),
        ev({ id: "c", custom: { artist: ["kim"] }, remote_id: `${REMOTE_ID_PREFIX}x` }),
        ev({
          id: "d",
          custom: { artist: ["kim"] },
          all_day: true,
          start_dt: "2026-11-10T00:00:00+01:00",
          end_dt: "2026-11-10T00:00:00+01:00",
        }),
      ],
      "artist",
      "kim",
      TZ,
    );
    expect(busy).toEqual([
      {
        start: new Date("2026-11-09T09:00:00Z"),
        end: new Date("2026-11-09T11:00:00Z"),
        title: null,
      },
      {
        start: new Date("2026-11-09T23:00:00Z"),
        end: new Date("2026-11-10T23:00:00Z"),
        title: null,
      },
    ]);
  });
});

describe("event body", () => {
  const input: CalendarEventInput = {
    summary: "Beratung: Mia",
    description: "Motiv: Rose <klein>\nhttps://app.test/leads/1",
    location: "Musterstraße 1",
    start: new Date("2026-07-01T08:00:00Z"),
    end: new Date("2026-07-01T08:30:00Z"),
    timeZone: TZ,
  };

  it("writes local times with offset (summer and winter time)", () => {
    expect(isoWithOffset(new Date("2026-07-01T08:00:00Z"), TZ)).toBe("2026-07-01T10:00:00+02:00");
    expect(isoWithOffset(new Date("2026-12-01T08:00:00Z"), TZ)).toBe("2026-12-01T09:00:00+01:00");
  });

  it("marks the entry with the artist, the sub-calendar and the app's remote id", () => {
    const body = teamupEventBody(
      input,
      { subcalendarId: "42", artistFieldId: "artist" },
      "kim",
      "needl:1",
    );
    expect(body).toMatchObject({
      subcalendar_ids: [42],
      title: "Beratung: Mia",
      start_dt: "2026-07-01T10:00:00+02:00",
      end_dt: "2026-07-01T10:30:00+02:00",
      all_day: false,
      remote_id: "needl:1",
      custom: { artist: ["kim"] },
    });
    expect(body.notes).toContain("Rose &lt;klein&gt;");
    expect(body.notes).toContain('<a href="https://app.test/leads/1">');
    const who = teamupEventBody(
      input,
      { subcalendarId: "42", artistFieldId: WHO_FIELD },
      "Kim",
      "x",
    );
    expect(who).toMatchObject({ who: "Kim" });
    expect(who).not.toHaveProperty("custom");
  });

  it("uses an inclusive end day for all-day entries", () => {
    const body = teamupEventBody(
      { ...input, allDay: { startDate: "2026-11-12", endDate: "2026-11-13" } },
      { subcalendarId: "1", artistFieldId: "artist" },
      "kim",
      "x",
    );
    expect(body).toMatchObject({
      all_day: true,
      start_dt: "2026-11-12T00:00:00+01:00",
      end_dt: "2026-11-12T00:00:00+01:00",
    });
  });

  it("escapes notes into HTML paragraphs", () => {
    expect(notesHtml("a & b\n\nc")).toBe("<p>a &amp; b</p><p>&nbsp;</p><p>c</p>");
  });
});

describe("field definitions", () => {
  it("parses choice fields and skips inactive/archived ones", () => {
    const fields = parseFieldDefinitions({
      definitions: [
        {
          id: "artist",
          name: "Artist",
          type: "choice",
          choices: [
            { id: "kim", name: "Kim" },
            { id: "old", name: "Alt", archived: true },
          ],
        },
        { id: "notes2", name: { de: "Hinweis", en: "Note" }, type: "text" },
        { id: "gone", name: "Weg", active: false },
      ],
    });
    expect(fields).toEqual([
      { id: "artist", name: "Artist", choices: [{ id: "kim", name: "Kim" }] },
      { id: "notes2", name: "Hinweis", choices: null },
    ]);
  });
});

describe("TeamupClient (HTTP)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const cfg: TeamupConfig = {
    apiKey: "key",
    calendarKey: "ksecret",
    subcalendarId: "42",
    artistFieldId: "artist",
  };
  const conn: CalendarConnection = {
    tattooerId: "t1",
    provider: "TEAMUP",
    teamupArtist: "kim",
    refreshTokenEnc: null,
    calendarId: "teamup:42",
  };

  it("lists events with the token header and filters by artist", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        events: [
          ev({ custom: { artist: ["kim"] } }),
          ev({ id: "2", custom: { artist: ["alex"] } }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new TeamupClient(async () => cfg, TZ);
    const busy = await client.getBusy(
      conn,
      new Date("2026-11-09T07:00:00Z"),
      new Date("2026-11-09T17:00:00Z"),
    );
    expect(busy).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://api.teamup.com/ksecret/events?startDate=2026-11-09&endDate=2026-11-09",
    );
    expect((init.headers as Record<string, string>)["Teamup-Token"]).toBe("key");
  });

  it("creates entries in the sub-calendar and tolerates deleting a missing entry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ event: { id: 777 } }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new TeamupClient(async () => cfg, TZ);
    const id = await client.createEvent(conn, "teamup:42", {
      summary: "Tattoo: Mia",
      description: "",
      start: new Date("2026-11-09T10:00:00Z"),
      end: new Date("2026-11-09T12:00:00Z"),
      timeZone: TZ,
    });
    expect(id).toBe("777");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ subcalendar_ids: [42], custom: { artist: ["kim"] } });
    expect(body.remote_id).toMatch(/^needl:/);
    await expect(client.deleteEvent(conn, "teamup:42", "777")).resolves.toBeUndefined();
  });

  it("refuses to work without an assigned artist or credentials", async () => {
    const client = new TeamupClient(async () => cfg, TZ);
    await expect(
      client.getBusy({ ...conn, teamupArtist: null }, new Date(), new Date()),
    ).rejects.toThrow(/Artist/);
    const unconfigured = new TeamupClient(async () => null, TZ);
    await expect(unconfigured.ensureConsultationCalendar()).rejects.toThrow(/nicht eingerichtet/);
  });
});

describe("RoutingCalendarClient", () => {
  function fake(name: string, log: string[]): CalendarClient {
    return {
      mock: true,
      getBusy: async () => (log.push(`${name}:busy`), []),
      ensureConsultationCalendar: async (c) => (
        log.push(`${name}:ensure:${c.calendarId}`),
        `${name}-cal`
      ),
      createEvent: async () => (log.push(`${name}:create`), "e"),
      updateEvent: async () => void log.push(`${name}:update`),
      deleteEvent: async () => void log.push(`${name}:delete`),
    };
  }
  const base: CalendarConnection = { tattooerId: "t", refreshTokenEnc: "x", calendarId: null };

  it("routes busy times by provider and events by the calendar they live in", async () => {
    const log: string[] = [];
    const router = new RoutingCalendarClient(fake("google", log), fake("teamup", log));
    const ev: CalendarEventInput = {
      summary: "",
      description: "",
      start: new Date(),
      end: new Date(),
      timeZone: TZ,
    };
    await router.getBusy({ ...base, provider: "TEAMUP" }, new Date(), new Date());
    await router.getBusy({ ...base, provider: "GOOGLE" }, new Date(), new Date());
    // An old Google event is removed via Google although the tattooer now uses TeamUp
    await router.deleteEvent({ ...base, provider: "TEAMUP" }, "google-cal-id", "e1");
    await router.createEvent({ ...base, provider: "TEAMUP" }, "teamup:42", ev);
    // Back on Google, a stale TeamUp id is never handed to Google
    await router.ensureConsultationCalendar({
      ...base,
      provider: "GOOGLE",
      calendarId: "teamup:42",
    });
    expect(log).toEqual([
      "teamup:busy",
      "google:busy",
      "google:delete",
      "teamup:create",
      "google:ensure:null",
    ]);
  });
});

describe("calendar key from the environment", () => {
  it("accepts the bare key and pasted sharing links", () => {
    expect(normalizeCalendarKey("ksabc123")).toBe("ksabc123");
    expect(normalizeCalendarKey(' "ksabc123" ')).toBe("ksabc123");
    expect(normalizeCalendarKey("https://teamup.com/ksabc123")).toBe("ksabc123");
    expect(normalizeCalendarKey("https://teamup.com/ksabc123/?view=w")).toBe("ksabc123");
    expect(normalizeCalendarKey("")).toBeUndefined();
  });
});

describe("fields without administrator rights", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to the built-in 'Wer' field when custom fields are forbidden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":{"id":"no_permission"}}', { status: 403 })),
    );
    const client = new TeamupClient(async () => ({
      apiKey: "k",
      calendarKey: "ks1",
      subcalendarId: null,
      artistFieldId: null,
    }));
    expect(await client.listFields()).toEqual([
      { id: WHO_FIELD, name: WHO_FIELD_LABEL, choices: null },
    ]);
  });
});

describe("own sub-calendar per tattooer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts entries in the own sub-calendar and entries with the own name as busy", () => {
    const events = [
      ev({
        id: "1",
        who: "",
        subcalendar_ids: [12675385],
        start_dt: "2026-11-09T10:00:00+01:00",
        end_dt: "2026-11-09T11:00:00+01:00",
      }),
      ev({
        id: "2",
        who: "Krissi",
        subcalendar_ids: [12092668],
        start_dt: "2026-11-09T12:00:00+01:00",
        end_dt: "2026-11-09T13:00:00+01:00",
      }),
      ev({
        id: "3",
        who: "Nico",
        subcalendar_ids: [13354656],
        start_dt: "2026-11-09T14:00:00+01:00",
        end_dt: "2026-11-09T15:00:00+01:00",
      }),
    ];
    const busy = busyOfArtist(events, WHO_FIELD, "Krissi", "Europe/Berlin", "12675385");
    expect(busy.map((b) => b.start.toISOString())).toEqual([
      "2026-11-09T09:00:00.000Z",
      "2026-11-09T11:00:00.000Z",
    ]);
  });

  it("writes into the own sub-calendar, otherwise the studio default", async () => {
    const cfg = { apiKey: "k", calendarKey: "ks1", subcalendarId: "100", artistFieldId: WHO_FIELD };
    const client = new TeamupClient(async () => cfg);
    const conn = {
      tattooerId: "t",
      provider: "TEAMUP" as const,
      refreshTokenEnc: null,
      calendarId: null,
    };
    expect(
      await client.ensureConsultationCalendar({ ...conn, teamupSubcalendarId: "12675385" }),
    ).toBe("teamup:12675385");
    expect(await client.ensureConsultationCalendar(conn)).toBe("teamup:100");
    const noDefault = new TeamupClient(async () => ({ ...cfg, subcalendarId: null }));
    await expect(noDefault.ensureConsultationCalendar(conn)).rejects.toThrow(/Kein Unterkalender/);
  });
});
