/**
 * The admin report follows every change in the app: booking, cancelling, reassigning,
 * outcomes, tattoo sessions (amount, extra, cancelled) and walk-ins.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CalendarClient } from "@/lib/google/calendar";
import {
  addSession,
  recordOutcome,
  setSessionCancelled,
  updateSession,
} from "@/lib/outcomes/outcome";
import { loadReport } from "@/lib/reports/load";
import {
  bookConsultation,
  cancelConsultation,
  createWalkInProject,
  reassignConsultation,
  type SchedulingDeps,
} from "@/lib/scheduling/booking";
import { zonedTimeToUtc } from "@/lib/time";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const TZ = "Europe/Berlin";
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(day, h * 60 + m, TZ);
};

const calendar: CalendarClient = {
  mock: true,
  getBusy: async () => [],
  ensureConsultationCalendar: async (c) => c.calendarId ?? `cal-${c.tattooerId}`,
  createEvent: async () => `evt-${Math.random()}`,
  updateEvent: async () => {},
  deleteEvent: async () => {},
};

let now: Date;
let deps: SchedulingDeps;
let alex: string;
let kim: string;
let adminId: string;

async function tattooer(name: string) {
  const u = await prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: "TATTOOER",
      tattooerProfile: {
        create: {
          googleConnectedAt: new Date(),
          fairnessShare: { create: { weight: 1 } },
          // every weekday 10–18
          availabilityRules: {
            create: [1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              startMinute: 600,
              endMinute: 1080,
            })),
          },
        },
      },
    },
    include: { tattooerProfile: true },
  });
  return u.tattooerProfile!.id;
}

async function lead(name: string, createdAt = at("2026-11-02", "09:00")) {
  return (
    await prisma.lead.create({
      data: {
        source: "META_LEAD_AD",
        name,
        phoneE164: "+4915112345678",
        phoneValid: true,
        createdAt,
        metaCampaignId: "c1",
        metaCampaignName: "Herbst",
      },
    })
  ).id;
}

const report = (opts: { tattooerId?: string } = {}) =>
  loadReport(prisma, { from: "2026-11-01", to: "2026-11-30", now, timeZone: TZ, ...opts });

const sessionsOf = (consultationId: string) =>
  prisma.tattooBooking.findMany({ where: { consultationId }, orderBy: { sessionNumber: "asc" } });

afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await resetDatabase(prisma);
  now = at("2026-11-02", "10:00");
  deps = { prisma, calendar, now: () => now, random: () => 0, appUrl: "https://app.test" };
  alex = await tattooer("Alex");
  kim = await tattooer("Kim");
  adminId = (
    await prisma.user.create({ data: { name: "Admin", email: "a@example.com", role: "ADMIN" } })
  ).id;
});

describe("report follows the workflow", () => {
  it("lead → booked → ended → outcome → sessions changed → outcome revised", async () => {
    const leadId = await lead("Mia");
    expect((await report()).totals).toMatchObject({
      leads: 1,
      booked: 0,
      held: 0,
      won: 0,
      open: 0,
    });

    const c = await bookConsultation(deps, {
      leadId,
      startsAt: at("2026-11-04", "10:00"),
      tattooerId: alex,
    });
    expect((await report()).totals).toMatchObject({ booked: 1, open: 0 });

    // Consultation running: not yet an open outcome
    now = at("2026-11-04", "10:15");
    expect((await report()).totals.open).toBe(0);
    // Ended without outcome: open
    now = at("2026-11-04", "11:00");
    expect((await report()).totals.open).toBe(1);

    await recordOutcome(prisma, {
      consultationId: c.id,
      userId: adminId,
      now,
      timeZone: TZ,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [{ date: "2026-11-20", amount: "500" }],
      },
    });
    expect((await report()).totals).toMatchObject({
      held: 1,
      won: 1,
      open: 0,
      sessions: 1,
      revenueCents: 50000,
      revenueRealizedCents: 0,
    });

    const [s1] = await sessionsOf(c.id);
    await updateSession(prisma, {
      sessionId: s1.id,
      date: "2026-11-20",
      amount: "650",
      timeZone: TZ,
    });
    expect((await report()).totals.revenueCents).toBe(65000);

    await addSession(prisma, {
      consultationId: c.id,
      date: "2026-11-27",
      amount: "300",
      timeZone: TZ,
    });
    expect((await report()).totals).toMatchObject({ sessions: 2, revenueCents: 95000 });

    const [, s2] = await sessionsOf(c.id);
    await setSessionCancelled(prisma, s2.id, true);
    expect((await report()).totals).toMatchObject({ sessions: 1, revenueCents: 65000 });

    // Tattoo date passed: revenue counts as realised
    now = at("2026-11-21", "09:00");
    expect((await report()).totals.revenueRealizedCents).toBe(65000);

    // Outcome revised: no tattoo after all
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId: adminId,
      now,
      timeZone: TZ,
      outcome: { outcome: "HELD", tattoo: "NO" },
    });
    expect((await report()).totals).toMatchObject({
      held: 1,
      won: 0,
      sessions: 0,
      revenueCents: 0,
    });
  });

  it("no-show, cancellation and reassignment", async () => {
    const a = await lead("Noah");
    const ca = await bookConsultation(deps, {
      leadId: a,
      startsAt: at("2026-11-04", "10:00"),
      tattooerId: alex,
    });
    const b = await lead("Lea");
    const cb = await bookConsultation(deps, {
      leadId: b,
      startsAt: at("2026-11-04", "11:00"),
      tattooerId: alex,
    });
    await cancelConsultation(deps, cb.id);
    const c = await lead("Ben");
    const cc = await bookConsultation(deps, {
      leadId: c,
      startsAt: at("2026-11-05", "10:00"),
      tattooerId: alex,
    });
    await reassignConsultation(deps, cc.id, kim);

    now = at("2026-11-04", "12:00");
    await recordOutcome(prisma, {
      consultationId: ca.id,
      userId: adminId,
      now,
      timeZone: TZ,
      outcome: { outcome: "NO_SHOW" },
    });

    const r = await report();
    expect(r.totals).toMatchObject({ leads: 3, booked: 3, held: 0, noShow: 1 });
    // Reassigned lead counts for Kim only
    const by = Object.fromEntries(r.byTattooer.map((x) => [x.key, x.metrics]));
    expect(by[kim]).toMatchObject({ booked: 1 });
    expect(by[alex]).toMatchObject({ booked: 2, noShow: 1 });
  });

  it("walk-ins count as won with revenue for the tattooer who does them", async () => {
    const leadId = await lead("Clara");
    // Consultation and tattoo with Alex …
    const c = await bookConsultation(deps, {
      leadId,
      startsAt: at("2026-11-04", "10:00"),
      tattooerId: alex,
    });
    now = at("2026-11-04", "11:00");
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId: adminId,
      now,
      timeZone: TZ,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [{ date: "2026-11-10", amount: "400" }],
      },
    });
    // … and later a second tattoo with Kim as walk-in
    const project = await createWalkInProject(deps, {
      leadId,
      tattooerId: kim,
      startsAt: at("2026-11-12", "12:00"),
      endsAt: at("2026-11-12", "14:00"),
      createdById: adminId,
    });
    await addSession(prisma, {
      consultationId: project,
      date: "2026-11-12",
      start: "12:00",
      end: "14:00",
      amount: "250",
      timeZone: TZ,
    });

    const r = await report();
    expect(r.totals).toMatchObject({ leads: 1, booked: 1, held: 1, won: 1, revenueCents: 65000 });
    const by = Object.fromEntries(r.byTattooer.map((x) => [x.key, x.metrics]));
    // Each tattooer gets the revenue of their own tattoo
    expect(by[alex]).toMatchObject({ revenueCents: 40000, won: 1, held: 1 });
    expect(by[kim]).toMatchObject({ revenueCents: 25000, won: 1, booked: 0, held: 0 });
    // Filter by tattooer: only Kim's part
    expect((await report({ tattooerId: kim })).totals).toMatchObject({
      leads: 1,
      revenueCents: 25000,
    });
  });
});
