import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CalendarClient, CalendarConnection, CalendarEventInput } from "@/lib/google/calendar";
import {
  addSession,
  recordOutcome,
  setSessionCancelled,
  updateSession,
} from "@/lib/outcomes/outcome";
import type { SchedulingDeps } from "@/lib/scheduling/booking";
import {
  processCalendarDeletions,
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
    expect(await syncPendingSessions(deps)).toMatchObject({ synced: 2 });
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
