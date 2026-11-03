/**
 * Processing of WhatsApp Cloud API webhooks: inbound messages, delivery
 * statuses, template reviews and quality/account signals. Idempotent.
 */
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { botActiveFor, enqueueBotEvent, isBotGloballyEnabled } from "../bot/state";
import { classifyError } from "./client";
import { cancelQueued, isOptOut, pauseSending } from "./messaging";

export const WHATSAPP_PROVIDER = "whatsapp";

interface WaMessage {
  id: string;
  from: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { id?: string; caption?: string; mime_type?: string };
  document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
}

interface WaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

interface WaChange {
  field?: string;
  value?: {
    messages?: WaMessage[];
    statuses?: WaStatus[];
    contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
    event?: string;
    message_template_id?: number | string;
    message_template_name?: string;
    reason?: string | null;
    current_limit?: string;
    [key: string]: unknown;
  };
}

export interface WaWebhookPayload {
  object?: string;
  entry?: Array<{ id?: string; changes?: WaChange[] }>;
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function messageText(m: WaMessage): string {
  if (m.text?.body) return m.text.body;
  if (m.button?.text) return m.button.text;
  if (m.interactive?.button_reply?.title) return m.interactive.button_reply.title;
  if (m.interactive?.list_reply?.title) return m.interactive.list_reply.title;
  if (m.image) return m.image.caption ? `[Bild] ${m.image.caption}` : "[Bild]";
  if (m.document) return `[Dokument] ${m.document.filename ?? ""}`.trim();
  return `[${m.type ?? "Nachricht"}]`;
}

async function handleInbound(prisma: PrismaClient, m: WaMessage, now: Date) {
  const e164 = `+${m.from.replace(/^\+/, "")}`;
  const lead = await prisma.lead.findFirst({
    where: { phoneE164: e164 },
    orderBy: { createdAt: "desc" },
  });
  if (!lead) {
    // Unknown sender: keep it for review instead of dropping it.
    await prisma.webhookEvent.createMany({
      data: [
        {
          provider: "whatsapp_unknown_sender",
          externalId: m.id,
          payload: m as unknown as Prisma.InputJsonValue,
          status: "PROCESSED",
        },
      ],
      skipDuplicates: true,
    });
    return "unknown";
  }
  const sentAt = m.timestamp ? new Date(Number(m.timestamp) * 1000) : now;
  const body = messageText(m);
  let messageId: string;
  try {
    messageId = (
      await prisma.message.create({
        data: {
          leadId: lead.id,
          direction: "INBOUND",
          waMessageId: m.id,
          body,
          status: "received",
          payload: m as unknown as Prisma.InputJsonValue,
          sentAt,
        },
      })
    ).id;
  } catch (err) {
    if (isUniqueViolation(err)) return "duplicate";
    throw err;
  }

  const optOut = isOptOut(m.text?.body);
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      lastInboundAt: sentAt,
      ...(optOut ? { whatsappOptOut: true } : {}),
      ...(["NEW", "CONTACTED", "NO_RESPONSE"].includes(lead.status)
        ? { status: "IN_CHAT", statusChangedAt: now }
        : {}),
    },
  });
  // A reply stops the follow-up sequence; an opt-out stops everything.
  await cancelQueued(
    prisma,
    lead.id,
    optOut ? ["FIRST_CONTACT", "FOLLOW_UP", "REMINDER"] : ["FIRST_CONTACT", "FOLLOW_UP"],
  );

  // Images/documents (e.g. reference pictures) are downloaded by the worker.
  const media = m.image ?? m.document;
  const attachmentIds: string[] = [];
  if (media?.id) {
    const created = await prisma.leadAttachment.upsert({
      where: { waMediaId: media.id },
      update: {},
      create: {
        leadId: lead.id,
        messageId,
        waMediaId: media.id,
        mimeType: media.mime_type ?? null,
        fileName: m.document?.filename ?? null,
        caption: media.caption ?? null,
      },
    });
    attachmentIds.push(created.id);
  }

  // Forward to the chatbot only while it is active in this chat.
  if (
    botActiveFor(
      { botEnabled: lead.botEnabled, whatsappOptOut: lead.whatsappOptOut || optOut },
      await isBotGloballyEnabled(prisma),
    )
  ) {
    await enqueueBotEvent(prisma, "message.received", lead.id, {
      leadId: lead.id,
      message: {
        id: messageId,
        type: m.type ?? "text",
        text: body,
        attachmentIds,
        sentAt: sentAt.toISOString(),
      },
    });
  }
  return optOut ? "opt-out" : "stored";
}

async function handleStatus(prisma: PrismaClient, s: WaStatus, now: Date) {
  const message = await prisma.message.findUnique({ where: { waMessageId: s.id } });
  if (!message) return;
  const rank = STATUS_RANK[s.status] ?? 0;
  if (rank > (STATUS_RANK[message.status ?? ""] ?? 0)) {
    const code = s.errors?.[0]?.code ?? null;
    await prisma.message.update({
      where: { id: message.id },
      data: { status: s.status, errorCode: code },
    });
    if (s.status === "failed") {
      if (message.outboundId) {
        await prisma.outboundMessage.update({
          where: { id: message.outboundId },
          data: {
            status: "FAILED",
            lastError: `${code ?? ""} ${s.errors?.[0]?.title ?? ""}`.trim(),
          },
        });
      }
      if (classifyError(code) === "PAUSE") {
        await pauseSending(
          prisma,
          `Zustellfehler ${code}: ${s.errors?.[0]?.title ?? "unbekannt"}`,
          now,
        );
      }
    }
  }
}

async function handleTemplateStatus(prisma: PrismaClient, v: NonNullable<WaChange["value"]>) {
  const metaId = v.message_template_id ? String(v.message_template_id) : null;
  const template = metaId
    ? await prisma.whatsAppTemplate.findFirst({ where: { metaTemplateId: metaId } })
    : null;
  if (!template) return;
  const event = String(v.event ?? "").toUpperCase();
  if (event === "APPROVED") {
    await prisma.whatsAppTemplate.update({
      where: { id: template.id },
      data: {
        status: "APPROVED",
        approvedText: template.submittedText ?? template.bodyText,
        approvedName: template.submittedName ?? template.name,
        approvedAt: new Date(),
        rejectedReason: null,
      },
    });
  } else if (event === "REJECTED") {
    await prisma.whatsAppTemplate.update({
      where: { id: template.id },
      data: {
        status: template.approvedText ? "APPROVED" : "REJECTED",
        rejectedReason: v.reason ?? "abgelehnt",
      },
    });
  } else if (["PAUSED", "DISABLED", "FLAGGED"].includes(event)) {
    await prisma.whatsAppTemplate.update({
      where: { id: template.id },
      data: { status: "PAUSED", rejectedReason: v.reason ?? event },
    });
  }
}

async function handleQuality(prisma: PrismaClient, v: NonNullable<WaChange["value"]>, now: Date) {
  const event = String(v.event ?? "").toUpperCase();
  if (["FLAGGED", "DOWNGRADE"].includes(event)) {
    await pauseSending(
      prisma,
      `Meta meldet sinkende Qualität der Nummer (${event}${v.current_limit ? `, Limit ${v.current_limit}` : ""}). Bitte Texte und Abstände prüfen.`,
      now,
    );
  }
}

async function handleAccount(prisma: PrismaClient, v: NonNullable<WaChange["value"]>, now: Date) {
  const event = String(v.event ?? "").toUpperCase();
  if (/VIOLATION|DISABLED|BANNED|RESTRICT/.test(event)) {
    await pauseSending(prisma, `Meta meldet ein Problem mit dem WhatsApp-Konto (${event}).`, now);
  }
}

/** Processes one webhook delivery. Safe to call repeatedly with the same payload. */
export async function processWhatsAppWebhook(
  prisma: PrismaClient,
  payload: WaWebhookPayload,
  now = new Date(),
) {
  const results: string[] = [];
  if (payload?.object !== "whatsapp_business_account") return results;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v) continue;
      if (change.field === "messages") {
        for (const m of v.messages ?? []) results.push(await handleInbound(prisma, m, now));
        for (const s of v.statuses ?? []) {
          await handleStatus(prisma, s, now);
          results.push(`status:${s.status}`);
        }
        continue;
      }
      // Other events: deduplicate by content hash.
      const externalId = createHash("sha256").update(JSON.stringify(change)).digest("hex");
      const stored = await prisma.webhookEvent.createMany({
        data: [
          {
            provider: WHATSAPP_PROVIDER,
            externalId,
            payload: change as unknown as Prisma.InputJsonValue,
            status: "PROCESSED",
            processedAt: now,
          },
        ],
        skipDuplicates: true,
      });
      if (!stored.count) {
        results.push("duplicate");
        continue;
      }
      if (change.field === "message_template_status_update") await handleTemplateStatus(prisma, v);
      else if (change.field === "phone_number_quality_update") await handleQuality(prisma, v, now);
      else if (change.field === "account_update") await handleAccount(prisma, v, now);
      results.push(change.field ?? "unknown");
    }
  }
  return results;
}
