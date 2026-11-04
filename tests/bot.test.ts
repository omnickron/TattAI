import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { checkBotAuth, signBotEvent } from "@/lib/bot/auth";
import { deliverBotEvents } from "@/lib/bot/deliveries";
import {
  botBook,
  botLead,
  botReschedule,
  botSaveTattooSummary,
  botSendMessage,
  toBotApiError,
  type BotDeps,
} from "@/lib/bot/service";
import { setBotEnabled } from "@/lib/bot/state";
import type { CalendarClient, CalendarConnection, CalendarEventInput } from "@/lib/google/calendar";
import { zonedTimeToUtc } from "@/lib/time";
import type { WhatsAppClient } from "@/lib/whatsapp/client";
import {
  attachmentFilePath,
  deleteLeadFiles,
  downloadPendingAttachments,
} from "@/lib/whatsapp/media";
import { sendManualReply } from "@/lib/whatsapp/replies";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedTimeToUtc(day, h * 60 + m);
};
const NOW = at("2026-11-02", "08:00");
const MON = "2026-11-09";

class FakeCalendar implements CalendarClient {
  readonly mock = true;
  updated: string[] = [];
  deleted: string[] = [];
  async getBusy() {
    return [];
  }
  async ensureConsultationCalendar(conn: CalendarConnection) {
    return `cal-${conn.tattooerId}`;
  }
  async createEvent(_c: CalendarConnection, _id: string, e: CalendarEventInput) {
    return `evt-${e.start.getTime()}`;
  }
  async updateEvent(_c: CalendarConnection, _id: string, eventId: string, e: CalendarEventInput) {
    this.updated.push(`${eventId}:${e.description.includes("Motiv: Rose") ? "rose" : "-"}`);
  }
  async deleteEvent(_c: CalendarConnection, _id: string, eventId: string) {
    this.deleted.push(eventId);
  }
}

class FakeWhatsApp implements WhatsAppClient {
  readonly mock = true;
  texts: string[] = [];
  async sendText(input: { to: string; body: string }) {
    this.texts.push(input.body);
    return { messageId: `wamid.t${this.texts.length}` };
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

let deps: BotDeps;
let wa: FakeWhatsApp;
let calendar: FakeCalendar;
let userId: string;
let tattooers: string[];

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
          availabilityRules: { create: [{ weekday: 1, startMinute: 600, endMinute: 720 }] },
        },
      },
    },
    include: { tattooerProfile: true },
  });
  return { userId: u.id, profileId: u.tattooerProfile!.id };
}

async function lead(overrides: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: {
      source: "META_LEAD_AD",
      name: "Lena Müller",
      phoneE164: "+4915112345678",
      phoneValid: true,
      whatsappConsent: true,
      status: "IN_CHAT",
      lastInboundAt: new Date(NOW.getTime() - 3600_000),
      ...overrides,
    },
  });
}

const inbound = (
  id: string,
  extra: Record<string, unknown> = { type: "text", text: { body: "Hallo" } },
) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        { field: "messages", value: { messages: [{ id, from: "4915112345678", ...extra }] } },
      ],
    },
  ],
});

beforeEach(async () => {
  await resetDatabase(prisma);
  wa = new FakeWhatsApp();
  calendar = new FakeCalendar();
  deps = {
    prisma,
    calendar,
    whatsapp: wa,
    now: () => NOW,
    random: () => 0,
    appUrl: "https://app.test",
  };
  const a = await tattooer("Alex");
  const k = await tattooer("Kim");
  userId = a.userId;
  tattooers = [a.profileId, k.profileId];
});

afterAll(() => prisma.$disconnect());

describe("human takeover and bot switch", () => {
  it("switches the bot off when a person replies", async () => {
    const l = await lead();
    await sendManualReply(
      { prisma, whatsapp: wa, now: () => NOW },
      { leadId: l.id, userId, text: "Ich übernehme" },
    );
    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(updated).toMatchObject({
      botEnabled: false,
      botDisabledReason: "HUMAN_TAKEOVER",
      botDisabledById: userId,
    });
    expect(await prisma.botDelivery.findMany({ select: { event: true } })).toEqual([
      { event: "chat.bot_disabled" },
    ]);
  });

  it("toggles idempotently and informs the bot", async () => {
    const l = await lead();
    expect(await setBotEnabled(prisma, l.id, false, { userId })).toBe(true);
    expect(await setBotEnabled(prisma, l.id, false, { userId })).toBe(false);
    expect(await setBotEnabled(prisma, l.id, true, { userId })).toBe(true);
    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(updated).toMatchObject({
      botEnabled: true,
      botDisabledReason: null,
      botDisabledById: null,
    });
    const events = await prisma.botDelivery.findMany({
      orderBy: { createdAt: "asc" },
      select: { event: true },
    });
    expect(events.map((e) => e.event)).toEqual(["chat.bot_disabled", "chat.bot_enabled"]);
  });

  it("forwards customer messages to the bot only while it is active", async () => {
    const l = await lead();
    await processWhatsAppWebhook(prisma, inbound("in1"), NOW);
    await setBotEnabled(prisma, l.id, false, { userId });
    await processWhatsAppWebhook(prisma, inbound("in2"), NOW);
    await setBotEnabled(prisma, l.id, true, { userId });
    await prisma.messagingSettings.upsert({
      where: { id: 1 },
      update: { botGloballyEnabled: false },
      create: { id: 1, botGloballyEnabled: false },
    });
    await processWhatsAppWebhook(prisma, inbound("in3"), NOW);
    const received = await prisma.botDelivery.findMany({ where: { event: "message.received" } });
    expect(received).toHaveLength(1);
    expect(received[0].payload).toMatchObject({ message: { text: "Hallo", type: "text" } });
  });
});

describe("bot API service", () => {
  it("refuses every write while the bot is off for the chat", async () => {
    const l = await lead({ botEnabled: false, botDisabledReason: "HUMAN_TAKEOVER" });
    for (const call of [
      () => botSendMessage(deps, l.id, { text: "Hi" }),
      () => botBook(deps, l.id, { startsAt: at(MON, "10:00").toISOString() }),
      () => botSaveTattooSummary(deps, l.id, { motif: "Rose" }),
    ]) {
      const err = toBotApiError(await call().catch((e) => e));
      expect(err).toMatchObject({ status: 409, code: "BOT_DISABLED" });
    }
    expect(wa.texts).toHaveLength(0);
    expect((await botLead(deps, l.id)).botActive).toBe(false);
  });

  it("sends bot replies marked as bot without taking over", async () => {
    const l = await lead();
    await botSendMessage(deps, l.id, { text: "Hallo Lena, ich bin der Studio-Assistent." });
    const m = await prisma.message.findFirstOrThrow({ where: { leadId: l.id } });
    expect(m).toMatchObject({ sentByBot: true, sentById: null });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).botEnabled).toBe(true);
    expect((await botLead(deps, l.id)).recentMessages.at(-1)).toMatchObject({ from: "bot" });
  });

  it("validates and stores the tattoo summary and updates calendar entries", async () => {
    const l = await lead();
    const c = await botBook(deps, l.id, {
      startsAt: at(MON, "10:00").toISOString(),
      mode: "PHONE",
    });
    expect(c.mode).toBe("PHONE");
    expect(
      toBotApiError(
        await botSaveTattooSummary(deps, l.id, { motif: "Rose", foo: 1 }).catch((e) => e),
      ).status,
    ).toBe(422);
    expect(
      toBotApiError(await botSaveTattooSummary(deps, l.id, { color: "pink" }).catch((e) => e))
        .status,
    ).toBe(422);
    const res = await botSaveTattooSummary(deps, l.id, {
      motif: "Rose",
      placement: "Unterarm",
      coverUp: false,
      color: "black_grey",
    });
    expect(res.calendarUpdated).toBe(true);
    expect(calendar.updated).toEqual([`evt-${at(MON, "10:00").getTime()}:rose`]);
    expect(
      (await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).tattooSummary,
    ).toMatchObject({ motif: "Rose" });
  });

  it("reschedules with the same tattooer, or fairly with someone else", async () => {
    const l = await lead();
    const c = await botBook(deps, l.id, { startsAt: at(MON, "10:00").toISOString() });
    const moved = await botReschedule(deps, c.id, { startsAt: at(MON, "11:00").toISOString() });
    expect(moved.id).toBe(c.id);
    expect(moved.startsAt).toEqual(at(MON, "11:00"));

    // Block the original tattooer at 11:30 → re-booked with the other one
    const original = (await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } }))
      .tattooerId;
    const other = tattooers.find((t) => t !== original)!;
    await prisma.availabilityException.create({
      data: {
        tattooerId: original,
        kind: "UNAVAILABLE",
        startsAt: at(MON, "11:30"),
        endsAt: at(MON, "12:00"),
      },
    });
    const rebooked = await botReschedule(deps, c.id, { startsAt: at(MON, "11:30").toISOString() });
    expect(rebooked.id).not.toBe(c.id);
    expect(
      (await prisma.consultation.findUniqueOrThrow({ where: { id: rebooked.id } })).tattooerId,
    ).toBe(other);
    expect((await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } })).status).toBe(
      "CANCELLED",
    );
    expect(calendar.deleted).toHaveLength(1);
  });

  it("keeps the consultation when nobody is free at the new time", async () => {
    const l = await lead();
    const c = await botBook(deps, l.id, { startsAt: at(MON, "10:00").toISOString() });
    const err = toBotApiError(
      await botReschedule(deps, c.id, { startsAt: at(MON, "15:00").toISOString() }).catch((e) => e),
    );
    expect(err).toMatchObject({ status: 409, code: "NO_TATTOOER_FREE" });
    expect((await prisma.consultation.findUniqueOrThrow({ where: { id: c.id } })).status).toBe(
      "SCHEDULED",
    );
  });
});

describe("bot API auth", () => {
  const key = "k".repeat(40);
  it("accepts only the configured key", () => {
    expect(checkBotAuth(`Bearer ${key}`, key)).toBeNull();
    expect(checkBotAuth(`Bearer wrong`, key)).toBe(401);
    expect(checkBotAuth(null, key)).toBe(401);
    expect(checkBotAuth(`Bearer ${key}`, "")).toBe(503);
    expect(checkBotAuth(`Bearer short`, "short")).toBe(503);
  });
});

describe("bot event delivery", () => {
  it("signs events, retries failures and drops messages after a takeover", async () => {
    const l = await lead();
    await processWhatsAppWebhook(prisma, inbound("in1"), NOW);
    const calls: Array<{ headers: Record<string, string>; body: string }> = [];
    let fail = true;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response(null, { status: fail ? 500 : 204 });
    }) as unknown as typeof fetch;
    // Events are created with the real clock, so delivery uses real time too.
    const base = new Date(Date.now() + 1000);
    const cfg = { url: "https://bot.test/hook", secret: "s3cret", fetchImpl, now: () => base };

    expect(await deliverBotEvents(prisma, cfg)).toMatchObject({ failed: 1 });
    expect(await deliverBotEvents(prisma, cfg)).toMatchObject({ failed: 0, delivered: 0 }); // backoff
    fail = false;
    expect(
      await deliverBotEvents(prisma, { ...cfg, now: () => new Date(base.getTime() + 120_000) }),
    ).toMatchObject({ delivered: 1 });

    const { headers, body } = calls[1];
    expect(headers["x-needl-event"]).toBe("message.received");
    expect(headers["x-needl-signature"]).toBe(
      signBotEvent("s3cret", headers["x-needl-timestamp"], body),
    );
    expect(JSON.parse(body)).toMatchObject({ event: "message.received", data: { leadId: l.id } });

    await processWhatsAppWebhook(prisma, inbound("in2"), NOW);
    await prisma.lead.update({ where: { id: l.id }, data: { botEnabled: false } });
    expect(
      await deliverBotEvents(prisma, { ...cfg, now: () => new Date(base.getTime() + 180_000) }),
    ).toMatchObject({ dropped: 1 });
  });

  it("drops events when no bot is connected", async () => {
    await lead();
    await processWhatsAppWebhook(prisma, inbound("in1"), NOW);
    expect(await deliverBotEvents(prisma, { url: undefined, secret: undefined })).toMatchObject({
      dropped: 1,
    });
  });
});

describe("reference images", () => {
  it("downloads images privately, serves only inside storage and deletes them with the lead", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "needl-media-"));
    try {
      const l = await lead();
      await processWhatsAppWebhook(
        prisma,
        inbound("img1", {
          type: "image",
          image: { id: "media-1", mime_type: "image/jpeg", caption: "So ungefähr" },
        }),
        NOW,
      );
      await processWhatsAppWebhook(
        prisma,
        inbound("doc1", { type: "document", document: { id: "media-2", filename: "x.exe" } }),
        NOW,
      );
      const downloader = {
        async download(id: string) {
          return id === "media-1"
            ? { data: Buffer.from("jpegdata"), mimeType: "image/jpeg" }
            : { data: Buffer.from("MZ"), mimeType: "application/x-msdownload" };
        },
      };
      expect(await downloadPendingAttachments(prisma, downloader, dir)).toEqual({ stored: 1 });
      const [img, doc] = await prisma.leadAttachment.findMany({ orderBy: { waMediaId: "asc" } });
      expect(img).toMatchObject({ status: "STORED", caption: "So ungefähr", sizeBytes: 8 });
      expect(doc).toMatchObject({ status: "FAILED" });
      const file = attachmentFilePath(img.storagePath!, dir);
      expect(await readFile(file, "utf8")).toBe("jpegdata");
      expect((await stat(file)).mode & 0o077).toBe(0);
      expect(() => attachmentFilePath("../../etc/passwd", dir)).toThrow();

      const delivered = await prisma.botDelivery.findMany({ where: { event: "message.received" } });
      expect(delivered[0].payload).toMatchObject({
        message: { type: "image", attachmentIds: [img.id] },
      });

      await deleteLeadFiles(l.id, dir);
      await expect(stat(file)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
