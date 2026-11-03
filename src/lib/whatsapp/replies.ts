/**
 * Manual replies written in the app (admin or assigned tattooer). WhatsApp only
 * allows free-form text within 24 hours after the customer's last message.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { classifyError, WhatsAppApiError, type WhatsAppClient } from "./client";
import { botActiveFor, isBotGloballyEnabled, setBotEnabled } from "../bot/state";
import { pauseSending } from "./messaging";

export const REPLY_WINDOW_MS = 24 * 3600_000;
export const MAX_REPLY_LENGTH = 4096;

export class ReplyError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "NO_PHONE"
      | "OPT_OUT"
      | "WINDOW_CLOSED"
      | "EMPTY"
      | "TOO_LONG"
      | "SEND_FAILED"
      | "BOT_DISABLED",
    message: string,
  ) {
    super(message);
    this.name = "ReplyError";
  }
}

/** Whether free-form messages are allowed and until when. */
export function replyWindow(
  lastInboundAt: Date | null,
  now: Date,
): { open: boolean; closesAt: Date | null } {
  if (!lastInboundAt) return { open: false, closesAt: null };
  const closesAt = new Date(lastInboundAt.getTime() + REPLY_WINDOW_MS);
  return { open: closesAt > now, closesAt };
}

export interface ReplyDeps {
  prisma: PrismaClient;
  whatsapp: WhatsAppClient;
  now?: () => Date;
}

/** A person replies in the app: also hands the chat over from the bot to the person. */
export async function sendManualReply(
  deps: ReplyDeps,
  input: { leadId: string; userId: string; text: string },
) {
  const message = await sendFreeText(deps, {
    leadId: input.leadId,
    text: input.text,
    author: { userId: input.userId },
  });
  await setBotEnabled(deps.prisma, input.leadId, false, {
    userId: input.userId,
    reason: "HUMAN_TAKEOVER",
    now: message.sentAt,
  });
  return message;
}

/** The chatbot replies via the bot API; refused if the bot is off for this chat. */
export async function sendBotReply(deps: ReplyDeps, input: { leadId: string; text: string }) {
  const lead = await deps.prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { botEnabled: true, whatsappOptOut: true },
  });
  if (lead && !botActiveFor(lead, await isBotGloballyEnabled(deps.prisma))) {
    throw new ReplyError("BOT_DISABLED", "Der Bot ist in diesem Chat ausgeschaltet.");
  }
  return sendFreeText(deps, { leadId: input.leadId, text: input.text, author: { bot: true } });
}

async function sendFreeText(
  deps: ReplyDeps,
  input: { leadId: string; text: string; author: { userId: string } | { bot: true } },
) {
  const { prisma, whatsapp } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const text = input.text.trim();
  if (!text) throw new ReplyError("EMPTY", "Die Nachricht ist leer.");
  if (text.length > MAX_REPLY_LENGTH) {
    throw new ReplyError("TOO_LONG", `Höchstens ${MAX_REPLY_LENGTH} Zeichen.`);
  }

  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new ReplyError("NOT_FOUND", "Lead nicht gefunden.");
  if (!lead.phoneE164 || !lead.phoneValid)
    throw new ReplyError("NO_PHONE", "Keine gültige WhatsApp-Nummer.");
  if (lead.whatsappOptOut) {
    throw new ReplyError("OPT_OUT", "Der Kunde möchte keine WhatsApp-Nachrichten mehr (Opt-out).");
  }
  if (!replyWindow(lead.lastInboundAt, now).open) {
    throw new ReplyError(
      "WINDOW_CLOSED",
      "Das 24-Stunden-Fenster ist geschlossen. Freie Nachrichten sind erst wieder möglich, wenn der Kunde schreibt.",
    );
  }

  let messageId: string;
  try {
    ({ messageId } = await whatsapp.sendText({ to: lead.phoneE164, body: text }));
  } catch (err) {
    const code = err instanceof WhatsAppApiError ? err.code : null;
    const httpStatus = err instanceof WhatsAppApiError ? err.httpStatus : null;
    console.error(
      `[whatsapp] manual reply to lead ${lead.id} failed (code ${code}):`,
      err instanceof Error ? err.message : err,
    );
    if (code === 131047) {
      throw new ReplyError(
        "WINDOW_CLOSED",
        "WhatsApp meldet: Das 24-Stunden-Fenster ist geschlossen.",
      );
    }
    if (classifyError(code, httpStatus) === "PAUSE") {
      await pauseSending(prisma, `WhatsApp-Fehler ${code} beim Antworten`, now);
      throw new ReplyError(
        "SEND_FAILED",
        `WhatsApp hat die Nachricht abgelehnt (Fehler ${code}). Der automatische Versand wurde pausiert.`,
      );
    }
    throw new ReplyError(
      "SEND_FAILED",
      code
        ? `Senden fehlgeschlagen (WhatsApp-Fehler ${code}). Bitte später erneut versuchen.`
        : "Senden fehlgeschlagen. Bitte später erneut versuchen.",
    );
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        leadId: lead.id,
        direction: "OUTBOUND",
        waMessageId: messageId,
        body: text,
        status: "sent",
        sentById: "userId" in input.author ? input.author.userId : null,
        sentByBot: "bot" in input.author,
        sentAt: now,
      },
    }),
    prisma.lead.update({ where: { id: lead.id }, data: { lastOutboundAt: now } }),
  ]);
  return message;
}
