import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  WhatsAppApiError,
  type SendTemplateInput,
  type WhatsAppClient,
} from "@/lib/whatsapp/client";
import {
  dispatchMessages,
  planMessages,
  runMessagingWorker,
  type MessagingDeps,
} from "@/lib/whatsapp/messaging";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook";
import { zonedTimeToUtc } from "@/lib/time";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();

const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(day, h * 60 + m);
};
const HOUR = 3600_000;
// Monday 2026-11-09
const MON = "2026-11-09";

class FakeWhatsApp implements WhatsAppClient {
  readonly mock = true;
  sent: SendTemplateInput[] = [];
  failWith: WhatsAppApiError | null = null;
  async sendTemplate(input: SendTemplateInput) {
    if (this.failWith) throw this.failWith;
    this.sent.push(input);
    return { messageId: `wamid.${this.sent.length}` };
  }
  async sendText() {
    return { messageId: "wamid.text" };
  }
  async submitTemplate() {
    return { id: "t1", status: "APPROVED" as const };
  }
  async updateTemplate() {
    return { status: "APPROVED" as const };
  }
}

let clock: Date;
let wa: FakeWhatsApp;
let deps: MessagingDeps;
let templates: Record<"first" | "follow" | "reminder", string>;

async function template(
  purpose: "FIRST_CONTACT" | "FOLLOW_UP" | "REMINDER",
  name: string,
  text: string,
  approved = true,
) {
  return (
    await prisma.whatsAppTemplate.create({
      data: {
        purpose,
        name,
        bodyText: text,
        approvedText: approved ? text : null,
        status: approved ? "APPROVED" : "DRAFT",
      },
    })
  ).id;
}

async function lead(overrides: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: {
      source: "META_LEAD_AD",
      name: "Lena Müller",
      phoneE164: `+49151${Math.floor(10000000 + Math.random() * 89999999)}`,
      phoneValid: true,
      whatsappConsent: true,
      ...overrides,
    },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
  clock = at(MON, "08:00");
  wa = new FakeWhatsApp();
  deps = { prisma, whatsapp: wa, now: () => clock, random: () => 0 };
  templates = {
    first: await template(
      "FIRST_CONTACT",
      "erstkontakt",
      "Hallo {{Vorname}}, danke für deine Anfrage bei {{Studio}}!",
    ),
    follow: await template("FOLLOW_UP", "nachfassen", "Hallo {{Vorname}}, hast du noch Interesse?"),
    reminder: await template(
      "REMINDER",
      "erinnerung",
      "Hallo {{Vorname}}, wir sehen uns am {{Datum}} um {{Uhrzeit}}.",
    ),
  };
  await prisma.appSettings.create({
    data: { id: 1, studioName: "Ink Studio", studioAddress: "Musterstraße 1" },
  });
  await prisma.messagingSettings.create({
    data: {
      id: 1,
      sendingEnabled: true,
      sendTimes: [1, 2, 3, 4, 5].flatMap((weekday) => [
        { weekday, time: "10:00" },
        { weekday, time: "17:00" },
      ]),
      maxPerBatch: 3,
      maxPerDay: 5,
      minGapSeconds: 60,
      maxGapSeconds: 60,
      noResponseAfterHours: 48,
      firstContactTemplateId: templates.first,
    },
  });
});

afterAll(() => prisma.$disconnect());

describe("first contact", () => {
  it("plans only for eligible new leads", async () => {
    await lead();
    await lead({ whatsappConsent: false });
    await lead({ phoneValid: false });
    await lead({ whatsappOptOut: true });
    await lead({ status: "IN_CHAT" });
    expect((await planMessages(deps)).planned).toBe(1);
    expect((await planMessages(deps)).planned).toBe(0); // idempotent
  });

  it("waits for the next send time, then sends and marks the lead contacted", async () => {
    const l = await lead();
    await planMessages(deps);
    expect(await dispatchMessages(deps)).toMatchObject({
      sent: 0,
      waiting: "Außerhalb der Sendezeiten",
    });

    clock = at(MON, "10:00");
    expect((await dispatchMessages(deps)).sent).toBe(1);
    expect(wa.sent[0]).toMatchObject({
      to: l.phoneE164,
      name: "erstkontakt",
      parameters: ["Lena", "Ink Studio"],
    });
    const updated = await prisma.lead.findUniqueOrThrow({
      where: { id: l.id },
      include: { messages: true },
    });
    expect(updated.status).toBe("CONTACTED");
    expect(updated.messages[0]).toMatchObject({
      direction: "OUTBOUND",
      body: "Hallo Lena, danke für deine Anfrage bei Ink Studio!",
      status: "sent",
    });
  });

  it("staggers messages with a gap and respects the batch limit", async () => {
    for (let i = 0; i < 5; i++) await lead();
    await planMessages(deps);
    clock = at(MON, "10:00");
    expect((await dispatchMessages(deps)).sent).toBe(1); // gap blocks the second one
    clock = new Date(at(MON, "10:00").getTime() + 30_000);
    expect((await dispatchMessages(deps)).sent).toBe(0);
    for (const t of ["10:01", "10:02", "10:03", "10:04"]) {
      clock = at(MON, t);
      await dispatchMessages(deps);
    }
    expect(wa.sent).toHaveLength(3); // maxPerBatch = 3
    clock = at(MON, "17:00");
    await dispatchMessages(deps);
    clock = at(MON, "17:01");
    await dispatchMessages(deps);
    expect(wa.sent).toHaveLength(5);
  });

  it("respects the daily limit during warm-up", async () => {
    await prisma.messagingSettings.update({
      where: { id: 1 },
      data: {
        warmupStartDate: new Date(`${MON}T00:00:00Z`),
        warmupStartPerDay: 2,
        warmupIncreasePerDay: 1,
        maxPerBatch: 10,
      },
    });
    for (let i = 0; i < 4; i++) await lead();
    await planMessages(deps);
    for (const t of ["10:00", "10:01", "10:02", "10:03"]) {
      clock = at(MON, t);
      await dispatchMessages(deps);
    }
    expect(wa.sent).toHaveLength(2);
    expect(await dispatchMessages(deps)).toMatchObject({ waiting: "Tageslimit erreicht (2)" });
  });

  it("sends nothing while disabled, paused or without approved template", async () => {
    await lead();
    await planMessages(deps);
    clock = at(MON, "10:00");
    await prisma.messagingSettings.update({ where: { id: 1 }, data: { sendingEnabled: false } });
    expect((await dispatchMessages(deps)).sent).toBe(0);
    await prisma.messagingSettings.update({
      where: { id: 1 },
      data: { sendingEnabled: true, pausedAt: clock },
    });
    expect((await dispatchMessages(deps)).sent).toBe(0);
    await prisma.messagingSettings.update({ where: { id: 1 }, data: { pausedAt: null } });
    await prisma.whatsAppTemplate.update({
      where: { id: templates.first },
      data: { status: "PENDING" },
    });
    expect((await dispatchMessages(deps)).sent).toBe(0);
  });

  it("pauses everything on spam-related errors", async () => {
    await lead();
    await lead();
    await planMessages(deps);
    clock = at(MON, "10:00");
    wa.failWith = new WhatsAppApiError("Spam rate limit hit", 131048, 400);
    await dispatchMessages(deps);
    const settings = await prisma.messagingSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.pausedAt).toBeTruthy();
    expect(settings.pausedReason).toContain("131048");
    expect(await prisma.outboundMessage.count({ where: { status: "QUEUED" } })).toBe(2);
  });

  it("marks undeliverable messages as failed and continues", async () => {
    await lead();
    await planMessages(deps);
    clock = at(MON, "10:00");
    wa.failWith = new WhatsAppApiError("not on WhatsApp", 131026, 400);
    expect((await dispatchMessages(deps)).failed).toBe(1);
    expect(
      (await prisma.messagingSettings.findUniqueOrThrow({ where: { id: 1 } })).pausedAt,
    ).toBeNull();
  });
});

describe("follow-ups", () => {
  beforeEach(async () => {
    await prisma.followUpStep.createMany({
      data: [
        { position: 1, delayHours: 24, templateId: templates.follow },
        { position: 2, delayHours: 48, templateId: templates.follow },
      ],
    });
  });

  async function contactedLead() {
    const l = await lead();
    await planMessages(deps);
    clock = at(MON, "10:00");
    await dispatchMessages(deps);
    return l;
  }

  it("follows up after the delay, at send times, and finally marks no response", async () => {
    const l = await contactedLead();
    clock = new Date(at(MON, "10:00").getTime() + 23 * HOUR);
    expect((await planMessages(deps)).planned).toBe(0);
    clock = at("2026-11-10", "10:00"); // +24 h, also a send time
    expect((await planMessages(deps)).planned).toBe(1);
    clock = at("2026-11-10", "10:05");
    expect((await dispatchMessages(deps)).sent).toBe(1);
    clock = at("2026-11-12", "10:05"); // +48 h after step 1
    await planMessages(deps);
    clock = at("2026-11-12", "10:10");
    expect((await dispatchMessages(deps)).sent).toBe(1);
    clock = at("2026-11-14", "10:04"); // < 48 h after last step
    await planMessages(deps);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("CONTACTED");
    clock = at("2026-11-14", "10:20");
    expect((await planMessages(deps)).noResponse).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe(
      "NO_RESPONSE",
    );
  });

  it("stops when the customer replies", async () => {
    const l = await contactedLead();
    clock = at("2026-11-10", "10:00");
    await planMessages(deps);
    await processWhatsAppWebhook(
      prisma,
      {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "messages",
                value: {
                  messages: [
                    {
                      id: "in1",
                      from: l.phoneE164!.slice(1),
                      type: "text",
                      text: { body: "Ja, gerne!" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      clock,
    );
    clock = at("2026-11-10", "10:05");
    expect((await dispatchMessages(deps)).sent).toBe(0);
    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(updated.status).toBe("IN_CHAT");
    expect(await prisma.outboundMessage.count({ where: { status: "CANCELLED" } })).toBe(1);
  });
});

describe("reminders", () => {
  beforeEach(async () => {
    await prisma.reminderRule.createMany({
      data: [
        { hoursBefore: 24, templateId: templates.reminder },
        { hoursBefore: 2, templateId: templates.reminder },
      ],
    });
  });

  async function consultation(startsAt: Date, createdAt: Date) {
    const l = await lead({ status: "CONSULTATION_BOOKED" });
    const user = await prisma.user.create({
      data: {
        name: "Alex Berger",
        email: `alex${Math.random()}@example.com`,
        role: "TATTOOER",
        tattooerProfile: { create: {} },
      },
      include: { tattooerProfile: true },
    });
    const c = await prisma.consultation.create({
      data: {
        leadId: l.id,
        tattooerId: user.tattooerProfile!.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + HOUR / 2),
        createdAt,
      },
    });
    return { lead: l, consultation: c };
  }

  it("sends reminders on time, also outside send times", async () => {
    await consultation(at("2026-11-10", "21:00"), at(MON, "08:00"));
    clock = at(MON, "20:59");
    expect((await planMessages(deps)).planned).toBe(0);
    clock = at(MON, "21:00");
    expect((await planMessages(deps)).planned).toBe(1);
    expect((await dispatchMessages(deps)).sent).toBe(1);
    expect(wa.sent[0].parameters).toEqual(["Lena", "Dienstag, 10. November", "21:00"]);
    clock = at("2026-11-10", "19:00");
    await planMessages(deps);
    expect((await dispatchMessages(deps)).sent).toBe(1);
    expect(wa.sent).toHaveLength(2);
  });

  it("skips reminders whose time had passed when the consultation was booked", async () => {
    await consultation(at(MON, "12:00"), at(MON, "08:00")); // booked 4 h before
    clock = at(MON, "10:00");
    await planMessages(deps);
    const kinds = await prisma.outboundMessage.findMany({
      where: { kind: "REMINDER" },
      select: { step: true },
    });
    expect(kinds.map((k) => k.step)).toEqual([2]);
  });

  it("cancels reminders of cancelled consultations", async () => {
    const { consultation: c } = await consultation(at("2026-11-10", "21:00"), at(MON, "08:00"));
    clock = at(MON, "21:00");
    await planMessages(deps);
    await prisma.consultation.update({ where: { id: c.id }, data: { status: "CANCELLED" } });
    expect(await dispatchMessages(deps)).toMatchObject({ sent: 0, cancelled: 1 });
  });
});

describe("WhatsApp webhook", () => {
  const inbound = (id: string, from: string, body: string) => ({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          { field: "messages", value: { messages: [{ id, from, type: "text", text: { body } }] } },
        ],
      },
    ],
  });

  it("stores inbound messages once", async () => {
    const l = await lead();
    const payload = inbound("wamid.in1", l.phoneE164!.slice(1), "Hallo!");
    expect(await processWhatsAppWebhook(prisma, payload, clock)).toEqual(["stored"]);
    expect(await processWhatsAppWebhook(prisma, payload, clock)).toEqual(["duplicate"]);
    expect(await prisma.message.count({ where: { direction: "INBOUND" } })).toBe(1);
    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(updated.status).toBe("IN_CHAT");
    expect(updated.lastInboundAt).toBeTruthy();
  });

  it("handles opt-out and unknown senders", async () => {
    const l = await lead();
    await processWhatsAppWebhook(
      prisma,
      inbound("wamid.in2", l.phoneE164!.slice(1), "STOP"),
      clock,
    );
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).whatsappOptOut).toBe(
      true,
    );
    expect(
      await processWhatsAppWebhook(prisma, inbound("wamid.in3", "4915199999999", "Hi"), clock),
    ).toEqual(["unknown"]);
  });

  it("updates delivery status monotonically", async () => {
    const l = await lead();
    await planMessages(deps);
    clock = at(MON, "10:00");
    await dispatchMessages(deps);
    const statuses = (status: string) => ({
      object: "whatsapp_business_account",
      entry: [
        { changes: [{ field: "messages", value: { statuses: [{ id: "wamid.1", status }] } }] },
      ],
    });
    await processWhatsAppWebhook(prisma, statuses("read"), clock);
    await processWhatsAppWebhook(prisma, statuses("delivered"), clock); // late, must not downgrade
    const m = await prisma.message.findFirstOrThrow({ where: { leadId: l.id } });
    expect(m.status).toBe("read");
  });

  it("pauses sending when Meta flags the number quality", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "phone_number_quality_update",
              value: { event: "FLAGGED", current_limit: "TIER_250" },
            },
          ],
        },
      ],
    };
    await processWhatsAppWebhook(prisma, payload, clock);
    expect(await processWhatsAppWebhook(prisma, payload, clock)).toEqual(["duplicate"]);
    const settings = await prisma.messagingSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(settings.pausedReason).toContain("FLAGGED");
  });

  it("applies template review results", async () => {
    await prisma.whatsAppTemplate.update({
      where: { id: templates.follow },
      data: { status: "PENDING", metaTemplateId: "999", bodyText: "Neu: Hallo {{Vorname}}!" },
    });
    await processWhatsAppWebhook(
      prisma,
      {
        object: "whatsapp_business_account",
        entry: [
          {
            changes: [
              {
                field: "message_template_status_update",
                value: { event: "APPROVED", message_template_id: 999 },
              },
            ],
          },
        ],
      },
      clock,
    );
    const t = await prisma.whatsAppTemplate.findUniqueOrThrow({ where: { id: templates.follow } });
    expect(t).toMatchObject({ status: "APPROVED", approvedText: "Neu: Hallo {{Vorname}}!" });
  });
});

describe("worker", () => {
  it("does not run twice in parallel", async () => {
    await prisma.messagingSettings.update({
      where: { id: 1 },
      data: { workerLeaseUntil: new Date(clock.getTime() + 60_000) },
    });
    expect(await runMessagingWorker(deps)).toEqual({ skipped: true });
    await prisma.messagingSettings.update({ where: { id: 1 }, data: { workerLeaseUntil: null } });
    expect(await runMessagingWorker(deps)).toMatchObject({ skipped: false });
  });
});
