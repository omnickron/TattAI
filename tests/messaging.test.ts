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
  waitingForSecondMessage,
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
  purpose: "FIRST_CONTACT" | "FOLLOW_UP" | "REMINDER" | "AFTER_CONSULTATION",
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
        approvedName: approved ? name : null,
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
      // Most tests cover sending at send times; immediate first contact has its own tests
      firstContactImmediate: false,
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
    // Never approved → nothing is sent
    await prisma.whatsAppTemplate.update({
      where: { id: templates.first },
      data: { status: "PENDING", approvedText: null, approvedName: null },
    });
    expect((await dispatchMessages(deps)).sent).toBe(0);
    // A newer version under review: the approved version keeps being sent
    await prisma.whatsAppTemplate.update({
      where: { id: templates.first },
      data: { approvedText: "Hallo {{Vorname}}, alte Fassung!", approvedName: "erstkontakt" },
    });
    expect((await dispatchMessages(deps)).sent).toBe(1);
    expect(wa.sent[0].name).toBe("erstkontakt");
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

describe("immediate first contact and second message", () => {
  async function setup() {
    const second = await template(
      "FOLLOW_UP",
      "zweite",
      "Hi {{Vorname}}, erzähl mal: was für ein Tattoo schwebt dir vor?",
    );
    await prisma.messagingSettings.update({
      where: { id: 1 },
      data: {
        firstContactImmediate: true,
        secondMessageTemplateId: second,
        secondMessageMinDelayMinutes: 60,
        maxPerDay: 50,
      },
    });
    await prisma.followUpStep.create({
      data: { position: 1, delayHours: 24, templateId: templates.follow },
    });
    return second;
  }

  it("sends the first contact right away, also outside send times, but not at night", async () => {
    await setup();
    clock = at(MON, "14:12"); // no send time
    const l = await lead();
    await planMessages(deps);
    expect(await dispatchMessages(deps)).toMatchObject({ sent: 1 });
    expect(wa.sent[0].name).toBe("erstkontakt");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("CONTACTED");

    // A lead at 23:30 waits for the end of the quiet hours (08:00)
    clock = at(MON, "23:30");
    await lead();
    await planMessages(deps);
    expect(await dispatchMessages(deps)).toMatchObject({ sent: 0, waiting: "Ruhezeit" });
    clock = at("2026-11-10", "08:01");
    expect(await dispatchMessages(deps)).toMatchObject({ sent: 1 });
  });

  it("always sends the second message at the next send time; the bot waits for it", async () => {
    await setup();
    clock = at(MON, "14:12");
    const l = await lead();
    await planMessages(deps);
    await dispatchMessages(deps);
    // The customer replies right away – the bot still waits for the second message
    clock = at(MON, "14:20");
    await processWhatsAppWebhook(prisma, {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba",
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  {
                    from: (
                      await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })
                    ).phoneE164!.slice(1),
                    id: "wamid.in1",
                    timestamp: String(Math.floor(clock.getTime() / 1000)),
                    type: "text",
                    text: { body: "Hi, ich will ein Mandala" },
                  },
                ],
              },
            },
          ],
        },
      ],
    } as never);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("IN_CHAT");
    await planMessages(deps);
    const second = await prisma.outboundMessage.findFirstOrThrow({
      where: { leadId: l.id, kind: "SECOND_MESSAGE" },
    });
    expect(second.status).toBe("QUEUED");
    expect(await waitingForSecondMessage(prisma, l.id, clock)).toBe(true);

    // Not before the next send time (17:00)
    clock = at(MON, "16:00");
    expect(await dispatchMessages(deps)).toMatchObject({ sent: 0 });
    clock = at(MON, "17:00");
    expect(await dispatchMessages(deps)).toMatchObject({ sent: 1 });
    expect(wa.sent.map((m) => m.name)).toEqual(["erstkontakt", "zweite"]);
    expect(await waitingForSecondMessage(prisma, l.id, clock)).toBe(false);
    // The customer replied: no follow-up
    clock = at("2026-11-11", "10:00");
    await planMessages(deps);
    expect(await prisma.outboundMessage.count({ where: { leadId: l.id, kind: "FOLLOW_UP" } })).toBe(
      0,
    );
  });

  it("starts follow-ups only after the second message", async () => {
    await setup();
    clock = at(MON, "09:00");
    const l = await lead();
    await planMessages(deps);
    await dispatchMessages(deps); // first contact 09:00
    clock = at(MON, "10:05"); // send time 10:00, at least 60 min later
    await planMessages(deps);
    expect(await dispatchMessages(deps)).toMatchObject({ sent: 1 });
    // 24 h after the second message, at a send time
    clock = at("2026-11-10", "10:04");
    await planMessages(deps);
    expect(await prisma.outboundMessage.count({ where: { leadId: l.id, kind: "FOLLOW_UP" } })).toBe(
      0,
    );
    clock = at("2026-11-10", "10:06");
    await planMessages(deps);
    expect(await dispatchMessages(deps)).toMatchObject({ sent: 1 });
    expect(wa.sent.map((m) => m.name)).toEqual(["erstkontakt", "zweite", "nachfassen"]);
  });

  it("does not hold the bot when the second message is not configured or failed", async () => {
    const l = await lead({ firstContactedAt: at(MON, "09:00"), status: "CONTACTED" });
    expect(await waitingForSecondMessage(prisma, l.id, clock)).toBe(false);
    const second = await setup();
    expect(await waitingForSecondMessage(prisma, l.id, clock)).toBe(true);
    await prisma.outboundMessage.create({
      data: {
        leadId: l.id,
        kind: "SECOND_MESSAGE",
        dedupeKey: `second:${l.id}`,
        templateId: second,
        notBefore: clock,
        status: "FAILED",
      },
    });
    expect(await waitingForSecondMessage(prisma, l.id, clock)).toBe(false);
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

describe("template submission", () => {
  it("submits changes as new versions and keeps the approved one active", async () => {
    const { submitTemplateForReview } = await import("@/lib/whatsapp/templates");
    const submitted: string[] = [];
    const pendingClient = Object.assign(new FakeWhatsApp(), {
      async submitTemplate(t: { name: string; text: string }) {
        submitted.push(`${t.name}: ${t.text}`);
        return { id: `meta-${submitted.length}`, status: "PENDING" as const };
      },
    });
    const id = await template(
      "FOLLOW_UP",
      "nachfassen_neu",
      "Hallo {{Vorname}}, noch Interesse?",
      false,
    );
    await submitTemplateForReview(prisma, pendingClient, id);
    await prisma.whatsAppTemplate.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedName: "nachfassen_neu",
        approvedText: "Hallo {{Vorname}}, noch Interesse?",
      },
    });
    await prisma.whatsAppTemplate.update({
      where: { id },
      data: { bodyText: "Hi {{Vorname}}, magst du noch?" },
    });
    const t = await submitTemplateForReview(prisma, pendingClient, id);

    expect(submitted).toEqual([
      "nachfassen_neu: Hallo {{1}}, noch Interesse?",
      "nachfassen_neu_v2: Hi {{1}}, magst du noch?",
    ]);
    expect(t).toMatchObject({
      status: "PENDING",
      approvedName: "nachfassen_neu",
      submittedName: "nachfassen_neu_v2",
    });
    await expect(submitTemplateForReview(prisma, pendingClient, id)).rejects.toThrow(
      "bereits von Meta geprüft",
    );
  });
});

describe("after the consultation", () => {
  let afterTemplate: string;
  let tattooerId: string;

  beforeEach(async () => {
    afterTemplate = await template(
      "AFTER_CONSULTATION",
      "nach_beratung",
      "Hallo {{Vorname}}, dein Tattoo-Termin ist am {{TattooDatum}} um {{TattooUhrzeit}} bei {{Tätowierer}}. Bis dann!",
    );
    const u = await prisma.user.create({
      data: {
        name: "Alex Berger",
        email: "alex.after@example.com",
        role: "TATTOOER",
        tattooerProfile: { create: {} },
      },
      include: { tattooerProfile: true },
    });
    tattooerId = u.tattooerProfile!.id;
  });

  async function heldConsultation(tattooBooked: boolean | null, endsAt = at(MON, "09:30")) {
    const l = await lead({ status: "TATTOO_BOOKED" });
    const c = await prisma.consultation.create({
      data: {
        leadId: l.id,
        tattooerId,
        startsAt: new Date(endsAt.getTime() - HOUR / 2),
        endsAt,
        status: "HELD",
        tattooBooked,
      },
    });
    return { lead: l, consultation: c };
  }

  it("sends at the next send time once the outcome matches, with tattoo date variables", async () => {
    await prisma.afterConsultationRule.create({
      data: { hoursAfter: 2, condition: "TATTOO_BOOKED", templateId: afterTemplate },
    });
    const { consultation } = await heldConsultation(true);
    await prisma.tattooBooking.create({
      data: {
        consultationId: consultation.id,
        date: at("2026-11-26", "00:00"),
        startsAt: at("2026-11-26", "14:00"),
        endsAt: at("2026-11-26", "18:00"),
      },
    });
    await heldConsultation(false, at(MON, "08:30")); // other outcome → no message

    clock = at(MON, "11:00"); // 1.5 h after the end → not yet due
    expect((await planMessages(deps)).planned).toBe(0);
    clock = at(MON, "11:45"); // due, but outside send times
    expect((await planMessages(deps)).planned).toBe(1);
    expect(await dispatchMessages(deps)).toMatchObject({
      sent: 0,
      waiting: "Außerhalb der Sendezeiten",
    });
    clock = at(MON, "17:00");
    expect((await dispatchMessages(deps)).sent).toBe(1);
    expect(wa.sent.at(-1)).toMatchObject({
      name: "nach_beratung",
      parameters: ["Lena", "Donnerstag, 26. November", "14:00", "Alex"],
    });
  });

  it("drops the message if the outcome was corrected and skips long-overdue ones", async () => {
    await prisma.afterConsultationRule.create({
      data: { hoursAfter: 0, condition: "UNDECIDED", templateId: afterTemplate },
    });
    const { consultation } = await heldConsultation(null);
    await heldConsultation(null, at("2026-10-30", "09:30")); // > 7 days ago
    clock = at(MON, "10:00");
    expect((await planMessages(deps)).planned).toBe(1);
    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { tattooBooked: false },
    });
    expect(await dispatchMessages(deps)).toMatchObject({ sent: 0, cancelled: 1 });
  });
});
