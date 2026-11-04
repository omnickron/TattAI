import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RoutingCalendarClient } from "@/lib/calendar/routing";
import type { CalendarClient, CalendarConnection, CalendarEventInput } from "@/lib/google/calendar";
import { bookConsultation, getAvailableSlots, type SchedulingDeps } from "@/lib/scheduling/booking";
import { connectTeamup, disconnectTeamup, switchToGoogle } from "@/lib/scheduling/calendar-switch";
import type { Interval } from "@/lib/scheduling/slots";
import { zonedTimeToUtc } from "@/lib/time";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const DAY = "2026-11-09"; // Monday
const at = (hhmm: string, day = DAY) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(day, h * 60 + m);
};
const NOW = at("08:00", "2026-11-02");

/** Records calls per provider. */
class Recorder implements CalendarClient {
  readonly mock = true;
  busy = new Map<string, Interval[]>();
  created: Array<{ calendarId: string; artist?: string | null; id: string }> = [];
  deleted: string[] = [];
  constructor(
    private readonly name: string,
    private readonly appCalendar: (conn: CalendarConnection) => string,
  ) {}
  async getBusy(conn: CalendarConnection) {
    return this.busy.get(conn.teamupArtist ?? conn.tattooerId) ?? [];
  }
  async ensureConsultationCalendar(conn: CalendarConnection) {
    return conn.calendarId ?? this.appCalendar(conn);
  }
  async createEvent(conn: CalendarConnection, calendarId: string, _event: CalendarEventInput) {
    const id = `${this.name}-evt-${this.created.length + 1}`;
    this.created.push({ calendarId, artist: conn.teamupArtist, id });
    return id;
  }
  async updateEvent() {}
  async deleteEvent(_c: CalendarConnection, _cal: string, eventId: string) {
    this.deleted.push(eventId);
  }
}

let google: Recorder;
let teamup: Recorder;
let deps: SchedulingDeps;
let kim: string;

async function tattooer(name: string, data: Record<string, unknown>) {
  const user = await prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: "TATTOOER",
      tattooerProfile: {
        create: {
          fairnessShare: { create: { weight: 1 } },
          availabilityRules: { create: [{ weekday: 1, startMinute: 600, endMinute: 720 }] },
          ...data,
        },
      },
    },
    include: { tattooerProfile: true },
  });
  return user.tattooerProfile!.id;
}

async function lead(name = "Kunde") {
  return (
    await prisma.lead.create({
      data: { source: "MANUAL", name, phoneE164: "+4915112345678", phoneValid: true },
    })
  ).id;
}

const env = { ...process.env };
afterAll(async () => {
  process.env = env;
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  process.env.TEAMUP_API_KEY = "test-key";
  process.env.TEAMUP_CALENDAR_KEY = "test-calendar";
  delete process.env.TEAMUP_MOCK;
  await prisma.appSettings.create({
    data: { id: 1, teamupSubcalendarId: "42", teamupArtistFieldId: "artist" },
  });
  google = new Recorder("google", (c) => `google-cal-${c.tattooerId}`);
  teamup = new Recorder("teamup", () => "teamup:42");
  deps = {
    prisma,
    calendar: new RoutingCalendarClient(google, teamup),
    now: () => NOW,
    random: () => 0,
    appUrl: "https://app.test",
  };
  kim = await tattooer("Kim", {
    googleConnectedAt: new Date(),
    consultationCalendarId: "gcal-kim",
  });
});

describe("TeamUp as calendar of a tattooer", () => {
  it("books TeamUp tattooers and respects their busy times from the shared calendar", async () => {
    const sam = await tattooer("Sam", {
      calendarProvider: "TEAMUP",
      teamupArtist: "sam",
      teamupConnectedAt: new Date(),
      consultationCalendarId: "teamup:42",
    });
    teamup.busy.set("sam", [{ start: at("10:00"), end: at("11:00") }]);
    const slots = await getAvailableSlots(deps, { from: at("00:00"), to: at("23:59") });
    const samSlots = slots.filter((s) => s.tattooers.some((t) => t.tattooerId === sam));
    // Nothing while Sam is busy in TeamUp (10–11), free afterwards
    expect(samSlots.every((s) => s.start >= at("11:00"))).toBe(true);
    expect(samSlots[0].start).toEqual(at("11:00"));

    const c = await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("11:00"),
      tattooerId: sam,
    });
    expect(c.calendarId).toBe("teamup:42");
    expect(teamup.created).toEqual([
      { calendarId: "teamup:42", artist: "sam", id: "teamup-evt-1" },
    ]);
    expect(google.created).toHaveLength(0);
  });

  it("moves upcoming appointments when switching from Google to TeamUp and back", async () => {
    const c = await bookConsultation(deps, {
      leadId: await lead("Mia"),
      startsAt: at("10:00"),
      tattooerId: kim,
    });
    expect(c.calendarId).toBe("gcal-kim");

    const res = await connectTeamup(deps, kim, { value: "kim", label: "Kim N." });
    expect(res).toEqual({ moved: 1, failed: 0 });
    const profile = await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: kim } });
    expect(profile).toMatchObject({
      calendarProvider: "TEAMUP",
      teamupArtist: "kim",
      teamupArtistLabel: "Kim N.",
      consultationCalendarId: "teamup:42",
      googleCalendarId: "gcal-kim",
    });
    const moved = await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } });
    expect(moved).toMatchObject({ calendarId: "teamup:42", calendarEventId: "teamup-evt-1" });
    expect(google.deleted).toEqual([c.calendarEventId]);

    await switchToGoogle(deps, kim);
    const back = await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } });
    expect(back.calendarId).toBe("gcal-kim"); // the remembered Google calendar is reused
    expect(teamup.deleted).toEqual(["teamup-evt-1"]);
  });

  it("refuses TeamUp without setup or with an artist that is already taken", async () => {
    await prisma.appSettings.update({ where: { id: 1 }, data: { teamupArtistFieldId: null } });
    await expect(connectTeamup(deps, kim, { value: "kim", label: "Kim" })).rejects.toThrow(
      /nicht eingerichtet/,
    );
    await prisma.appSettings.update({ where: { id: 1 }, data: { teamupArtistFieldId: "artist" } });
    await tattooer("Alex", {
      calendarProvider: "TEAMUP",
      teamupArtist: "kim",
      teamupConnectedAt: new Date(),
    });
    await expect(connectTeamup(deps, kim, { value: "kim", label: "Kim" })).rejects.toThrow(/Alex/);
  });

  it("falls back to Google (or no calendar) when TeamUp is disconnected", async () => {
    const sam = await tattooer("Sam", {
      calendarProvider: "TEAMUP",
      teamupArtist: "sam",
      teamupConnectedAt: new Date(),
      consultationCalendarId: "teamup:42",
    });
    await disconnectTeamup(deps, sam);
    const p = await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: sam } });
    expect(p).toMatchObject({ calendarProvider: "GOOGLE", teamupConnectedAt: null });
    // Not connected to anything any more: no slots for Sam
    const slots = await getAvailableSlots(deps, { from: at("00:00"), to: at("23:59") });
    expect(slots.some((s) => s.tattooers.some((t) => t.tattooerId === sam))).toBe(false);
  });
});
