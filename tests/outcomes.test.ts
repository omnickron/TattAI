import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadDueFollowUps, markFollowUpDone, notifyDueFollowUps } from "@/lib/outcomes/follow-up";
import {
  addSession,
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
