/**
 * Operations the chatbot may perform via the bot API. Every write operation
 * is refused while the bot is switched off for the chat (human takeover,
 * manual switch, master switch or opt-out).
 */
import { z } from "zod";
import type { ConsultationMode, Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CalendarClient } from "../google/calendar";
import { normalizePhone } from "../phone";
import {
  BookingError,
  bookConsultation,
  cancelConsultation,
  getAvailableSlots,
  refreshConsultationEvent,
  rescheduleConsultation,
  SCHEDULING_DEFAULTS,
} from "../scheduling/booking";
import type { WhatsAppClient } from "../whatsapp/client";
import { replyWindow, ReplyError, sendBotReply } from "../whatsapp/replies";
import { botActiveFor, isBotGloballyEnabled } from "./state";

export interface BotDeps {
  prisma: PrismaClient;
  calendar: CalendarClient;
  whatsapp: WhatsAppClient;
  now?: () => Date;
  random?: () => number;
  timeZone?: string;
  appUrl?: string;
}

export class BotApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BotApiError";
  }
}

const DAY = 24 * 3600_000;

function nowOf(deps: BotDeps) {
  return (deps.now ?? (() => new Date()))();
}

/** Maps service errors to HTTP errors for the API. */
export function toBotApiError(err: unknown): BotApiError {
  if (err instanceof BotApiError) return err;
  if (err instanceof BookingError) {
    const status =
      { LEAD_NOT_FOUND: 404, NOT_FOUND: 404, CALENDAR_FAILED: 502 }[err.code as string] ?? 409;
    return new BotApiError(status, err.code, err.message);
  }
  if (err instanceof ReplyError) {
    const status =
      { NOT_FOUND: 404, EMPTY: 422, TOO_LONG: 422, SEND_FAILED: 502 }[err.code as string] ?? 409;
    return new BotApiError(status, err.code, err.message);
  }
  if (err instanceof z.ZodError) {
    return new BotApiError(
      422,
      "VALIDATION_ERROR",
      err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  console.error("[bot-api] unexpected error:", err);
  return new BotApiError(500, "INTERNAL_ERROR", "Unerwarteter Fehler.");
}

/** Loads the lead and makes sure the bot may act in this chat. */
async function requireActiveChat(prisma: PrismaClient, leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new BotApiError(404, "LEAD_NOT_FOUND", "Lead nicht gefunden.");
  if (!botActiveFor(lead, await isBotGloballyEnabled(prisma))) {
    throw new BotApiError(
      409,
      "BOT_DISABLED",
      "Der Bot ist in diesem Chat ausgeschaltet (z. B. von einem Menschen übernommen).",
    );
  }
  return lead;
}

async function requireConsultationOfActiveChat(prisma: PrismaClient, consultationId: string) {
  const c = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!c) throw new BotApiError(404, "NOT_FOUND", "Termin nicht gefunden.");
  await requireActiveChat(prisma, c.leadId);
  return c;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const slotQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Free start times across all tattooers (the backend assigns the tattooer when booking). */
export async function botSlots(deps: BotDeps, query: z.infer<typeof slotQuerySchema>) {
  const now = nowOf(deps);
  const from = query.from && query.from > now ? query.from : now;
  const maxTo = new Date(now.getTime() + SCHEDULING_DEFAULTS.horizonDays * DAY);
  const to =
    query.to && query.to < maxTo
      ? query.to
      : new Date(Math.min(from.getTime() + 14 * DAY, maxTo.getTime()));
  if (to <= from) return { from, to, slots: [] };
  const pooled = await getAvailableSlots(deps, { from, to });
  return {
    from,
    to,
    slots: pooled.map((s) => ({
      start: s.start,
      // Shortest consultation that starts here (durations differ per tattooer)
      end: new Date(Math.min(...s.tattooers.map((t) => t.end.getTime()))),
      available: s.tattooers.length,
    })),
  };
}

function author(m: {
  direction: string;
  sentByBot: boolean;
  sentById: string | null;
  outboundId: string | null;
}) {
  if (m.direction === "INBOUND") return "customer";
  if (m.sentByBot) return "bot";
  if (m.sentById) return "human";
  return "automatic";
}

/** Lead view for the bot: contact, state, upcoming consultation, recent messages. */
export async function botLead(deps: BotDeps, leadId: string) {
  const { prisma } = deps;
  const now = nowOf(deps);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      consultations: {
        where: { status: "SCHEDULED", endsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        take: 1,
        include: { tattooer: { include: { user: { select: { name: true } } } } },
      },
      messages: { orderBy: { sentAt: "desc" }, take: 30 },
      attachments: {
        where: { status: "STORED" },
        select: { id: true, mimeType: true, caption: true, createdAt: true },
      },
    },
  });
  if (!lead) throw new BotApiError(404, "LEAD_NOT_FOUND", "Lead nicht gefunden.");
  const globally = await isBotGloballyEnabled(prisma);
  const c = lead.consultations[0];
  return {
    id: lead.id,
    name: lead.name,
    firstName: lead.name.trim().split(/\s+/)[0],
    phone: lead.phoneE164,
    email: lead.email,
    status: lead.status,
    botActive: botActiveFor(lead, globally),
    botDisabledReason: !globally
      ? "GLOBAL_SWITCH"
      : lead.whatsappOptOut
        ? "OPT_OUT"
        : lead.botDisabledReason,
    replyWindowOpenUntil: replyWindow(lead.lastInboundAt, now).open
      ? replyWindow(lead.lastInboundAt, now).closesAt
      : null,
    tattooSummary: lead.tattooSummary,
    upcomingConsultation: c
      ? {
          id: c.id,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          mode: c.mode,
          tattooerFirstName: c.tattooer.user.name.split(/\s+/)[0],
        }
      : null,
    attachments: lead.attachments,
    recentMessages: lead.messages.reverse().map((m) => ({
      id: m.id,
      from: author(m),
      text: m.body,
      sentAt: m.sentAt,
    })),
  };
}

export async function botFindLeadByPhone(deps: BotDeps, phone: string) {
  const normalized = normalizePhone(phone, "DE");
  if (!normalized.valid) throw new BotApiError(422, "INVALID_PHONE", "Telefonnummer ist ungültig.");
  const lead = await deps.prisma.lead.findFirst({
    where: { phoneE164: normalized.e164 },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!lead) throw new BotApiError(404, "LEAD_NOT_FOUND", "Kein Lead mit dieser Nummer.");
  return botLead(deps, lead.id);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const bookSchema = z.object({
  startsAt: z.coerce.date(),
  mode: z.enum(["ON_SITE", "PHONE"]).optional().default("ON_SITE"),
});

export async function botBook(deps: BotDeps, leadId: string, body: unknown) {
  const input = bookSchema.parse(body);
  await requireActiveChat(deps.prisma, leadId);
  const c = await bookConsultation(deps, {
    leadId,
    startsAt: input.startsAt,
    mode: input.mode as ConsultationMode,
  });
  return {
    id: c.id,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    mode: c.mode,
    tattooerFirstName: c.tattooer.user.name.split(/\s+/)[0],
  };
}

export const rescheduleSchema = z.object({ startsAt: z.coerce.date() });

export async function botReschedule(deps: BotDeps, consultationId: string, body: unknown) {
  const input = rescheduleSchema.parse(body);
  await requireConsultationOfActiveChat(deps.prisma, consultationId);
  const c = await rescheduleConsultation(deps, consultationId, input.startsAt);
  return { id: c.id, startsAt: c.startsAt, endsAt: c.endsAt, mode: c.mode };
}

export async function botCancel(deps: BotDeps, consultationId: string) {
  await requireConsultationOfActiveChat(deps.prisma, consultationId);
  await cancelConsultation(deps, consultationId);
  return { id: consultationId, status: "CANCELLED" };
}

const text = (max: number) => z.string().trim().min(1).max(max).optional();

export const tattooSummarySchema = z
  .object({
    motif: text(500),
    placement: text(200),
    size: text(200),
    style: text(200),
    color: z.enum(["color", "black_grey"]).optional(),
    coverUp: z.boolean().optional(),
    referenceAttachmentIds: z.array(z.string()).max(30).optional(),
    timeframe: text(200),
    notes: text(2000),
  })
  .strict();

/** Stores the structured tattoo idea and updates the calendar entries. */
export async function botSaveTattooSummary(deps: BotDeps, leadId: string, body: unknown) {
  const summary = tattooSummarySchema.parse(body);
  await requireActiveChat(deps.prisma, leadId);
  if (summary.referenceAttachmentIds?.length) {
    const count = await deps.prisma.leadAttachment.count({
      where: { id: { in: summary.referenceAttachmentIds }, leadId },
    });
    if (count !== new Set(summary.referenceAttachmentIds).size) {
      throw new BotApiError(422, "VALIDATION_ERROR", "referenceAttachmentIds: unbekannte Anhänge.");
    }
  }
  const stored = {
    ...summary,
    referenceImageCount: summary.referenceAttachmentIds?.length ?? undefined,
    updatedAt: nowOf(deps).toISOString(),
  };
  await deps.prisma.lead.update({
    where: { id: leadId },
    data: { tattooSummary: stored as unknown as Prisma.InputJsonValue },
  });
  const upcoming = await deps.prisma.consultation.findMany({
    where: { leadId, status: "SCHEDULED", endsAt: { gt: nowOf(deps) } },
    select: { id: true },
  });
  let calendarUpdated = true;
  for (const c of upcoming)
    calendarUpdated = (await refreshConsultationEvent(deps, c.id)) && calendarUpdated;
  // Tattoo sessions show the motif too: queue them for the calendar sync (worker picks them up)
  await deps.prisma.tattooBooking.updateMany({
    where: { consultation: { leadId }, cancelled: false, calendarEventId: { not: null } },
    data: { calendarSyncPending: true, calendarNextAttemptAt: null },
  });
  return { tattooSummary: stored, calendarUpdated };
}

export const messageSchema = z.object({ text: z.string().min(1).max(4096) });

export async function botSendMessage(deps: BotDeps, leadId: string, body: unknown) {
  const input = messageSchema.parse(body);
  await requireActiveChat(deps.prisma, leadId);
  const m = await sendBotReply(deps, { leadId, text: input.text });
  return { id: m.id, sentAt: m.sentAt };
}
