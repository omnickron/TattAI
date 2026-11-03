import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addSession, recordOutcome, setSessionCancelled } from "@/lib/outcomes/outcome";
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
    await record({ outcome: "HELD", tattoo: "OPEN" });
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
