import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PushPayload, PushSender } from "@/lib/push";
import type { CalendarClient } from "@/lib/google/calendar";
import { cancelConsultation } from "@/lib/scheduling/booking";
import { appointmentLabel, notifyAppointment } from "@/lib/scheduling/notify";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

let sent: Array<{ endpoint: string; payload: PushPayload }>;
const push: PushSender = {
  configured: true,
  async send(sub, payload) {
    sent.push({ endpoint: sub.endpoint, payload });
    return { gone: false };
  },
};
const recipients = () => sent.map((s) => s.endpoint).sort();

async function user(name: string, role: "ADMIN" | "TATTOOER", pushAll = true) {
  const u = await prisma.user.create({
    data: { email: `${name}@test.de`, name, role, pushAllAppointments: pushAll },
  });
  await prisma.pushSubscription.create({
    data: { userId: u.id, endpoint: name, p256dh: "p", auth: "a" },
  });
  return u;
}

let alex: { id: string };
let kim: { id: string };
let chef: { id: string };
let ownOnly: { id: string };

beforeEach(async () => {
  await resetDatabase(prisma);
  sent = [];
  chef = await user("chef", "ADMIN", true);
  ownOnly = await user("owner2", "ADMIN", false);
  const a = await user("alex", "TATTOOER");
  const k = await user("kim", "TATTOOER");
  alex = await prisma.tattooerProfile.create({ data: { userId: a.id } });
  kim = await prisma.tattooerProfile.create({ data: { userId: k.id } });
});

async function consultation(tattooerId: string) {
  const lead = await prisma.lead.create({
    data: { source: "MANUAL", name: "Lena", phoneValid: true, status: "CONSULTATION_BOOKED" },
  });
  return prisma.consultation.create({
    data: {
      leadId: lead.id,
      tattooerId,
      startsAt: new Date("2026-11-18T13:00:00Z"),
      endsAt: new Date("2026-11-18T13:30:00Z"),
    },
  });
}

describe("appointment push", () => {
  it("goes to the tattooer and the admins who want all consultations", async () => {
    const c = await consultation(alex.id);
    expect(await notifyAppointment({ prisma, push }, "BOOKED", c.id)).toBe(2);
    expect(recipients()).toEqual(["alex", "chef"]);
    expect(sent[0].payload).toMatchObject({
      title: "Neue Beratung: Lena",
      body: "Mi., 18.11. – 14:00 Uhr · bei alex · vor Ort",
      url: `/leads/${c.leadId}`,
    });
  });

  it("skips whoever made the change and tells the previous tattooer about a handover", async () => {
    const c = await consultation(kim.id);
    await notifyAppointment({ prisma, push }, "REASSIGNED", c.id, {
      previousTattooerId: alex.id,
      byUserId: chef.id,
    });
    expect(recipients()).toEqual(["alex", "kim"]);
    expect(sent[0].payload.title).toBe("Beratung neu zugeteilt: Lena");
  });

  it("an admin with 'only my own' gets their own consultations", async () => {
    const own = await prisma.tattooerProfile.create({ data: { userId: ownOnly.id } });
    const c = await consultation(own.id);
    await notifyAppointment({ prisma, push }, "MOVED", c.id);
    expect(recipients()).toEqual(["chef", "owner2"]);
    sent = [];
    const other = await consultation(alex.id);
    await notifyAppointment({ prisma, push }, "MOVED", other.id);
    expect(recipients()).toEqual(["alex", "chef"]);
  });

  it("is sent when a consultation is cancelled, and never for test leads", async () => {
    const calendar = {} as CalendarClient;
    const c = await consultation(alex.id);
    await cancelConsultation({ prisma, calendar, push }, c.id);
    expect(recipients()).toEqual(["alex", "chef"]);
    expect(sent[0].payload.title).toBe("Beratung abgesagt: Lena");

    sent = [];
    const t = await consultation(alex.id);
    await prisma.lead.update({ where: { id: t.leadId }, data: { isTest: true } });
    expect(await notifyAppointment({ prisma, push }, "BOOKED", t.id)).toBe(0);
    expect(sent).toEqual([]);
  });

  it("formats the time in Berlin time", () => {
    expect(appointmentLabel(new Date("2026-07-01T08:15:00Z"))).toBe("Mi., 01.07. – 10:15 Uhr");
  });
});
