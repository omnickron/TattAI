import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadDueFollowUps, markFollowUpDone, notifyDueFollowUps } from "@/lib/outcomes/follow-up";
import { notifyMissingOutcomes } from "@/lib/outcomes/reminders";
import { sessionRevenueCents } from "@/lib/outcomes/session-revenue";
import { loadMonthRevenue } from "@/lib/billing/billing";
import {
  addSession,
  recordAttendance,
  recordOutcome,
  setSessionCancelled,
  updateSession,
} from "@/lib/outcomes/outcome";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const NOW = new Date("2026-11-09T12:00:00Z");
let userId: string;
let tattooerId: string;

async function consultation(startsAt = new Date("2026-11-09T09:00:00Z")) {
  const lead = await prisma.lead.create({
    data: { source: "MANUAL", name: "Lena", phoneValid: true, status: "CONSULTATION_BOOKED" },
  });
  return prisma.consultation.create({
    data: {
      leadId: lead.id,
      tattooerId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 1800_000),
    },
  });
}

const leadStatus = async (consultationId: string) =>
  (
    await prisma.consultation.findUniqueOrThrow({
      where: { id: consultationId },
      include: { lead: true },
    })
  ).lead.status;

beforeEach(async () => {
  await resetDatabase(prisma);
  const u = await prisma.user.create({
    data: {
      name: "Alex",
      email: "alex@example.com",
      role: "TATTOOER",
      tattooerProfile: { create: {} },
    },
    include: { tattooerProfile: true },
  });
  userId = u.id;
  tattooerId = u.tattooerProfile!.id;
});

afterAll(() => prisma.$disconnect());

describe("recordOutcome", () => {
  it("records a multi-session tattoo with only the first session scheduled", async () => {
    const c = await consultation();
    const res = await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: NOW,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "MULTIPLE",
        furtherScheduled: false,
        sessions: [{ date: "2026-12-01", amount: "600" }],
      },
    });
    expect(res).toMatchObject({
      status: "HELD",
      tattooBooked: true,
      sessionPlan: "MULTIPLE",
      furtherSessionsScheduled: false,
      outcomeRecordedById: userId,
    });
    expect(res.tattooBookings).toHaveLength(1);
    expect(res.tattooBookings[0]).toMatchObject({ sessionNumber: 1, amountCents: 60000 });
    expect(res.tattooBookings[0].date.toISOString()).toBe("2026-11-30T23:00:00.000Z"); // local midnight
    expect(await leadStatus(c.id)).toBe("TATTOO_BOOKED");

    // Later: second session is scheduled → further sessions flag flips
    await addSession(prisma, { consultationId: c.id, date: "2027-01-12", amount: "1.250,50" });
    const after = await prisma.consultation.findUniqueOrThrow({
      where: { id: c.id },
      include: { tattooBookings: true },
    });
    expect(after.furtherSessionsScheduled).toBe(true);
    expect(after.tattooBookings.map((b) => [b.sessionNumber, b.amountCents])).toEqual([
      [1, 60000],
      [2, 125050],
    ]);
  });

  it("turns a single appointment into multiple when a session is added", async () => {
    const c = await consultation();
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: NOW,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [{ date: "2026-12-01" }],
      },
    });
    await addSession(prisma, { consultationId: c.id, date: "2026-12-15" });
    expect(await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      sessionPlan: "MULTIPLE",
      furtherSessionsScheduled: true,
    });
  });

  it("sets the lead status for each outcome and allows corrections", async () => {
    const c = await consultation();
    const record = (outcome: Parameters<typeof recordOutcome>[1]["outcome"]) =>
      recordOutcome(prisma, { consultationId: c.id, userId, now: NOW, outcome });
    await record({ outcome: "NO_SHOW" });
    expect(await leadStatus(c.id)).toBe("NO_SHOW");
    await record({ outcome: "HELD", tattoo: "OPEN", followUpDate: "2026-11-16" });
    expect(await leadStatus(c.id)).toBe("CONSULTATION_DONE");
    await record({ outcome: "HELD", tattoo: "NO" });
    expect(await leadStatus(c.id)).toBe("NO_TATTOO");
    await record({
      outcome: "HELD",
      tattoo: "YES",
      sessionPlan: "SINGLE",
      sessions: [{ date: "2026-12-01", amount: "300" }],
    });
    expect(await leadStatus(c.id)).toBe("TATTOO_BOOKED");
    // Correction replaces the sessions
    await record({ outcome: "CANCELLED" });
    expect(await leadStatus(c.id)).toBe("CANCELLED");
    expect(await prisma.tattooBooking.count()).toBe(0);
  });

  it("refuses outcomes before the consultation started", async () => {
    const c = await consultation(new Date("2026-11-10T09:00:00Z"));
    await expect(
      recordOutcome(prisma, {
        consultationId: c.id,
        userId,
        now: NOW,
        outcome: { outcome: "NO_SHOW" },
      }),
    ).rejects.toThrow("erst ab Beginn");
  });

  it("can cancel and restore single sessions", async () => {
    const c = await consultation();
    const res = await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: NOW,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [{ date: "2026-12-01", amount: "300" }],
      },
    });
    await setSessionCancelled(prisma, res.tattooBookings[0].id, true);
    expect((await prisma.tattooBooking.findFirstOrThrow()).cancelled).toBe(true);
  });
});

describe("session times", () => {
  it("stores start and end in local time (incl. DST)", async () => {
    const c = await consultation();
    const res = await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: NOW,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "MULTIPLE",
        furtherScheduled: true,
        sessions: [
          { date: "2026-12-01", start: "11:00", end: "15:00", amount: "500" },
          { date: "2027-04-06", start: "10:00", end: "12:00" },
        ],
      },
    });
    const [winter, summer] = res.tattooBookings.sort((a, b) => a.sessionNumber - b.sessionNumber);
    expect(winter.startsAt?.toISOString()).toBe("2026-12-01T10:00:00.000Z");
    expect(winter.endsAt?.toISOString()).toBe("2026-12-01T14:00:00.000Z");
    expect(summer.startsAt?.toISOString()).toBe("2027-04-06T08:00:00.000Z");

    // Updating without time removes the slot again
    await updateSession(prisma, { sessionId: winter.id, date: "2026-12-02", amount: "500" });
    const updated = await prisma.tattooBooking.findUniqueOrThrow({ where: { id: winter.id } });
    expect(updated.startsAt).toBeNull();
  });
});

describe("follow-up", () => {
  it("reminds the tattooer once on the day and lists the customer until it is done", async () => {
    const c = await consultation();
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: NOW,
      timeZone: "Europe/Berlin",
      outcome: {
        outcome: "HELD",
        tattoo: "OPEN",
        followUpDate: "2026-11-16",
        note: "Motiv unsicher",
      },
    });
    const stored = await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } });
    // 09:00 Berlin = 08:00 UTC in November
    expect(stored.followUpAt?.toISOString()).toBe("2026-11-16T08:00:00.000Z");

    const scope = { isAdmin: true, tattooerId: null };
    const before = new Date("2026-11-15T20:00:00Z");
    const onTheDay = new Date("2026-11-16T07:30:00Z"); // 08:30 Berlin: listed, push not yet due
    const later = new Date("2026-11-16T08:05:00Z");
    expect(await loadDueFollowUps(prisma, scope, before)).toHaveLength(0);
    expect(await loadDueFollowUps(prisma, scope, onTheDay)).toHaveLength(1);

    const sent: string[] = [];
    const push = {
      configured: true,
      async send(_s: unknown, p: { title: string }) {
        sent.push(p.title);
        return { gone: false };
      },
    };
    const tattooer = await prisma.tattooerProfile.findUniqueOrThrow({
      where: { id: stored.tattooerId },
    });
    await prisma.pushSubscription.create({
      data: { userId: tattooer.userId, endpoint: "https://push.test/x", p256dh: "p", auth: "a" },
    });
    expect(await notifyDueFollowUps(prisma, push, onTheDay)).toBe(0);
    expect(await notifyDueFollowUps(prisma, push, later)).toBe(1);
    expect(await notifyDueFollowUps(prisma, push, later)).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^Heute nachfassen: /);

    // Overdue ones stay listed until done
    expect(await loadDueFollowUps(prisma, scope, new Date("2026-11-18T10:00:00Z"))).toHaveLength(1);
    await markFollowUpDone(prisma, c.id, later);
    expect(await loadDueFollowUps(prisma, scope, new Date("2026-11-18T10:00:00Z"))).toHaveLength(0);

    // A new date brings it back
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: later,
      timeZone: "Europe/Berlin",
      outcome: { outcome: "HELD", tattoo: "OPEN", followUpDate: "2026-11-23" },
    });
    expect(await loadDueFollowUps(prisma, scope, new Date("2026-11-23T10:00:00Z"))).toHaveLength(1);

    // A new decision does not remove it – only the button does
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: later,
      outcome: { outcome: "HELD", tattoo: "NO" },
    });
    expect(await loadDueFollowUps(prisma, scope, new Date("2026-11-23T10:00:00Z"))).toHaveLength(1);
    await markFollowUpDone(prisma, c.id, later);
    expect(await loadDueFollowUps(prisma, scope, new Date("2026-11-23T10:00:00Z"))).toHaveLength(0);
  });
});

describe("missing outcome reminder", () => {
  it("pushes once in the morning while consultations from before today have no outcome", async () => {
    const c = await consultation();
    const stored = await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } });
    const tattooer = await prisma.tattooerProfile.findUniqueOrThrow({
      where: { id: stored.tattooerId },
    });
    await prisma.pushSubscription.create({
      data: { userId: tattooer.userId, endpoint: "https://push.test/r", p256dh: "p", auth: "a" },
    });
    const titles: string[] = [];
    const push = {
      configured: true,
      async send(_s: unknown, p: { title: string }) {
        titles.push(p.title);
        return { gone: false };
      },
    };
    // The consultation's day itself: not yet
    const sameDay = new Date(stored.endsAt.getTime() + 3600_000);
    expect(await notifyMissingOutcomes(prisma, push, sameDay)).toBe(0);
    // Next day before 9: not yet; after 9: once
    const nextDay = new Date(stored.startsAt.getTime() + 24 * 3600_000);
    const early = new Date(`${nextDay.toISOString().slice(0, 10)}T06:00:00Z`); // 07:00 Berlin
    const morning = new Date(`${nextDay.toISOString().slice(0, 10)}T08:30:00Z`); // 09:30 Berlin
    expect(await notifyMissingOutcomes(prisma, push, early)).toBe(0);
    expect(await notifyMissingOutcomes(prisma, push, morning)).toBe(1);
    expect(await notifyMissingOutcomes(prisma, push, morning)).toBe(0);
    expect(titles).toEqual(["1 Beratung ohne Ergebnis"]);
    // Outcome entered: no reminder the day after
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: morning,
      outcome: { outcome: "NO_SHOW" },
    });
    const dayAfter = new Date(morning.getTime() + 24 * 3600_000);
    expect(await notifyMissingOutcomes(prisma, push, dayAfter)).toBe(0);
  });
});

describe("deposit, attendance and final price", () => {
  async function bookedSession(date = "2026-11-10", deposit = "100") {
    const c = await consultation();
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: NOW,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [{ date, amount: "450", deposit, start: "12:00", end: "15:00" }],
      },
    });
    return {
      c,
      session: await prisma.tattooBooking.findFirstOrThrow({ where: { consultationId: c.id } }),
    };
  }

  it("stores the deposit and refuses one above the price", async () => {
    const { session } = await bookedSession();
    expect(session.depositCents).toBe(10000);
    const c = await consultation(new Date("2026-11-08T09:00:00Z"));
    await expect(
      recordOutcome(prisma, {
        consultationId: c.id,
        userId,
        now: NOW,
        outcome: {
          outcome: "HELD",
          tattoo: "YES",
          sessionPlan: "SINGLE",
          sessions: [{ date: "2026-11-10", amount: "100", deposit: "200" }],
        },
      }),
    ).rejects.toThrow("Anzahlung ist höher");
    await addSession(prisma, {
      consultationId: session.consultationId,
      date: "2026-12-01",
      deposit: "50",
    });
    const added = await prisma.tattooBooking.findFirstOrThrow({ where: { sessionNumber: 2 } });
    expect(added.depositCents).toBe(5000);
  });

  it("records attendance with the final price only after the session started", async () => {
    const { session } = await bookedSession();
    await expect(
      recordAttendance(prisma, {
        sessionId: session.id,
        attendance: "ATTENDED",
        finalAmount: "500",
        now: NOW,
      }),
    ).rejects.toThrow("begonnen");
    const after = new Date("2026-11-10T15:00:00Z");
    await expect(
      recordAttendance(prisma, { sessionId: session.id, attendance: "ATTENDED", now: after }),
    ).rejects.toThrow("Endpreis");
    await recordAttendance(prisma, {
      sessionId: session.id,
      attendance: "ATTENDED",
      finalAmount: "520",
      now: after,
    });
    const s = await prisma.tattooBooking.findUniqueOrThrow({ where: { id: session.id } });
    expect(s).toMatchObject({
      attendance: "ATTENDED",
      finalAmountCents: 52000,
      amountCents: 45000,
    });
    expect(sessionRevenueCents(s)).toBe(52000);
  });

  it("counts the deposit after a no-show and keeps attendance when the outcome is corrected", async () => {
    const { c, session } = await bookedSession();
    const after = new Date("2026-11-10T15:00:00Z");
    await recordAttendance(prisma, { sessionId: session.id, attendance: "NO_SHOW", now: after });
    let s = await prisma.tattooBooking.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionRevenueCents(s)).toBe(10000);
    // Correcting the note keeps the recorded attendance
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId,
      now: after,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [
          { date: "2026-11-10", amount: "450", deposit: "100", start: "12:00", end: "15:00" },
        ],
        note: "korrigiert",
      },
    });
    s = await prisma.tattooBooking.findFirstOrThrow({ where: { consultationId: c.id } });
    expect(s.attendance).toBe("NO_SHOW");
    // Billing counts the kept deposit (only Meta leads are billed)
    await prisma.lead.update({ where: { id: c.leadId }, data: { source: "META_LEAD_AD" } });
    const revenue = await loadMonthRevenue(prisma, "2026-11");
    expect(revenue.revenueCents).toBe(10000);
    expect(revenue.lines[0].attendance).toBe("NO_SHOW");
    // Reset
    await recordAttendance(prisma, { sessionId: s.id, attendance: null });
    s = await prisma.tattooBooking.findUniqueOrThrow({ where: { id: s.id } });
    expect(s.attendance).toBeNull();
    expect(sessionRevenueCents(s)).toBe(45000);
  });

  it("keeps the deposit of a cancelled session only when chosen", async () => {
    const { session } = await bookedSession();
    await setSessionCancelled(prisma, session.id, true, true);
    let s = await prisma.tattooBooking.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionRevenueCents(s)).toBe(10000);
    await setSessionCancelled(prisma, session.id, false);
    s = await prisma.tattooBooking.findUniqueOrThrow({ where: { id: session.id } });
    expect(s.depositKept).toBe(false);
    await setSessionCancelled(prisma, session.id, true);
    s = await prisma.tattooBooking.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionRevenueCents(s)).toBe(0);
  });

  it("reminds about sessions from yesterday without attendance", async () => {
    const { c, session } = await bookedSession();
    await prisma.consultation.update({ where: { id: c.id }, data: {} });
    const tattooer = await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: tattooerId } });
    await prisma.pushSubscription.create({
      data: { userId: tattooer.userId, endpoint: "https://push.test/s", p256dh: "p", auth: "a" },
    });
    const titles: string[] = [];
    const push = {
      configured: true,
      async send(_s: unknown, p: { title: string }) {
        titles.push(p.title);
        return { gone: false };
      },
    };
    // Same day after the session: not yet (only from the next morning)
    expect(await notifyMissingOutcomes(prisma, push, new Date("2026-11-10T16:00:00Z"))).toBe(0);
    expect(await notifyMissingOutcomes(prisma, push, new Date("2026-11-11T08:30:00Z"))).toBe(1);
    expect(titles).toEqual(["1 Tattoo-Termin ohne Ergebnis"]);
    await recordAttendance(prisma, {
      sessionId: session.id,
      attendance: "ATTENDED",
      finalAmount: "450",
      now: new Date("2026-11-11T08:30:00Z"),
    });
    expect(await notifyMissingOutcomes(prisma, push, new Date("2026-11-12T08:30:00Z"))).toBe(0);
  });
});
