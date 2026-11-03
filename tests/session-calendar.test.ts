import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  CalendarError,
  type CalendarClient,
  type CalendarConnection,
  type CalendarEventInput,
} from "@/lib/google/calendar";
import {
  addSession,
  recordOutcome,
  setSessionCancelled,
  updateSession,
} from "@/lib/outcomes/outcome";
import {
  createInAppCalendar,
  ensureCalendarNames,
  type SchedulingDeps,
} from "@/lib/scheduling/booking";
import {
  describeCalendarError,
  processCalendarDeletions,
  resyncTattooerSessions,
  retrySessionSync,
  queueLeadEventDeletions,
  syncConsultationSessions,
  syncPendingSessions,
} from "@/lib/scheduling/session-calendar";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const NOW = new Date("2026-11-09T12:00:00Z");

class FakeCalendar implements CalendarClient {
  readonly mock = true;
  events = new Map<string, CalendarEventInput>();
  deleted: string[] = [];
  fail = false;
  private n = 0;
  async getBusy() {
    return [];
  }
  async ensureConsultationCalendar(conn: CalendarConnection) {
    return conn.calendarId ?? `cal-${conn.tattooerId}`;
  }
  async createEvent(_c: CalendarConnection, _cal: string, e: CalendarEventInput) {
    if (this.fail) throw new Error("google down");
    const id = `evt-${++this.n}`;
    this.events.set(id, e);
    return id;
  }
  async updateEvent(_c: CalendarConnection, _cal: string, id: string, e: CalendarEventInput) {
    if (this.fail) throw new Error("google down");
    this.events.set(id, e);
  }
  async deleteEvent(_c: CalendarConnection, _cal: string, id: string) {
    if (this.fail) throw new Error("google down");
    this.events.delete(id);
    this.deleted.push(id);
  }
}

let calendar: FakeCalendar;
let deps: SchedulingDeps;
let userId: string;
let tattooerId: string;
let consultationId: string;
let leadId: string;

beforeEach(async () => {
  await resetDatabase(prisma);
  calendar = new FakeCalendar();
  deps = { prisma, calendar, appUrl: "https://app.test" };
  const u = await prisma.user.create({
    data: {
      name: "Alex",
      email: "alex@example.com",
      role: "TATTOOER",
      tattooerProfile: {
        create: { googleConnectedAt: new Date(), consultationCalendarId: "cal-alex" },
      },
    },
    include: { tattooerProfile: true },
  });
  userId = u.id;
  tattooerId = u.tattooerProfile!.id;
  const lead = await prisma.lead.create({
    data: {
      source: "MANUAL",
      name: "Lena Müller",
      phoneE164: "+4915112345678",
      phoneValid: true,
      status: "CONSULTATION_BOOKED",
    },
  });
  leadId = lead.id;
  consultationId = (
    await prisma.consultation.create({
      data: {
        leadId,
        tattooerId,
        startsAt: new Date("2026-11-09T09:00:00Z"),
        endsAt: new Date("2026-11-09T09:30:00Z"),
        calendarId: "cal-alex",
        calendarEventId: "consultation-evt",
      },
    })
  ).id;
});

afterAll(() => prisma.$disconnect());

async function recordTwoSessions() {
  await recordOutcome(prisma, {
    consultationId,
    userId,
    now: NOW,
    outcome: {
      outcome: "HELD",
      tattoo: "YES",
      sessionPlan: "MULTIPLE",
      furtherScheduled: true,
      sessions: [
        { date: "2026-12-01", start: "11:00", end: "15:00", amount: "500" },
        { date: "2027-01-12" },
      ],
    },
  });
  await syncConsultationSessions(deps, consultationId);
  return prisma.tattooBooking.findMany({
    where: { consultationId },
    orderBy: { sessionNumber: "asc" },
  });
}

describe("tattoo sessions in Google Calendar", () => {
  it("creates timed and all-day events in the tattooer's app calendar", async () => {
    const [timed, allDay] = await recordTwoSessions();
    expect(timed).toMatchObject({ calendarId: "cal-alex", calendarSyncPending: false });
    const e1 = calendar.events.get(timed.calendarEventId!)!;
    expect(e1.summary).toBe("Tattoo: Lena Müller – Termin 1");
    expect(e1.start.toISOString()).toBe("2026-12-01T10:00:00.000Z");
    expect(e1.allDay).toBeUndefined();
    const e2 = calendar.events.get(allDay.calendarEventId!)!;
    expect(e2.allDay).toEqual({ startDate: "2027-01-12", endDate: "2027-01-13" });
    expect(e2.description).toContain("Uhrzeit noch nicht eingetragen");
  });

  it("updates on changes and removes cancelled sessions", async () => {
    const [timed, allDay] = await recordTwoSessions();
    await updateSession(prisma, {
      sessionId: allDay.id,
      date: "2027-01-12",
      start: "10:00",
      end: "14:00",
    });
    await syncConsultationSessions(deps, consultationId);
    expect(calendar.events.get(allDay.calendarEventId!)!.allDay).toBeUndefined();

    await setSessionCancelled(prisma, timed.id, true);
    await syncConsultationSessions(deps, consultationId);
    expect(calendar.deleted).toEqual([timed.calendarEventId]);
    expect(await prisma.tattooBooking.findUniqueOrThrow({ where: { id: timed.id } })).toMatchObject(
      {
        calendarEventId: null,
        calendarSyncPending: false,
      },
    );

    await addSession(prisma, { consultationId, date: "2027-02-01" });
    await syncConsultationSessions(deps, consultationId);
    expect(calendar.events.size).toBe(2);
  });

  it("removes the old events when the outcome is changed", async () => {
    const sessions = await recordTwoSessions();
    await recordOutcome(prisma, {
      consultationId,
      userId,
      now: NOW,
      outcome: { outcome: "NO_SHOW" },
    });
    await syncConsultationSessions(deps, consultationId);
    expect(calendar.deleted.sort()).toEqual(sessions.map((s) => s.calendarEventId).sort());
    expect(calendar.events.size).toBe(0);
    expect(await prisma.calendarEventDeletion.count()).toBe(0);
  });

  it("keeps failures pending and retries them", async () => {
    calendar.fail = true;
    const sessions = await recordTwoSessions();
    expect(
      sessions.every((s) => s.calendarSyncPending && s.calendarSyncError === "google down"),
    ).toBe(true);
    calendar.fail = false;
    // The worker only retries after the backoff (first retry after 1 minute)
    const later = new Date(Date.now() + 2 * 60_000);
    expect(await syncPendingSessions({ ...deps, now: () => later })).toMatchObject({ synced: 2 });
    expect(calendar.events.size).toBe(2);
  });

  it("writes nothing for tattooers without a connected calendar", async () => {
    await prisma.tattooerProfile.update({
      where: { id: tattooerId },
      data: { googleConnectedAt: null },
    });
    const sessions = await recordTwoSessions();
    expect(calendar.events.size).toBe(0);
    expect(sessions.every((s) => !s.calendarSyncPending)).toBe(true);
  });

  it("removes all calendar entries of a deleted lead", async () => {
    const sessions = await recordTwoSessions();
    expect(await queueLeadEventDeletions(prisma, leadId)).toBe(3);
    await prisma.lead.delete({ where: { id: leadId } });
    await processCalendarDeletions(deps);
    expect(calendar.deleted.sort()).toEqual(
      ["consultation-evt", ...sessions.map((s) => s.calendarEventId!)].sort(),
    );
  });
});

describe("app calendar name and recovery", () => {
  it("renames existing calendars once to 'Studio-Termine'", async () => {
    const renamed: string[] = [];
    const cal = Object.assign(new FakeCalendar(), {
      async renameCalendar(_c: CalendarConnection, id: string, name: string) {
        renamed.push(`${id}:${name}`);
        return "ok" as const;
      },
    });
    const d = { ...deps, calendar: cal };
    expect(await ensureCalendarNames(d)).toEqual({ renamed: 1 });
    expect(await ensureCalendarNames(d)).toEqual({ renamed: 0 });
    expect(renamed).toEqual(["cal-alex:Studio-Termine"]);
  });

  it("recreates the calendar if it was deleted in Google", async () => {
    const cal = Object.assign(new FakeCalendar(), {
      async ensureConsultationCalendar(conn: CalendarConnection) {
        return conn.calendarId ?? "cal-new";
      },
      async createEvent(_c: CalendarConnection, calendarId: string, e: CalendarEventInput) {
        if (calendarId === "cal-alex") throw new CalendarError("Not Found", 404);
        return `evt-in-${calendarId}-${e.summary.length}`;
      },
    });
    const profile = await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: tattooerId } });
    const res = await createInAppCalendar({ ...deps, calendar: cal }, profile, {
      summary: "x",
      description: "",
      start: new Date(),
      end: new Date(),
      timeZone: "Europe/Berlin",
    });
    expect(res.calendarId).toBe("cal-new");
    expect(
      await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: tattooerId } }),
    ).toMatchObject({
      consultationCalendarId: "cal-new",
      consultationCalendarName: "Studio-Termine",
    });
  });

  it("forgets a calendar that no longer exists when renaming", async () => {
    const cal = Object.assign(new FakeCalendar(), {
      async renameCalendar() {
        return "missing" as const;
      },
    });
    await ensureCalendarNames({ ...deps, calendar: cal });
    expect(
      (await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: tattooerId } }))
        .consultationCalendarId,
    ).toBeNull();
  });
});

describe("sync retries", () => {
  it("backs off automatic retries, while a manual retry goes through right away", async () => {
    let clock = new Date("2026-11-10T10:00:00Z");
    const d = { ...deps, now: () => clock };
    calendar.fail = true;
    await recordOutcome(prisma, {
      consultationId,
      userId,
      now: NOW,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [{ date: "2026-12-01" }],
      },
    });
    await syncConsultationSessions(d, consultationId);
    let s = await prisma.tattooBooking.findFirstOrThrow({ where: { consultationId } });
    expect(s).toMatchObject({ calendarSyncPending: true, calendarSyncAttempts: 1 });
    expect(s.calendarNextAttemptAt?.toISOString()).toBe("2026-11-10T10:01:00.000Z");

    // Not due yet → the worker leaves it alone
    calendar.fail = false;
    expect(await syncPendingSessions(d)).toMatchObject({ synced: 0 });

    // Manual retry ignores the backoff
    expect(await retrySessionSync(d, s.id)).toEqual({
      ok: true,
      message: "Mit Google synchronisiert.",
    });
    s = await prisma.tattooBooking.findFirstOrThrow({ where: { consultationId } });
    expect(s).toMatchObject({
      calendarSyncPending: false,
      calendarSyncAttempts: 0,
      calendarNextAttemptAt: null,
    });

    // Second failure doubles the wait
    calendar.fail = true;
    await updateSession(prisma, { sessionId: s.id, date: "2026-12-02" });
    await syncConsultationSessions(d, consultationId);
    await prisma.tattooBooking.update({
      where: { id: s.id },
      data: { calendarNextAttemptAt: null },
    });
    clock = new Date("2026-11-10T11:00:00Z");
    await syncPendingSessions(d);
    s = await prisma.tattooBooking.findFirstOrThrow({ where: { consultationId } });
    expect(s.calendarSyncAttempts).toBe(2);
    expect(s.calendarNextAttemptAt?.toISOString()).toBe("2026-11-10T11:02:00.000Z");
  });

  it("explains failures and catches up after reconnecting", async () => {
    calendar.fail = true;
    const [first] = await recordTwoSessions();
    await prisma.tattooBooking.updateMany({
      data: {
        calendarSyncError: "Google token endpoint 400: invalid_grant",
        calendarNextAttemptAt: new Date("2030-01-01"),
      },
    });
    const res = await retrySessionSync(deps, first.id);
    expect(res.ok).toBe(false);
    expect(res.message).toBe("Die Übertragung zu Google ist fehlgeschlagen.");
    expect(describeCalendarError("Google token endpoint 400: invalid_grant")).toContain(
      "neu verbinden",
    );
    expect(describeCalendarError("Google Calendar 503: backend")).toContain("nicht erreichbar");

    calendar.fail = false;
    expect(await resyncTattooerSessions(deps, tattooerId)).toBe(2);
    expect(await prisma.tattooBooking.count({ where: { calendarSyncPending: true } })).toBe(0);
  });
});
