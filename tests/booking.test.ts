import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CalendarClient, CalendarConnection, CalendarEventInput } from "@/lib/google/calendar";
import type { Interval } from "@/lib/scheduling/slots";
import {
  BookingError,
  bookConsultation,
  cancelConsultation,
  getAvailableSlots,
  moveConsultation,
  createManualConsultation,
  createBlocker,
  checkSessionSlot,
  createWalkInProject,
  loadFairnessMembers,
  reassignConsultation,
  type SchedulingDeps,
} from "@/lib/scheduling/booking";
import { zonedTimeToUtc } from "@/lib/time";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();

// Monday 2026-11-09, "now" is the Monday before.
const DAY = "2026-11-09";
const at = (hhmm: string, day = DAY) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(day, h * 60 + m);
};
const NOW = at("08:00", "2026-11-02");

class FakeCalendar implements CalendarClient {
  readonly mock = true;
  busy = new Map<string, Interval[]>();
  failCreate = false;
  failBusyFor = new Set<string>();
  created: Array<{
    tattooerId: string;
    calendarId: string;
    event: CalendarEventInput;
    id: string;
  }> = [];
  deleted: string[] = [];

  async getBusy(conn: CalendarConnection) {
    if (this.failBusyFor.has(conn.tattooerId)) throw new Error("google down");
    return this.busy.get(conn.tattooerId) ?? [];
  }
  async ensureConsultationCalendar(conn: CalendarConnection) {
    return conn.calendarId ?? `cal-${conn.tattooerId}`;
  }
  async createEvent(conn: CalendarConnection, calendarId: string, event: CalendarEventInput) {
    if (this.failCreate) throw new Error("calendar down");
    const id = `evt-${this.created.length + 1}`;
    this.created.push({ tattooerId: conn.tattooerId, calendarId, event, id });
    return id;
  }
  async updateEvent() {}
  async deleteEvent(_conn: CalendarConnection, _calendarId: string, eventId: string) {
    this.deleted.push(eventId);
  }
}

let calendar: FakeCalendar;
let deps: SchedulingDeps;
let ids: Record<string, string>;

async function tattooer(
  name: string,
  weight: number,
  opts: { buffer?: number; duration?: number } = {},
) {
  const user = await prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: "TATTOOER",
      tattooerProfile: {
        create: {
          consultationMinutes: opts.duration ?? 30,
          bufferMinutes: opts.buffer ?? 0,
          googleConnectedAt: new Date(),
          fairnessShare: { create: { weight } },
          // Monday 10:00–12:00
          availabilityRules: { create: [{ weekday: 1, startMinute: 600, endMinute: 720 }] },
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
      data: {
        source: "MANUAL",
        name,
        phoneE164: "+4915112345678",
        phoneValid: true,
        status: "IN_CHAT",
      },
    })
  ).id;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  calendar = new FakeCalendar();
  deps = { prisma, calendar, now: () => NOW, random: () => 0, appUrl: "https://app.test" };
  ids = { a: await tattooer("Alex", 2), b: await tattooer("Kim", 1) };
});

afterAll(() => prisma.$disconnect());

describe("getAvailableSlots", () => {
  it("pools slots of all tattooers and removes Google busy times", async () => {
    calendar.busy.set(ids.b, [{ start: at("10:00"), end: at("11:00") }]);
    const slots = await getAvailableSlots(deps, { from: at("00:00"), to: at("23:59") });
    const at1000 = slots.find((s) => s.start.getTime() === at("10:00").getTime());
    const at1100 = slots.find((s) => s.start.getTime() === at("11:00").getTime());
    expect(at1000?.tattooers.map((t) => t.tattooerId)).toEqual([ids.a]);
    expect(at1100?.tattooers.map((t) => t.tattooerId).sort()).toEqual([ids.a, ids.b].sort());
  });

  it("skips tattooers without calendar connection or whose calendar fails", async () => {
    await prisma.tattooerProfile.update({
      where: { id: ids.b },
      data: { googleConnectedAt: null },
    });
    calendar.failBusyFor.add(ids.a);
    expect(await getAvailableSlots(deps, { from: at("00:00"), to: at("23:59") })).toEqual([]);
  });
});

describe("bookConsultation", () => {
  it("books fairly, writes the calendar event and updates the lead", async () => {
    const leadId = await lead("Lena");
    const c = await bookConsultation(deps, { leadId, startsAt: at("10:00") });
    // Alex has the larger share (2:1) → first booking
    expect(c.tattooerId).toBe(ids.a);
    expect(c.calendarEventId).toBe("evt-1");
    expect(c.endsAt.toISOString()).toBe(at("10:30").toISOString());
    expect(calendar.created[0].event.summary).toBe("Beratung: Lena");
    expect(calendar.created[0].event.description).toContain("https://app.test/leads/" + leadId);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe(
      "CONSULTATION_BOOKED",
    );
  });

  it("distributes by deficit over several bookings", async () => {
    const winners: string[] = [];
    for (const time of ["10:00", "10:00", "10:30", "11:00", "11:00", "11:30"]) {
      try {
        const c = await bookConsultation(deps, { leadId: await lead(), startsAt: at(time) });
        winners.push(c.tattooerId === ids.a ? "a" : "b");
      } catch (err) {
        winners.push((err as BookingError).code);
      }
    }
    // 10:00 → a (share 2/3, larger deficit), 10:00 → b (a busy), 10:30 → a (only free),
    // 11:00 → a (deficit a = 2/3·4 − 2 = 0.67 > b = 1/3·4 − 1 = 0.33), 11:00 → b (a busy),
    // 11:30 → a (a = 2/3·6 − 3 = 1 > b = 1/3·6 − 2 = 0) → final split 4:2 = target 2:1
    expect(winners).toEqual(["a", "b", "a", "a", "b", "a"]);
  });

  it("prevents double booking under concurrency", async () => {
    await prisma.tattooerProfile.update({
      where: { id: ids.b },
      data: { googleConnectedAt: null },
    });
    const results = await Promise.allSettled(
      [1, 2, 3].map(async (i) =>
        bookConsultation(deps, { leadId: await lead(`L${i}`), startsAt: at("10:00") }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const errors = results.flatMap((r) =>
      r.status === "rejected" ? [(r.reason as BookingError).code] : [],
    );
    expect(errors.every((code) => code === "SLOT_TAKEN" || code === "NO_TATTOOER_FREE")).toBe(true);
    expect(await prisma.consultation.count()).toBe(1);
  });

  it("respects the buffer between consultations", async () => {
    await prisma.tattooerProfile.update({
      where: { id: ids.b },
      data: { googleConnectedAt: null },
    });
    await prisma.tattooerProfile.update({ where: { id: ids.a }, data: { bufferMinutes: 15 } });
    await bookConsultation(deps, { leadId: await lead(), startsAt: at("10:00") });
    await expect(
      bookConsultation(deps, { leadId: await lead(), startsAt: at("10:30") }),
    ).rejects.toMatchObject({
      code: "NO_TATTOOER_FREE",
    });
    await expect(
      bookConsultation(deps, { leadId: await lead(), startsAt: at("10:45") }),
    ).resolves.toBeTruthy();
  });

  it("rolls back when the calendar event cannot be created", async () => {
    calendar.failCreate = true;
    const leadId = await lead();
    await expect(bookConsultation(deps, { leadId, startsAt: at("10:00") })).rejects.toMatchObject({
      code: "CALENDAR_FAILED",
    });
    expect(await prisma.consultation.count()).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("IN_CHAT");
  });

  it("rejects a second booking for the same lead and unavailable times", async () => {
    const leadId = await lead();
    await bookConsultation(deps, { leadId, startsAt: at("10:00") });
    await expect(bookConsultation(deps, { leadId, startsAt: at("11:00") })).rejects.toMatchObject({
      code: "ALREADY_BOOKED",
    });
    await expect(
      bookConsultation(deps, { leadId: await lead(), startsAt: at("15:00") }),
    ).rejects.toMatchObject({
      code: "NO_TATTOOER_FREE",
    });
  });

  it("honours an admin override of the tattooer", async () => {
    const c = await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("10:00"),
      tattooerId: ids.b,
    });
    expect(c.tattooerId).toBe(ids.b);
  });

  it("is protected by the database exclusion constraint", async () => {
    const leadId = await lead();
    await prisma.consultation.create({
      data: { leadId, tattooerId: ids.a, startsAt: at("10:00"), endsAt: at("10:30") },
    });
    await expect(
      prisma.consultation.create({
        data: { leadId, tattooerId: ids.a, startsAt: at("10:15"), endsAt: at("10:45") },
      }),
    ).rejects.toThrow();
    // Cancelled consultations do not block
    await prisma.consultation.updateMany({ data: { status: "CANCELLED" } });
    await expect(
      prisma.consultation.create({
        data: { leadId, tattooerId: ids.a, startsAt: at("10:15"), endsAt: at("10:45") },
      }),
    ).resolves.toBeTruthy();
  });
});

describe("tattoo sessions", () => {
  it("block consultation slots while tattooing (only with a time slot)", async () => {
    await prisma.tattooerProfile.update({
      where: { id: ids.b },
      data: { googleConnectedAt: null },
    });
    const leadId = await lead();
    const held = await prisma.consultation.create({
      data: {
        leadId,
        tattooerId: ids.a,
        startsAt: at("10:00", "2026-11-02"),
        endsAt: at("10:30", "2026-11-02"),
        status: "HELD",
        tattooBooked: true,
      },
    });
    await prisma.tattooBooking.createMany({
      data: [
        // Monday 10:00–11:00 tattooing → blocks
        {
          consultationId: held.id,
          sessionNumber: 1,
          date: at("00:00"),
          startsAt: at("10:00"),
          endsAt: at("11:00"),
        },
        // without time → does not block
        { consultationId: held.id, sessionNumber: 2, date: at("00:00") },
      ],
    });
    const slots = await getAvailableSlots(deps, { from: at("00:00"), to: at("23:59") });
    const starts = slots.map((s) => s.start.getTime());
    expect(starts).not.toContain(at("10:00").getTime());
    expect(starts).not.toContain(at("10:30").getTime());
    expect(starts).toContain(at("11:00").getTime());
  });
});

describe("moveConsultation", () => {
  it("moves within the same tattooer, also overlapping its own old slot and outside windows", async () => {
    const c = await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("10:00"),
      tattooerId: ids.a,
    });
    const moved = await moveConsultation(deps, c.id, at("10:15"));
    expect(moved).toMatchObject({ tattooerId: ids.a });
    expect(moved.startsAt).toEqual(at("10:15"));
    expect(moved.endsAt).toEqual(at("10:45"));
    // 19:00 is outside the availability window (10–12) but agreed personally
    expect((await moveConsultation(deps, c.id, at("19:00"))).startsAt).toEqual(at("19:00"));
  });

  it("refuses conflicts with consultations, tattoo sessions and Google", async () => {
    const c1 = await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("10:00"),
      tattooerId: ids.a,
    });
    const c2 = await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("11:00"),
      tattooerId: ids.a,
    });
    await expect(moveConsultation(deps, c2.id, at("10:15"))).rejects.toMatchObject({
      code: "NO_TATTOOER_FREE",
    });

    const held = await prisma.consultation.create({
      data: {
        leadId: await lead(),
        tattooerId: ids.a,
        startsAt: at("09:00", "2026-11-02"),
        endsAt: at("09:30", "2026-11-02"),
        status: "HELD",
        tattooBooked: true,
      },
    });
    await prisma.tattooBooking.create({
      data: {
        consultationId: held.id,
        date: at("00:00"),
        startsAt: at("14:00"),
        endsAt: at("16:00"),
      },
    });
    await expect(moveConsultation(deps, c1.id, at("15:00"))).rejects.toMatchObject({
      code: "NO_TATTOOER_FREE",
    });

    calendar.busy.set(ids.a, [{ start: at("17:00"), end: at("18:00") }]);
    await expect(moveConsultation(deps, c1.id, at("17:15"))).rejects.toMatchObject({
      code: "NO_TATTOOER_FREE",
    });
    expect(
      (await prisma.consultation.findUniqueOrThrow({ where: { id: c1.id } })).startsAt,
    ).toEqual(at("10:00"));
  });

  it("refuses past times and reverts when the calendar cannot be updated", async () => {
    const c = await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("10:00"),
      tattooerId: ids.a,
    });
    await expect(moveConsultation(deps, c.id, at("07:00", "2026-11-02"))).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    calendar.updateEvent = async () => {
      throw new Error("down");
    };
    await expect(moveConsultation(deps, c.id, at("11:00"))).rejects.toMatchObject({
      code: "CALENDAR_FAILED",
    });
    expect((await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } })).startsAt).toEqual(
      at("10:00"),
    );
  });
});

describe("manual entries from the calendar", () => {
  it("creates a consultation for the chosen tattooer outside the windows and writes the event", async () => {
    const leadId = await lead("Mara");
    const c = await createManualConsultation(deps, {
      leadId,
      tattooerId: ids.b,
      startsAt: at("19:00"),
      mode: "PHONE",
    });
    expect(c).toMatchObject({ tattooerId: ids.b, mode: "PHONE" });
    expect(c.endsAt).toEqual(at("19:30"));
    expect(calendar.created.at(-1)?.event.summary).toBe("Beratung: Mara (Telefon)");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe(
      "CONSULTATION_BOOKED",
    );
    await expect(
      createManualConsultation(deps, {
        leadId,
        tattooerId: ids.b,
        startsAt: at("20:00"),
        mode: "ON_SITE",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_BOOKED" });
  });

  it("refuses conflicts with blockers and tells why", async () => {
    await createBlocker(deps, {
      tattooerId: ids.a,
      startsAt: at("13:00"),
      endsAt: at("14:00"),
      note: "Arzttermin",
    });
    const err = await createManualConsultation(deps, {
      leadId: await lead(),
      tattooerId: ids.a,
      startsAt: at("13:15"),
      mode: "ON_SITE",
    }).catch((e) => e);
    expect(err).toMatchObject({ code: "NO_TATTOOER_FREE" });
    expect(err.message).toContain("Arzttermin");
    // Blockers also remove free slots for the fair booking / the bot
    const slots = await getAvailableSlots(deps, { from: at("00:00"), to: at("23:59") });
    expect(
      slots.some(
        (s) =>
          s.tattooers.some((t) => t.tattooerId === ids.a) &&
          s.start >= at("13:00") &&
          s.start < at("14:00"),
      ),
    ).toBe(false);
  });

  it("does not place a blocker over a booked consultation", async () => {
    await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("10:00"),
      tattooerId: ids.a,
    });
    await expect(
      createBlocker(deps, { tattooerId: ids.a, startsAt: at("09:30"), endsAt: at("10:15") }),
    ).rejects.toMatchObject({ code: "NO_TATTOOER_FREE" });
  });

  it("checks tattoo session slots against other appointments", async () => {
    const held = await prisma.consultation.create({
      data: {
        leadId: await lead(),
        tattooerId: ids.a,
        startsAt: at("09:00", "2026-11-02"),
        endsAt: at("09:30", "2026-11-02"),
        status: "HELD",
        tattooBooked: true,
      },
    });
    await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("10:00"),
      tattooerId: ids.a,
    });
    await expect(checkSessionSlot(deps, held.id, at("09:00"), at("12:00"))).rejects.toMatchObject({
      code: "NO_TATTOOER_FREE",
    });
    await expect(checkSessionSlot(deps, held.id, at("14:00"), at("17:00"))).resolves.toBeTruthy();
  });
});

describe("walk-in customers", () => {
  it("creates a tattoo project without consultation that blocks the time but counts nowhere", async () => {
    const leadId = await lead("Laufkundin");
    const id = await createWalkInProject(deps, {
      leadId,
      tattooerId: ids.a,
      startsAt: at("10:00"),
      endsAt: at("13:00"),
      createdById: "admin",
    });
    await prisma.tattooBooking.create({
      data: {
        consultationId: id,
        date: at("00:00"),
        startsAt: at("10:00"),
        endsAt: at("13:00"),
      },
    });
    const project = await prisma.consultation.findUniqueOrThrow({ where: { id } });
    expect(project).toMatchObject({ walkIn: true, status: "HELD", tattooBooked: true });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe(
      "TATTOO_BOOKED",
    );
    // The session blocks the slot …
    await expect(
      createManualConsultation(deps, {
        leadId: await lead(),
        tattooerId: ids.a,
        startsAt: at("11:00"),
        mode: "ON_SITE",
      }),
    ).rejects.toMatchObject({ code: "NO_TATTOOER_FREE" });
    // … but the zero-length project itself doesn't (e.g. right before the session, incl. buffer)
    await expect(
      createManualConsultation(deps, {
        leadId: await lead(),
        tattooerId: ids.a,
        startsAt: at("09:30"),
        mode: "ON_SITE",
      }),
    ).resolves.toBeTruthy();
    // Fairness only counts real consultations
    const { members } = await loadFairnessMembers(prisma, at("23:00"));
    expect(members.find((m) => m.tattooerId === ids.a)?.count).toBe(1);
  });

  it("refuses walk-ins over other appointments", async () => {
    await createBlocker(deps, { tattooerId: ids.b, startsAt: at("15:00"), endsAt: at("16:00") });
    await expect(
      createWalkInProject(deps, {
        leadId: await lead(),
        tattooerId: ids.b,
        startsAt: at("14:00"),
        endsAt: at("15:30"),
        createdById: "admin",
      }),
    ).rejects.toMatchObject({ code: "NO_TATTOOER_FREE" });
    expect(await prisma.consultation.count({ where: { walkIn: true } })).toBe(0);
  });
});

describe("cancel and reassign", () => {
  it("cancels, deletes the event and frees the slot", async () => {
    const leadId = await lead();
    const c = await bookConsultation(deps, { leadId, startsAt: at("10:00"), tattooerId: ids.a });
    await cancelConsultation(deps, c.id);
    expect(calendar.deleted).toEqual(["evt-1"]);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe(
      "CANCELLED",
    );
    await expect(
      bookConsultation(deps, { leadId: await lead(), startsAt: at("10:00"), tattooerId: ids.a }),
    ).resolves.toBeTruthy();
  });

  it("reassigns to another free tattooer and moves the event", async () => {
    const c = await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("10:00"),
      tattooerId: ids.a,
    });
    const moved = await reassignConsultation(deps, c.id, ids.b);
    expect(moved.tattooerId).toBe(ids.b);
    expect(moved.calendarId).toBe(`cal-${ids.b}`);
    expect(calendar.deleted).toEqual(["evt-1"]);
  });

  it("refuses to reassign to someone who is busy", async () => {
    calendar.busy.set(ids.b, [{ start: at("09:00"), end: at("12:00") }]);
    const c = await bookConsultation(deps, {
      leadId: await lead(),
      startsAt: at("10:00"),
      tattooerId: ids.a,
    });
    await expect(reassignConsultation(deps, c.id, ids.b)).rejects.toMatchObject({
      code: "NO_TATTOOER_FREE",
    });
    expect((await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } })).tattooerId).toBe(
      ids.a,
    );
  });
});
