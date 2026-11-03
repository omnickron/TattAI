import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { WhatsAppApiError, type WhatsAppClient } from "@/lib/whatsapp/client";
import { replyWindow, sendManualReply, type ReplyDeps } from "@/lib/whatsapp/replies";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const NOW = new Date("2026-11-09T12:00:00Z");
const HOUR = 3600_000;

class FakeWhatsApp implements WhatsAppClient {
  readonly mock = true;
  texts: Array<{ to: string; body: string }> = [];
  failWith: WhatsAppApiError | null = null;
  async sendText(input: { to: string; body: string }) {
    if (this.failWith) throw this.failWith;
    this.texts.push(input);
    return { messageId: `wamid.reply-${this.texts.length}` };
  }
  async sendTemplate() {
    return { messageId: "x" };
  }
  async submitTemplate() {
    return { id: "t", status: "APPROVED" as const };
  }
  async updateTemplate() {
    return { status: "APPROVED" as const };
  }
}

let wa: FakeWhatsApp;
let deps: ReplyDeps;
let userId: string;

async function lead(overrides: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: {
      source: "META_LEAD_AD",
      name: "Lena Müller",
      phoneE164: "+4915112345678",
      phoneValid: true,
      whatsappConsent: true,
      status: "IN_CHAT",
      lastInboundAt: new Date(NOW.getTime() - 2 * HOUR),
      ...overrides,
    },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
  wa = new FakeWhatsApp();
  deps = { prisma, whatsapp: wa, now: () => NOW };
  userId = (
    await prisma.user.create({
      data: { name: "Alex", email: "alex@example.com", role: "TATTOOER" },
    })
  ).id;
});

afterAll(() => prisma.$disconnect());

describe("replyWindow", () => {
  it("is open for 24 hours after the last customer message", () => {
    expect(replyWindow(null, NOW)).toEqual({ open: false, closesAt: null });
    expect(replyWindow(new Date(NOW.getTime() - 23 * HOUR), NOW).open).toBe(true);
    expect(replyWindow(new Date(NOW.getTime() - 24 * HOUR), NOW).open).toBe(false);
  });
});

describe("sendManualReply", () => {
  it("sends free text and stores it with the author", async () => {
    const l = await lead();
    const m = await sendManualReply(deps, {
      leadId: l.id,
      userId,
      text: "  Hi Lena, passt dir Donnerstag 15 Uhr?  ",
    });
    expect(wa.texts).toEqual([
      { to: "+4915112345678", body: "Hi Lena, passt dir Donnerstag 15 Uhr?" },
    ]);
    expect(m).toMatchObject({
      direction: "OUTBOUND",
      sentById: userId,
      status: "sent",
      waMessageId: "wamid.reply-1",
    });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).lastOutboundAt).toEqual(
      NOW,
    );
  });

  it("refuses outside the 24-hour window, after opt-out and without valid number", async () => {
    const closed = await lead({ lastInboundAt: new Date(NOW.getTime() - 25 * HOUR) });
    const never = await lead({ lastInboundAt: null });
    const optOut = await lead({ whatsappOptOut: true });
    const noPhone = await lead({ phoneValid: false, phoneE164: null });
    for (const [l, code] of [
      [closed, "WINDOW_CLOSED"],
      [never, "WINDOW_CLOSED"],
      [optOut, "OPT_OUT"],
      [noPhone, "NO_PHONE"],
    ] as const) {
      await expect(
        sendManualReply(deps, { leadId: l.id, userId, text: "Hallo" }),
      ).rejects.toMatchObject({ code });
    }
    expect(wa.texts).toHaveLength(0);
  });

  it("rejects empty and too long texts", async () => {
    const l = await lead();
    await expect(
      sendManualReply(deps, { leadId: l.id, userId, text: "   " }),
    ).rejects.toMatchObject({ code: "EMPTY" });
    await expect(
      sendManualReply(deps, { leadId: l.id, userId, text: "x".repeat(4097) }),
    ).rejects.toMatchObject({
      code: "TOO_LONG",
    });
  });

  it("stores nothing when sending fails and pauses on account-level errors", async () => {
    const l = await lead();
    wa.failWith = new WhatsAppApiError("Spam rate limit hit", 131048, 400);
    await expect(
      sendManualReply(deps, { leadId: l.id, userId, text: "Hallo" }),
    ).rejects.toMatchObject({
      code: "SEND_FAILED",
    });
    expect(await prisma.message.count()).toBe(0);
    expect(
      (await prisma.messagingSettings.findUniqueOrThrow({ where: { id: 1 } })).pausedReason,
    ).toContain("131048");
  });

  it("maps WhatsApp's 24-hour error to a closed window", async () => {
    const l = await lead();
    wa.failWith = new WhatsAppApiError("Re-engagement message", 131047, 400);
    await expect(
      sendManualReply(deps, { leadId: l.id, userId, text: "Hallo" }),
    ).rejects.toMatchObject({
      code: "WINDOW_CLOSED",
    });
  });
});
