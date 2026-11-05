import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { CalendarClient, CalendarConnection, CalendarEventInput } from "@/lib/google/calendar";
import { bookConsultation, cancelConsultation } from "@/lib/scheduling/booking";
import { zonedTimeToUtc } from "@/lib/time";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const NOW = zonedTimeToUtc("2026-11-02", 8 * 60); // Monday 08:00
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc("2026-11-09", h * 60 + m);
};

class FakeCalendar implements CalendarClient {
  readonly mock = true;
  events: CalendarEventInput[] = [];
  async getBusy() {
    return [];
  }
  async ensureConsultationCalendar(conn: CalendarConnection) {
    return `cal-${conn.tattooerId}`;
  }
  async createEvent(_c: CalendarConnection, _id: string, e: CalendarEventInput) {
    this.events.push(e);
    return `evt-${this.events.length}`;
  }
  async updateEvent() {}
  async deleteEvent() {}
}

const image = (id: string) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            messages: [
              {
                id,
                from: "4915112345678",
                type: "image",
                image: { id: `media-${id}`, mime_type: "image/jpeg", caption: "So ungefähr" },
              },
            ],
          },
        },
      ],
    },
  ],
});

let calendar: FakeCalendar;
let leadId: string;
const deps = () => ({
  prisma,
  calendar,
  now: () => NOW,
  random: () => 0,
  appUrl: "https://app.test",
});

beforeEach(async () => {
  await resetDatabase(prisma);
  calendar = new FakeCalendar();
  await prisma.user.create({
    data: {
      name: "Alex",
      email: "alex@example.com",
      role: "TATTOOER",
      tattooerProfile: {
        create: {
          googleConnectedAt: new Date(),
          fairnessShare: { create: { weight: 1 } },
          availabilityRules: { create: [{ weekday: 1, startMinute: 600, endMinute: 720 }] },
        },
      },
    },
  });
  leadId = (
    await prisma.lead.create({
      data: {
        source: "META_LEAD_AD",
        name: "Lena",
        phoneE164: "+4915112345678",
        phoneValid: true,
        status: "IN_CHAT",
      },
    })
  ).id;
});

afterAll(() => prisma.$disconnect());

describe("reference images at the consultation", () => {
  it("attaches images sent before the booking when the consultation is booked", async () => {
    await processWhatsAppWebhook(prisma, image("a1"), NOW);
    const c = await bookConsultation(deps(), { leadId, startsAt: at("10:00") });
    const files = await prisma.leadAttachment.findMany({ where: { leadId } });
    expect(files.map((f) => f.consultationId)).toEqual([c.id]);
    // The calendar entry mentions them (the files stay in the app)
    expect(calendar.events[0].description).toContain("Referenzbilder: 1 (in der App)");
  });

  it("puts images sent later at the upcoming consultation", async () => {
    const c = await bookConsultation(deps(), { leadId, startsAt: at("10:00") });
    await processWhatsAppWebhook(prisma, image("a2"), NOW);
    const file = await prisma.leadAttachment.findFirstOrThrow({ where: { leadId } });
    expect(file.consultationId).toBe(c.id);
  });

  it("moves the images of a cancelled consultation to the next one", async () => {
    const first = await bookConsultation(deps(), { leadId, startsAt: at("10:00") });
    await processWhatsAppWebhook(prisma, image("a3"), NOW);
    await cancelConsultation(deps(), first.id);
    const second = await bookConsultation(deps(), { leadId, startsAt: at("11:00") });
    const file = await prisma.leadAttachment.findFirstOrThrow({ where: { leadId } });
    expect(file.consultationId).toBe(second.id);
  });
});
