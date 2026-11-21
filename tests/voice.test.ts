import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { WhatsAppClient } from "@/lib/whatsapp/client";
import {
  createVoiceMemo,
  parseDuration,
  processVoiceMemoSends,
  sendVoiceMemo,
  VoiceError,
  voiceFilePath,
} from "@/lib/whatsapp/voice";
import { processWhatsAppWebhook } from "@/lib/whatsapp/webhook";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const dir = mkdtempSync(path.join(tmpdir(), "needl-voice-"));
afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await prisma.$disconnect();
});

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

class FakeWhatsApp implements WhatsAppClient {
  readonly mock = true;
  uploads = 0;
  audio: Array<{ to: string; mediaId: string; voice: boolean }> = [];
  async sendTemplate() {
    return { messageId: "t" };
  }
  async sendText() {
    return { messageId: "x" };
  }
  async submitTemplate() {
    return { id: "1", status: "APPROVED" as const };
  }
  async updateTemplate() {
    return { status: "APPROVED" as const };
  }
  async uploadMedia() {
    this.uploads++;
    return `media-${this.uploads}`;
  }
  async sendAudio(input: { to: string; mediaId: string; voice: boolean }) {
    this.audio.push(input);
    return { messageId: `wamid.audio-${this.audio.length}` };
  }
}

let wa: FakeWhatsApp;
const NOW = new Date("2026-11-21T12:00:00Z");

/** A stored memo without running ffmpeg (file content does not matter here). */
async function memo(name = "Begrüßung") {
  return prisma.voiceMemo.create({
    data: { name, storagePath: "voice/test.ogg", sizeBytes: 3, durationSeconds: 12 },
  });
}

async function lead(overrides: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: {
      source: "META_LEAD_AD",
      name: "Lena",
      phoneE164: "+4915112345678",
      phoneValid: true,
      whatsappConsent: true,
      status: "CONTACTED",
      ...overrides,
    },
  });
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

beforeEach(async () => {
  await resetDatabase(prisma);
  wa = new FakeWhatsApp();
  // The fake file the tests send
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(path.join(dir, "voice"), { recursive: true });
  writeFileSync(path.join(dir, "voice", "test.ogg"), "ogg");
});

describe("voice memos", () => {
  it.skipIf(!hasFfmpeg)("converts a recording to an ogg/opus voice note", async () => {
    const wav = path.join(dir, "in.wav");
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      wav,
    ]);
    const m = await createVoiceMemo(prisma, {
      name: "Hallo",
      data: new Uint8Array(readFileSync(wav)),
      dir,
    });
    const file = voiceFilePath(m.storagePath, dir);
    expect(file.endsWith(".ogg")).toBe(true);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).subarray(0, 4).toString()).toBe("OggS");
    expect(m.durationSeconds).toBe(2);
    await expect(
      createVoiceMemo(prisma, { name: "kaputt", data: new Uint8Array([1, 2, 3]), dir }),
    ).rejects.toBeInstanceOf(VoiceError);
  });

  it("reads the duration from ffmpeg output", () => {
    expect(parseDuration("  Duration: 00:01:05.40, start: 0")).toBe(65);
    expect(parseDuration("nothing")).toBeNull();
  });

  it("sends only inside the 24-hour window and stores the memo in the chat", async () => {
    const m = await memo();
    const closed = await lead({ lastInboundAt: new Date(NOW.getTime() - 25 * 3600_000) });
    await expect(
      sendVoiceMemo(prisma, wa, { leadId: closed.id, voiceMemoId: m.id, now: NOW, dir }),
    ).rejects.toThrow(/24 Stunden/);

    await prisma.lead.update({
      where: { id: closed.id },
      data: { lastInboundAt: new Date(NOW.getTime() - 3600_000) },
    });
    const msg = await sendVoiceMemo(prisma, wa, {
      leadId: closed.id,
      voiceMemoId: m.id,
      now: NOW,
      dir,
    });
    expect(wa.audio).toEqual([{ to: "+4915112345678", mediaId: "media-1", voice: true }]);
    expect([msg.body, msg.voiceMemoId, msg.direction]).toEqual([
      "🎤 Sprachnachricht: Begrüßung",
      m.id,
      "OUTBOUND",
    ]);
    // The uploaded file is reused
    await sendVoiceMemo(prisma, wa, { leadId: closed.id, voiceMemoId: m.id, now: NOW, dir });
    expect(wa.uploads).toBe(1);
  });

  it("goes out automatically once, after the customer's first reply", async () => {
    const m = await memo();
    await prisma.messagingSettings.upsert({
      where: { id: 1 },
      update: { firstReplyVoiceMemoId: m.id },
      create: { id: 1, firstReplyVoiceMemoId: m.id },
    });
    const l = await lead();
    await processWhatsAppWebhook(prisma, inbound("wamid.in1", "Hi!"), NOW);
    await processWhatsAppWebhook(prisma, inbound("wamid.in2", "Noch was"), NOW);
    expect(await prisma.voiceMemoSend.count()).toBe(1);
    expect(await processVoiceMemoSends(prisma, wa, NOW, dir)).toEqual({ sent: 1 });
    expect(await processVoiceMemoSends(prisma, wa, NOW, dir)).toEqual({ sent: 0 });
    expect(wa.audio).toHaveLength(1);
    const chat = await prisma.message.findMany({ where: { leadId: l.id, direction: "OUTBOUND" } });
    expect(chat.map((c) => c.voiceMemoId)).toEqual([m.id]);
  });

  it("does not send after an opt-out or when switched off", async () => {
    const m = await memo();
    await lead();
    // Switched off: nothing planned
    await processWhatsAppWebhook(prisma, inbound("wamid.a", "Hallo"), NOW);
    expect(await prisma.voiceMemoSend.count()).toBe(0);

    await resetDatabase(prisma);
    const m2 = await memo();
    await prisma.messagingSettings.create({ data: { id: 1, firstReplyVoiceMemoId: m2.id } });
    await lead();
    await processWhatsAppWebhook(prisma, inbound("wamid.b", "STOP"), NOW);
    expect(await prisma.voiceMemoSend.count()).toBe(0);
    expect(m).toBeTruthy();
  });
});
