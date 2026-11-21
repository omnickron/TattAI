/**
 * Voice memos: recorded once (e.g. on the phone), converted to ogg/opus – the format
 * WhatsApp shows as a real voice note – and sent within the 24-hour window after a
 * customer message: by hand from the chat, or automatically after the first reply.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { PrismaClient } from "@/generated/prisma/client";
import type { WhatsAppClient } from "./client";
import { attachmentFilePath, mediaStorageDir } from "./media";
import { replyWindow } from "./replies";

const run = promisify(execFile);

export const MAX_VOICE_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Meta keeps uploaded media about 30 days; upload again a bit earlier. */
const MEDIA_MAX_AGE_MS = 25 * 24 * 3600_000;

export class VoiceError extends Error {}

/** ffmpeg arguments: any audio → mono ogg/opus at 48 kHz (WhatsApp voice note). */
export function voiceConvertArgs(input: string, output: string) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-c:a",
    "libopus",
    "-b:a",
    "32k",
    "-application",
    "voip",
    output,
  ];
}

/** Seconds of an ffmpeg/ffprobe duration line ("Duration: 00:00:12.34"). */
export function parseDuration(text: string): number | null {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  return Math.round(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
}

/** Converts an uploaded recording and stores it as a voice memo. */
export async function createVoiceMemo(
  prisma: Pick<PrismaClient, "voiceMemo">,
  input: { name: string; data: Uint8Array; dir?: string; ffmpeg?: string },
) {
  if (!input.data.byteLength) throw new VoiceError("Die Datei ist leer.");
  if (input.data.byteLength > MAX_VOICE_UPLOAD_BYTES)
    throw new VoiceError("Die Aufnahme ist zu groß (höchstens 10 MB).");
  const dir = input.dir ?? mediaStorageDir();
  const id = randomUUID();
  const folder = path.join(/* turbopackIgnore: true */ dir, "voice");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const source = path.join(/* turbopackIgnore: true */ folder, `${id}.upload`);
  const target = path.join(/* turbopackIgnore: true */ folder, `${id}.ogg`);
  await writeFile(source, input.data, { mode: 0o600 });
  let durationSeconds: number | null = null;
  try {
    const { stderr } = await run(input.ffmpeg ?? "ffmpeg", voiceConvertArgs(source, target), {
      timeout: 60_000,
    });
    durationSeconds = parseDuration(stderr);
  } catch (err) {
    await rm(target, { force: true });
    const text = err instanceof Error ? err.message : String(err);
    throw new VoiceError(
      /ENOENT/.test(text)
        ? "Umwandeln nicht möglich: ffmpeg fehlt auf dem Server."
        : "Die Datei konnte nicht als Audio gelesen werden (z. B. m4a, mp3, ogg, wav).",
    );
  } finally {
    await rm(source, { force: true });
  }
  if (durationSeconds === null) {
    // ffmpeg -loglevel error prints no duration; ask ffprobe-style via a second pass
    durationSeconds = await probeDuration(target, input.ffmpeg).catch(() => null);
  }
  const size = (await stat(target)).size;
  return prisma.voiceMemo.create({
    data: {
      name: input.name.trim().slice(0, 100) || "Sprachnachricht",
      storagePath: path.relative(dir, target),
      sizeBytes: size,
      durationSeconds,
    },
  });
}

async function probeDuration(file: string, ffmpeg = "ffmpeg") {
  try {
    await run(ffmpeg, ["-hide_banner", "-i", file], { timeout: 20_000 });
  } catch (err) {
    // ffmpeg exits with an error without an output file, but prints the duration
    const stderr = (err as { stderr?: string }).stderr ?? "";
    return parseDuration(stderr);
  }
  return null;
}

export function voiceFilePath(storagePath: string, dir = mediaStorageDir()) {
  return attachmentFilePath(storagePath, dir);
}

/** Media id at Meta, uploading the file (again) when needed. */
async function mediaIdFor(
  prisma: Pick<PrismaClient, "voiceMemo">,
  whatsapp: WhatsAppClient,
  memo: {
    id: string;
    storagePath: string;
    waMediaId: string | null;
    waMediaUploadedAt: Date | null;
  },
  now: Date,
  dir?: string,
) {
  if (
    memo.waMediaId &&
    memo.waMediaUploadedAt &&
    now.getTime() - memo.waMediaUploadedAt.getTime() < MEDIA_MAX_AGE_MS
  )
    return memo.waMediaId;
  if (!whatsapp.uploadMedia)
    throw new VoiceError("Sprachnachrichten werden hier nicht unterstützt.");
  const data = await readFile(voiceFilePath(memo.storagePath, dir));
  const id = await whatsapp.uploadMedia({
    data,
    mimeType: "audio/ogg",
    fileName: "sprachnachricht.ogg",
  });
  await prisma.voiceMemo.update({
    where: { id: memo.id },
    data: { waMediaId: id, waMediaUploadedAt: now },
  });
  return id;
}

/**
 * Sends a voice memo to a lead (window open, no opt-out) and stores it in the chat.
 * Throws VoiceError with a German message when it is not allowed.
 */
export async function sendVoiceMemo(
  prisma: PrismaClient,
  whatsapp: WhatsAppClient,
  input: {
    leadId: string;
    voiceMemoId: string;
    byUserId?: string | null;
    now?: Date;
    dir?: string;
  },
) {
  const now = input.now ?? new Date();
  const [lead, memo] = await Promise.all([
    prisma.lead.findUnique({ where: { id: input.leadId } }),
    prisma.voiceMemo.findUnique({ where: { id: input.voiceMemoId } }),
  ]);
  if (!lead) throw new VoiceError("Kontakt nicht gefunden.");
  if (!memo) throw new VoiceError("Sprachnachricht nicht gefunden.");
  if (lead.whatsappOptOut)
    throw new VoiceError("Der Kunde hat WhatsApp-Nachrichten abbestellt (Opt-out).");
  if (!lead.phoneE164 || !lead.phoneValid) throw new VoiceError("Keine gültige Telefonnummer.");
  if (!replyWindow(lead.lastInboundAt, now).open)
    throw new VoiceError(
      "Sprachnachrichten gehen nur innerhalb von 24 Stunden nach der letzten Nachricht des Kunden.",
    );
  if (!whatsapp.sendAudio) throw new VoiceError("Sprachnachrichten werden hier nicht unterstützt.");
  const mediaId = await mediaIdFor(prisma, whatsapp, memo, now, input.dir);
  const { messageId } = await whatsapp.sendAudio({ to: lead.phoneE164, mediaId, voice: true });
  return prisma.message.create({
    data: {
      leadId: lead.id,
      direction: "OUTBOUND",
      waMessageId: messageId,
      body: `🎤 Sprachnachricht: ${memo.name}`,
      status: "sent",
      voiceMemoId: memo.id,
      sentById: input.byUserId ?? null,
      sentAt: now,
    },
  });
}

/** On the first reply of a customer: plan the configured voice memo (once per lead). */
export async function queueFirstReplyVoiceMemo(prisma: PrismaClient, leadId: string) {
  const settings = await prisma.messagingSettings.findUnique({
    where: { id: 1 },
    select: { firstReplyVoiceMemoId: true },
  });
  if (!settings?.firstReplyVoiceMemoId) return false;
  const res = await prisma.voiceMemoSend.createMany({
    data: [
      {
        leadId,
        voiceMemoId: settings.firstReplyVoiceMemoId,
        dedupeKey: `first-reply:${leadId}`,
      },
    ],
    skipDuplicates: true,
  });
  return res.count > 0;
}

/** Worker: sends planned voice memos (before the bot answers). */
export async function processVoiceMemoSends(
  prisma: PrismaClient,
  whatsapp: WhatsAppClient,
  now = new Date(),
  dir?: string,
) {
  const due = await prisma.voiceMemoSend.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  let sent = 0;
  for (const d of due) {
    try {
      await sendVoiceMemo(prisma, whatsapp, {
        leadId: d.leadId,
        voiceMemoId: d.voiceMemoId,
        now,
        dir,
      });
      await prisma.voiceMemoSend.update({
        where: { id: d.id },
        data: { status: "SENT", sentAt: now, attempts: { increment: 1 }, lastError: null },
      });
      sent++;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      // Not allowed (opt-out, window closed …): drop it; technical errors: up to 3 tries
      const final = err instanceof VoiceError || d.attempts + 1 >= 3;
      await prisma.voiceMemoSend.update({
        where: { id: d.id },
        data: {
          status: final ? (err instanceof VoiceError ? "CANCELLED" : "FAILED") : "QUEUED",
          attempts: { increment: 1 },
          lastError: message,
        },
      });
    }
  }
  return { sent };
}
