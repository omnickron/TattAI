import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PushPayload, PushSender } from "@/lib/push";
import { loadManualUnread } from "@/lib/leads/manual-messages";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const NOW = new Date("2026-11-24T10:00:00Z");

class FakePush implements PushSender {
  readonly configured = true;
  sent: Array<{ endpoint: string; payload: PushPayload }> = [];
  async send(sub: { endpoint: string }, payload: PushPayload) {
    this.sent.push({ endpoint: sub.endpoint, payload });
    return { gone: false };
  }
}

const inbound = (id: string, text: string) => ({
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
                timestamp: String(Math.floor(NOW.getTime() / 1000)),
                type: "text",
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
});

async function user(name: string, role: "ADMIN" | "TATTOOER") {
  const u = await prisma.user.create({
    data: {
      name,
      email: `${name.toLowerCase()}@example.com`,
      role,
      pushSubscriptions: { create: { endpoint: `https://push/${name}`, p256dh: "k", auth: "a" } },
      ...(role === "TATTOOER" ? { tattooerProfile: { create: {} } } : {}),
    },
    include: { tattooerProfile: true },
  });
  return u;
}

async function lead(botEnabled: boolean) {
  return prisma.lead.create({
    data: {
      source: "META_LEAD_AD",
      name: "Lena",
      phoneE164: "+4915112345678",
      phoneValid: true,
      whatsappConsent: true,
      status: "IN_CHAT",
      botEnabled,
    },
  });
}

let push: FakePush;
beforeEach(async () => {
  await resetDatabase(prisma);
  push = new FakePush();
});

describe("new messages from contacts handled by hand", () => {
  it("marks them unread and pushes admins and the assigned tattooer", async () => {
    await user("Chefin", "ADMIN");
    const kim = await user("Kim", "TATTOOER");
    await user("Alex", "TATTOOER");
    const l = await lead(false);
    await prisma.consultation.create({
      data: {
        leadId: l.id,
        tattooerId: kim.tattooerProfile!.id,
        startsAt: new Date("2026-11-20T10:00:00Z"),
        endsAt: new Date("2026-11-20T10:30:00Z"),
        status: "HELD",
      },
    });
    await processWhatsAppWebhook(prisma, inbound("wamid.1", "Hallo, noch eine Frage"), NOW, {
      push,
    });
    expect(push.sent.map((s) => s.endpoint).sort()).toEqual([
      "https://push/Chefin",
      "https://push/Kim",
    ]);
    expect(push.sent[0].payload).toMatchObject({
      title: "Neue Nachricht von Lena",
      body: "Hallo, noch eine Frage",
      url: `/leads/${l.id}#chat`,
    });
    // Shown in the app: for admins and the tattooer, not for others
    expect(await loadManualUnread(prisma, { isAdmin: true, tattooerId: null })).toHaveLength(1);
    expect(
      await loadManualUnread(prisma, { isAdmin: false, tattooerId: kim.tattooerProfile!.id }),
    ).toHaveLength(1);
    const alex = await prisma.tattooerProfile.findFirstOrThrow({
      where: { user: { name: "Alex" } },
    });
    expect(await loadManualUnread(prisma, { isAdmin: false, tattooerId: alex.id })).toHaveLength(0);
    // A duplicate delivery does nothing
    await processWhatsAppWebhook(prisma, inbound("wamid.1", "Hallo, noch eine Frage"), NOW, {
      push,
    });
    expect(push.sent).toHaveLength(2);
  });

  it("only admins without an assigned tattooer; no push when switched off", async () => {
    await user("Chefin", "ADMIN");
    await user("Kim", "TATTOOER");
    await lead(false);
    await processWhatsAppWebhook(prisma, inbound("wamid.1", "Hi"), NOW, { push });
    expect(push.sent.map((s) => s.endpoint)).toEqual(["https://push/Chefin"]);

    await prisma.appSettings.create({ data: { id: 1, pushManualMessages: false } });
    await processWhatsAppWebhook(prisma, inbound("wamid.2", "Hallo?"), NOW, { push });
    expect(push.sent).toHaveLength(1);
    // The display in the app stays
    expect(await loadManualUnread(prisma, { isAdmin: true, tattooerId: null })).toHaveLength(1);
  });

  it("does nothing while the bot handles the chat", async () => {
    await user("Chefin", "ADMIN");
    const l = await lead(true);
    await processWhatsAppWebhook(prisma, inbound("wamid.1", "Hi"), NOW, { push });
    expect(push.sent).toHaveLength(0);
    expect(
      (await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).manualUnreadAt,
    ).toBeNull();
  });
});
