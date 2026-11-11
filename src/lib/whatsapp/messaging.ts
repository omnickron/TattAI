/**
 * Automatic WhatsApp messages: planning (first contact, follow-ups, reminders)
 * and dispatching with anti-spam staggering. Called periodically by the worker.
 */
import type {
  AfterConsultationCondition,
  MessagingSettings,
  OutboundKind,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { DEFAULT_TIME_ZONE, localDateOf, startOfLocalDay } from "../time";
import { classifyError, WhatsAppApiError, type WhatsAppClient } from "./client";
import {
  compileTemplate,
  renderTemplate,
  ALLOWED_VARIABLES,
  type TemplateVariable,
} from "./template-text";
import {
  activeBatch,
  bulkDecision,
  immediateDecision,
  parseSendTimes,
  randomGapMs,
  reminderDecision,
  type Decision,
  type ThrottleConfig,
} from "./throttle";

export interface MessagingDeps {
  prisma: PrismaClient;
  whatsapp: WhatsAppClient;
  now?: () => Date;
  random?: () => number;
  timeZone?: string;
}

const HOUR = 3600_000;
const MAX_ATTEMPTS = 5;
/** Messages sent per worker run at most (the gap usually stops earlier). */
const MAX_PER_RUN = 10;
// Bulk messages: released only at send times and within the limits.
const BULK_KINDS: OutboundKind[] = [
  "FIRST_CONTACT",
  "INTRO_MESSAGE",
  "FOLLOW_UP",
  "AFTER_CONSULTATION",
];
/** Further opening messages are only planned for first contacts younger than this. */
const INTRO_MAX_AGE_MS = 7 * 24 * HOUR;
/** Lead statuses in which opening messages still go out (also after a reply). */
const INTRO_STATUSES = ["CONTACTED", "IN_CHAT", "NO_RESPONSE"] as const;

type IntroRow = { kind: OutboundKind; step: number; status: string; sentAt: Date | null };

/**
 * Where a lead stands in the opening messages: the next step to plan (with its due time),
 * whether one is still pending (planned or queued), and the time of the last one sent.
 * Failed or cancelled steps count as done.
 */
export function introProgress(
  steps: Array<{ position: number; templateId: string; minDelayMinutes: number }>,
  firstSentAt: Date,
  rows: IntroRow[],
) {
  let previous = firstSentAt;
  for (const step of steps) {
    const row = rows.find((r) => r.kind === "INTRO_MESSAGE" && r.step === step.position);
    if (!row) {
      return {
        pending: true,
        next: { step, due: new Date(previous.getTime() + step.minDelayMinutes * 60_000) },
        lastSentAt: previous,
      };
    }
    if (row.status === "QUEUED") return { pending: true, next: null, lastSentAt: previous };
    if (row.status === "SENT" && row.sentAt) previous = row.sentAt;
  }
  return { pending: false, next: null, lastSentAt: previous };
}
/** After-consultation messages that are overdue by more than this are skipped. */
const AFTER_MAX_LATE_MS = 7 * 24 * HOUR;
const OPT_OUT_WORDS = new Set(["stop", "stopp", "abmelden", "keine nachrichten", "unsubscribe"]);

export async function loadMessagingSettings(prisma: PrismaClient): Promise<MessagingSettings> {
  return prisma.messagingSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export function throttleConfig(s: MessagingSettings, timeZone = DEFAULT_TIME_ZONE): ThrottleConfig {
  return {
    sendTimes: parseSendTimes(s.sendTimes),
    batchWindowMinutes: s.batchWindowMinutes,
    maxPerBatch: s.maxPerBatch,
    maxPerDay: s.maxPerDay,
    minGapSeconds: s.minGapSeconds,
    maxGapSeconds: s.maxGapSeconds,
    warmupStartDate: s.warmupStartDate ? s.warmupStartDate.toISOString().slice(0, 10) : null,
    warmupStartPerDay: s.warmupStartPerDay,
    warmupIncreasePerDay: s.warmupIncreasePerDay,
    timeZone,
  };
}

/** Stops all automatic sending (manually or after quality/spam signals). */
export async function pauseSending(prisma: PrismaClient, reason: string, now = new Date()) {
  await prisma.messagingSettings.upsert({
    where: { id: 1 },
    update: { pausedAt: now, pausedReason: reason.slice(0, 500) },
    create: { id: 1, pausedAt: now, pausedReason: reason.slice(0, 500) },
  });
  console.warn(`[whatsapp] sending paused: ${reason}`);
}

const eligibleLead = {
  whatsappConsent: true,
  phoneValid: true,
  whatsappOptOut: false,
  phoneE164: { not: null },
};

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export async function planMessages(deps: MessagingDeps) {
  const { prisma } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const settings = await loadMessagingSettings(prisma);
  let planned = 0;
  let noResponse = 0;

  // 1. First contact for new leads (released at the next send time by the dispatcher)
  if (settings.firstContactTemplateId) {
    const leads = await prisma.lead.findMany({
      where: {
        status: "NEW",
        ...eligibleLead,
        outboundMessages: { none: { kind: "FIRST_CONTACT" } },
      },
      select: { id: true },
      take: 500,
    });
    if (leads.length) {
      const res = await prisma.outboundMessage.createMany({
        data: leads.map((l) => ({
          leadId: l.id,
          kind: "FIRST_CONTACT" as const,
          dedupeKey: `first:${l.id}`,
          templateId: settings.firstContactTemplateId!,
          notBefore: now,
        })),
        skipDuplicates: true,
      });
      planned += res.count;
    }
  }

  // 1b. Further opening messages after the first contact, one after the other at send times –
  // always, also when the customer has replied (the bot waits, see waitingForIntroMessages)
  const introSteps = await prisma.introStep.findMany({ orderBy: { position: "asc" } });
  if (introSteps.length) {
    const leads = await prisma.lead.findMany({
      where: {
        status: { in: [...INTRO_STATUSES] },
        ...eligibleLead,
        firstContactedAt: { gte: new Date(now.getTime() - INTRO_MAX_AGE_MS) },
      },
      select: {
        id: true,
        outboundMessages: {
          where: { kind: { in: ["FIRST_CONTACT", "INTRO_MESSAGE"] } },
          select: { kind: true, step: true, status: true, sentAt: true },
        },
      },
      take: 1000,
    });
    for (const lead of leads) {
      const first = lead.outboundMessages.find(
        (m) => m.kind === "FIRST_CONTACT" && m.status === "SENT" && m.sentAt,
      );
      if (!first?.sentAt) continue;
      const { next } = introProgress(introSteps, first.sentAt, lead.outboundMessages);
      if (!next) continue;
      const res = await prisma.outboundMessage.createMany({
        data: [
          {
            leadId: lead.id,
            kind: "INTRO_MESSAGE" as const,
            step: next.step.position,
            dedupeKey: `intro:${lead.id}:${next.step.position}`,
            templateId: next.step.templateId,
            notBefore: next.due,
          },
        ],
        skipDuplicates: true,
      });
      planned += res.count;
    }
  }

  // 2. Follow-ups for contacted leads without reply, then "keine Antwort"
  const steps = await prisma.followUpStep.findMany({ orderBy: { position: "asc" } });
  const contacted = await prisma.lead.findMany({
    where: { status: "CONTACTED", ...eligibleLead },
    select: {
      id: true,
      outboundMessages: {
        where: { kind: { in: BULK_KINDS } },
        select: { kind: true, step: true, status: true, sentAt: true },
      },
    },
    take: 1000,
  });
  for (const lead of contacted) {
    const sent = lead.outboundMessages.filter((m) => m.status === "SENT" && m.sentAt);
    const first = sent.find((m) => m.kind === "FIRST_CONTACT");
    if (!first?.sentAt) continue;
    // Follow-ups start after the last opening message
    const intro = introProgress(introSteps, first.sentAt, lead.outboundMessages);
    if (intro.pending && now.getTime() - first.sentAt.getTime() < INTRO_MAX_AGE_MS) continue;
    let previous = intro.lastSentAt;
    let done = true;
    for (const [index, step] of steps.entries()) {
      const position = index + 1;
      const existing = lead.outboundMessages.find(
        (m) => m.kind === "FOLLOW_UP" && m.step === position,
      );
      if (existing?.status === "SENT" && existing.sentAt) {
        previous = existing.sentAt;
        continue;
      }
      done = false;
      if (!existing) {
        const due = new Date(previous.getTime() + step.delayHours * HOUR);
        if (due <= now) {
          const res = await prisma.outboundMessage.createMany({
            data: [
              {
                leadId: lead.id,
                kind: "FOLLOW_UP",
                step: position,
                dedupeKey: `follow:${lead.id}:${position}`,
                templateId: step.templateId,
                notBefore: due,
              },
            ],
            skipDuplicates: true,
          });
          planned += res.count;
        }
      }
      break; // only one step at a time
    }
    if (done && previous.getTime() + settings.noResponseAfterHours * HOUR <= now.getTime()) {
      const res = await prisma.lead.updateMany({
        where: { id: lead.id, status: "CONTACTED" },
        data: { status: "NO_RESPONSE", statusChangedAt: now },
      });
      noResponse += res.count;
    }
  }

  // 3. Reminders before consultations
  const rules = await prisma.reminderRule.findMany();
  if (rules.length) {
    const maxHours = Math.max(...rules.map((r) => r.hoursBefore));
    const consultations = await prisma.consultation.findMany({
      where: {
        status: "SCHEDULED",
        startsAt: { gt: now, lte: new Date(now.getTime() + maxHours * HOUR) },
        lead: eligibleLead,
      },
      select: { id: true, leadId: true, startsAt: true, createdAt: true },
    });
    const data = consultations.flatMap((c) =>
      rules.flatMap((r) => {
        const sendAt = new Date(c.startsAt.getTime() - r.hoursBefore * HOUR);
        // Not yet due, or booked after the reminder time (e.g. booked 1 h before the appointment)
        if (sendAt > now || c.createdAt > sendAt) return [];
        return [
          {
            leadId: c.leadId,
            consultationId: c.id,
            kind: "REMINDER" as const,
            step: r.hoursBefore,
            dedupeKey: `reminder:${c.id}:${r.hoursBefore}:${c.startsAt.getTime()}`,
            templateId: r.templateId,
            notBefore: sendAt,
          },
        ];
      }),
    );
    if (data.length)
      planned += (await prisma.outboundMessage.createMany({ data, skipDuplicates: true })).count;
  }

  // 4. Messages after the consultation (depending on the outcome)
  const afterRules = await prisma.afterConsultationRule.findMany();
  if (afterRules.length) {
    const maxHours = Math.max(...afterRules.map((r) => r.hoursAfter));
    const recent = await prisma.consultation.findMany({
      where: {
        status: { in: ["HELD", "NO_SHOW"] },
        walkIn: false,
        endsAt: { lte: now, gte: new Date(now.getTime() - maxHours * HOUR - AFTER_MAX_LATE_MS) },
        lead: eligibleLead,
      },
      select: { id: true, leadId: true, endsAt: true, status: true, tattooBooked: true },
    });
    const data = recent.flatMap((c) =>
      afterRules.flatMap((r) => {
        const due = new Date(c.endsAt.getTime() + r.hoursAfter * HOUR);
        if (due > now || now.getTime() - due.getTime() > AFTER_MAX_LATE_MS) return [];
        if (!matchesAfterCondition(r.condition, c)) return [];
        return [
          {
            leadId: c.leadId,
            consultationId: c.id,
            kind: "AFTER_CONSULTATION" as const,
            step: r.hoursAfter,
            afterRuleId: r.id,
            dedupeKey: `after:${c.id}:${r.id}`,
            templateId: r.templateId,
            notBefore: due,
          },
        ];
      }),
    );
    if (data.length)
      planned += (await prisma.outboundMessage.createMany({ data, skipDuplicates: true })).count;
  }

  return { planned, noResponse };
}

/** Does a consultation outcome match an "after the consultation" rule? */
export function matchesAfterCondition(
  condition: AfterConsultationCondition,
  c: { status: string; tattooBooked: boolean | null },
): boolean {
  switch (condition) {
    case "HELD":
      return c.status === "HELD";
    case "TATTOO_BOOKED":
      return c.status === "HELD" && c.tattooBooked === true;
    case "UNDECIDED":
      return c.status === "HELD" && c.tattooBooked === null;
    case "NO_TATTOO":
      return c.status === "HELD" && c.tattooBooked === false;
    case "NO_SHOW":
      return c.status === "NO_SHOW";
  }
}

// ---------------------------------------------------------------------------
// Dispatching
// ---------------------------------------------------------------------------

const weekdayDate = (tz: string) =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const timeOnly = (tz: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

async function templateValues(
  deps: MessagingDeps,
  outbound: { leadId: string; consultationId: string | null },
): Promise<Partial<Record<TemplateVariable, string>>> {
  const tz = deps.timeZone ?? DEFAULT_TIME_ZONE;
  const lead = await deps.prisma.lead.findUniqueOrThrow({ where: { id: outbound.leadId } });
  const app = await deps.prisma.appSettings.findUnique({ where: { id: 1 } });
  const values: Partial<Record<TemplateVariable, string>> = {
    Vorname: lead.name.trim().split(/\s+/)[0] || lead.name,
    Name: lead.name,
    Studio: app?.studioName || "unser Studio",
  };
  if (outbound.consultationId) {
    const c = await deps.prisma.consultation.findUniqueOrThrow({
      where: { id: outbound.consultationId },
      include: { tattooer: { include: { user: { select: { name: true } } } } },
    });
    values.Datum = weekdayDate(tz).format(c.startsAt);
    values.Uhrzeit = timeOnly(tz).format(c.startsAt);
    values.Ort = c.mode === "PHONE" ? "telefonisch" : app?.studioAddress || "im Studio";
    values.Tätowierer = c.tattooer.user.name.split(/\s+/)[0];
    // Next tattoo session of this consultation (for confirmations after the consultation)
    const sessions = await deps.prisma.tattooBooking.findMany({
      where: { consultationId: c.id, cancelled: false },
      orderBy: [{ date: "asc" }, { sessionNumber: "asc" }],
    });
    const nowTs = (deps.now ?? (() => new Date()))().getTime() - 24 * HOUR;
    const next = sessions.find((x) => x.date.getTime() >= nowTs) ?? sessions[0];
    values.TattooDatum = next ? weekdayDate(tz).format(next.startsAt ?? next.date) : "noch offen";
    values.TattooUhrzeit = next?.startsAt ? timeOnly(tz).format(next.startsAt) : "nach Absprache";
  }
  return values;
}

/** Re-checks right before sending whether the message is still wanted. */
async function stillApplicable(
  prisma: PrismaClient,
  o: {
    kind: OutboundKind;
    leadId: string;
    consultationId: string | null;
    dedupeKey: string;
    afterRuleId?: string | null;
  },
  now: Date,
): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: o.leadId } });
  if (!lead || !lead.whatsappConsent || !lead.phoneValid || lead.whatsappOptOut || !lead.phoneE164)
    return false;
  if (o.kind === "FIRST_CONTACT") return lead.status === "NEW";
  if (o.kind === "INTRO_MESSAGE")
    return (INTRO_STATUSES as readonly string[]).includes(lead.status);
  if (o.kind === "FOLLOW_UP") return lead.status === "CONTACTED";
  if (!o.consultationId) return false;
  if (o.kind === "AFTER_CONSULTATION") {
    // The outcome may have been corrected since planning.
    const [c, rule] = await Promise.all([
      prisma.consultation.findUnique({ where: { id: o.consultationId } }),
      o.afterRuleId
        ? prisma.afterConsultationRule.findUnique({ where: { id: o.afterRuleId } })
        : null,
    ]);
    return Boolean(c && rule && matchesAfterCondition(rule.condition, c));
  }
  const c = await prisma.consultation.findUnique({ where: { id: o.consultationId } });
  return Boolean(
    c &&
    c.status === "SCHEDULED" &&
    c.startsAt > now &&
    o.dedupeKey.endsWith(`:${c.startsAt.getTime()}`),
  );
}

export interface DispatchResult {
  sent: number;
  failed: number;
  cancelled: number;
  waiting: string | null;
}

/** Sends due messages while the throttle allows it. */
export async function dispatchMessages(deps: MessagingDeps): Promise<DispatchResult> {
  const { prisma, whatsapp } = deps;
  const clock = deps.now ?? (() => new Date());
  const tz = deps.timeZone ?? DEFAULT_TIME_ZONE;
  const result: DispatchResult = { sent: 0, failed: 0, cancelled: 0, waiting: null };

  for (let i = 0; i < MAX_PER_RUN; i++) {
    const now = clock();
    const settings = await loadMessagingSettings(prisma);
    if (!settings.sendingEnabled) return { ...result, waiting: "Versand ist ausgeschaltet" };
    if (settings.pausedAt)
      return { ...result, waiting: `Pausiert: ${settings.pausedReason ?? ""}` };

    const cfg = throttleConfig(settings, tz);
    const batch = activeBatch(now, cfg);
    // First contacts go out right away (outside quiet hours) unless they wait for send times
    const immediate = settings.firstContactImmediate;
    const batchKinds = immediate ? BULK_KINDS.filter((k) => k !== "FIRST_CONTACT") : BULK_KINDS;
    // Opening messages that go out right after their delay instead of at send times
    const directSteps = (
      await prisma.introStep.findMany({ where: { atSendTime: false }, select: { position: true } })
    ).map((st) => st.position);
    const direct: Prisma.OutboundMessageWhereInput[] = [
      ...(immediate ? [{ kind: "FIRST_CONTACT" as const }] : []),
      ...(directSteps.length
        ? [{ kind: "INTRO_MESSAGE" as const, step: { in: directSteps } }]
        : []),
    ];
    const [sentToday, sentInBatch] = await Promise.all([
      prisma.outboundMessage.count({
        where: { status: "SENT", sentAt: { gte: startOfLocalDay(localDateOf(now, tz), tz) } },
      }),
      batch
        ? prisma.outboundMessage.count({
            where: {
              status: "SENT",
              kind: { in: batchKinds },
              sentAt: { gte: batch.start },
              ...(directSteps.length
                ? { NOT: { kind: "INTRO_MESSAGE", step: { in: directSteps } } }
                : {}),
            },
          })
        : Promise.resolve(0),
    ]);
    const counters = { sentToday, sentInBatch, nextSendAllowedAt: settings.nextSendAllowedAt };
    // The last approved version is sent, even while a newer one is under review.
    const approved = {
      approvedText: { not: null },
      approvedName: { not: null },
      status: { not: "PAUSED" as const },
    };

    // Reminders first (time-critical), then immediate first contacts, then the messages
    // released at send times (first contacts / opening messages / follow-ups) in arrival order.
    const queued = (filter: Prisma.OutboundMessageWhereInput) =>
      prisma.outboundMessage.findFirst({
        where: {
          AND: [{ status: "QUEUED", notBefore: { lte: now }, template: approved }, filter],
        },
        orderBy: [{ kind: "asc" }, { notBefore: "asc" }],
        include: { template: true },
      });
    const quiet = settings.quietHoursEnabled
      ? { start: settings.quietHoursStart, end: settings.quietHoursEnd }
      : null;
    const candidates: Array<{
      filter: Prisma.OutboundMessageWhereInput;
      decide: () => Decision;
      reminder?: boolean;
    }> = [
      {
        filter: { kind: "REMINDER" },
        decide: () => reminderDecision(now, counters),
        reminder: true,
      },
      ...(direct.length
        ? [{ filter: { OR: direct }, decide: () => immediateDecision(now, cfg, counters, quiet) }]
        : []),
      {
        filter: {
          kind: { in: batchKinds },
          ...(directSteps.length
            ? { NOT: { kind: "INTRO_MESSAGE" as const, step: { in: directSteps } } }
            : {}),
        },
        decide: () => bulkDecision(now, cfg, counters),
      },
    ];
    let next: Awaited<ReturnType<typeof queued>> = null;
    let waiting: string | null = null;
    for (const c of candidates) {
      const found = await queued(c.filter);
      if (!found) continue;
      const decision = c.decide();
      if (decision.send) {
        next = found;
        break;
      }
      waiting ??= decision.reason;
      // Reminders block everything behind them only for the gap between messages
      if (c.reminder) break;
    }
    if (!next) return waiting ? { ...result, waiting } : result;

    if (!(await stillApplicable(prisma, next, now))) {
      await prisma.outboundMessage.update({
        where: { id: next.id },
        data: { status: "CANCELLED" },
      });
      result.cancelled++;
      continue;
    }

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: next.leadId } });
    const text = next.template.approvedText!;
    const compiled = compileTemplate(text, ALLOWED_VARIABLES[next.template.purpose]);
    if (!compiled.ok) {
      await pauseSending(
        prisma,
        `Template „${next.template.name}“ ist fehlerhaft: ${compiled.error}`,
        now,
      );
      return { ...result, waiting: "Template fehlerhaft" };
    }
    const values = await templateValues(deps, next);
    const parameters = compiled.value.variables.map((v) => values[v] ?? "");
    const gapUntil = new Date(now.getTime() + randomGapMs(cfg, deps.random));

    try {
      const { messageId } = await whatsapp.sendTemplate({
        to: lead.phoneE164!,
        name: next.template.approvedName!,
        language: next.template.language,
        parameters,
      });
      await prisma.$transaction([
        prisma.outboundMessage.update({
          where: { id: next.id },
          data: {
            status: "SENT",
            sentAt: now,
            waMessageId: messageId,
            attempts: { increment: 1 },
            lastError: null,
          },
        }),
        prisma.message.create({
          data: {
            leadId: lead.id,
            direction: "OUTBOUND",
            waMessageId: messageId,
            templateName: next.template.approvedName,
            body: renderTemplate(text, values),
            status: "sent",
            outboundId: next.id,
            sentAt: now,
          },
        }),
        prisma.lead.update({
          where: { id: lead.id },
          data: {
            lastOutboundAt: now,
            ...(next.kind === "FIRST_CONTACT"
              ? { firstContactedAt: now, status: "CONTACTED", statusChangedAt: now }
              : {}),
          },
        }),
        prisma.messagingSettings.update({
          where: { id: 1 },
          data: { nextSendAllowedAt: gapUntil },
        }),
      ]);
      result.sent++;
    } catch (err) {
      const code = err instanceof WhatsAppApiError ? err.code : null;
      const handling = classifyError(code, err instanceof WhatsAppApiError ? err.httpStatus : null);
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
      const attempts = next.attempts + 1;
      console.error(`[whatsapp] sending ${next.id} failed (${handling}, code ${code}): ${message}`);

      if (handling === "PAUSE") {
        await prisma.outboundMessage.update({
          where: { id: next.id },
          data: { attempts, lastError: message },
        });
        await pauseSending(prisma, `WhatsApp-Fehler ${code ?? ""}: ${message}`, now);
        return { ...result, waiting: "Automatisch pausiert" };
      }
      const giveUp = handling === "PERMANENT" || attempts >= MAX_ATTEMPTS;
      await prisma.$transaction([
        prisma.outboundMessage.update({
          where: { id: next.id },
          data: {
            attempts,
            lastError: message,
            status: giveUp ? "FAILED" : "QUEUED",
            notBefore: giveUp
              ? next.notBefore
              : new Date(now.getTime() + 5 * 60_000 * 2 ** (attempts - 1)),
          },
        }),
        prisma.messagingSettings.update({
          where: { id: 1 },
          data: { nextSendAllowedAt: gapUntil },
        }),
      ]);
      if (giveUp) result.failed++;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Worker run (lease-protected)
// ---------------------------------------------------------------------------

/** One worker run: plan, then dispatch. Skips if another process holds the lease. */
export async function runMessagingWorker(deps: MessagingDeps) {
  const now = (deps.now ?? (() => new Date()))();
  await loadMessagingSettings(deps.prisma);
  const lease = await deps.prisma.messagingSettings.updateMany({
    where: { id: 1, OR: [{ workerLeaseUntil: null }, { workerLeaseUntil: { lt: now } }] },
    data: { workerLeaseUntil: new Date(now.getTime() + 5 * 60_000) },
  });
  if (lease.count === 0) return { skipped: true as const };
  try {
    const planning = await planMessages(deps);
    const dispatch = await dispatchMessages(deps);
    return { skipped: false as const, ...planning, ...dispatch };
  } finally {
    await deps.prisma.messagingSettings.update({
      where: { id: 1 },
      data: { workerLeaseUntil: null, lastWorkerRunAt: (deps.now ?? (() => new Date()))() },
    });
  }
}

// ---------------------------------------------------------------------------
// Inbound
// ---------------------------------------------------------------------------

export function isOptOut(text: string | null | undefined): boolean {
  return Boolean(
    text &&
    OPT_OUT_WORDS.has(
      text
        .trim()
        .toLowerCase()
        .replace(/[.!]+$/, ""),
    ),
  );
}

/** Cancels queued automatic messages of a lead (after a reply or opt-out). */
export async function cancelQueued(prisma: PrismaClient, leadId: string, kinds: OutboundKind[]) {
  return prisma.outboundMessage.updateMany({
    where: { leadId, status: "QUEUED", kind: { in: kinds } },
    data: { status: "CANCELLED" },
  });
}

/**
 * The bot answers a lead only after the last opening message went out: true while one is
 * queued or not yet planned for a recent first contact.
 */
export async function waitingForIntroMessages(
  prisma: PrismaClient,
  leadId: string,
  now = new Date(),
) {
  const [lead, steps] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        whatsappOptOut: true,
        outboundMessages: {
          where: { kind: { in: ["FIRST_CONTACT", "INTRO_MESSAGE"] } },
          select: { kind: true, step: true, status: true, sentAt: true },
        },
      },
    }),
    prisma.introStep.findMany({ orderBy: { position: "asc" } }),
  ]);
  if (!lead || lead.whatsappOptOut || !steps.length) return false;
  const first = lead.outboundMessages.find(
    (m) => m.kind === "FIRST_CONTACT" && m.status === "SENT" && m.sentAt,
  );
  if (!first?.sentAt || now.getTime() - first.sentAt.getTime() >= INTRO_MAX_AGE_MS) return false;
  return introProgress(steps, first.sentAt, lead.outboundMessages).pending;
}
