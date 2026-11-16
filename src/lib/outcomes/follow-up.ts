/**
 * Follow-ups: after a consultation the customer is interested but undecided; the tattooer
 * picks a day to contact them again. On that day (09:00) they get a push and the customer
 * shows up under "Heute nachfassen" until the result of the follow-up is entered (reached or
 * not; tattoo agreed, no tattoo, or follow up again on a later day).
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { pushToUsers, type PushSender } from "../push";
import {
  addDays,
  DEFAULT_TIME_ZONE,
  isLocalDate,
  localDateOf,
  startOfLocalDay,
  zonedTimeToUtc,
} from "../time";
import {
  FOLLOW_UP_MINUTE,
  OutcomeError,
  recordOutcome,
  syncLeadStatusFromConsultations,
  type OutcomeInput,
} from "./outcome";

/** Open follow-ups due until the end of today (overdue ones included). */
export function dueFollowUpWhere(
  now: Date,
  scope: { isAdmin: boolean; tattooerId: string | null },
  tz = DEFAULT_TIME_ZONE,
): Prisma.ConsultationWhereInput {
  const endOfToday = startOfLocalDay(addDays(localDateOf(now, tz), 1), tz);
  // Stays until confirmed with "Erledigt" – a new outcome or booking does not remove it
  return {
    followUpAt: { lt: endOfToday },
    followUpDoneAt: null,
    lead: { isTest: false },
    ...(scope.isAdmin ? {} : { tattooerId: scope.tattooerId ?? "__none__" }),
  };
}

export async function loadDueFollowUps(
  prisma: Pick<PrismaClient, "consultation">,
  scope: { isAdmin: boolean; tattooerId: string | null },
  now = new Date(),
  tz = DEFAULT_TIME_ZONE,
) {
  return prisma.consultation.findMany({
    where: dueFollowUpWhere(now, scope, tz),
    orderBy: { followUpAt: "asc" },
    take: 20,
    select: {
      id: true,
      followUpAt: true,
      outcomeNote: true,
      lead: { select: { id: true, name: true, phoneE164: true } },
      tattooer: { select: { user: { select: { name: true } } } },
    },
  });
}

export type FollowUpResultValue = "TATTOO" | "NO_TATTOO" | "AGAIN";

export interface FollowUpResultInput {
  /** Customer reached / got in touch */
  reached: boolean | null;
  result: FollowUpResultValue | null;
  note?: string;
  /** AGAIN: next local day "YYYY-MM-DD" */
  nextDate?: string;
  /** TATTOO: like the consultation outcome */
  sessionPlan?: OutcomeInput["sessionPlan"];
  furtherScheduled?: boolean;
  sessions?: OutcomeInput["sessions"];
}

/**
 * Enters the result of an open follow-up. TATTOO records the tattoo sessions like the
 * consultation outcome, NO_TATTOO closes the consultation without tattoo, AGAIN moves the
 * follow-up to a later day (with a new reminder). Every result is kept as FollowUpContact.
 */
export async function recordFollowUpResult(
  prisma: PrismaClient,
  input: {
    consultationId: string;
    userId: string;
    result: FollowUpResultInput;
    now?: Date;
    timeZone?: string;
  },
) {
  const now = input.now ?? new Date();
  const tz = input.timeZone ?? DEFAULT_TIME_ZONE;
  const r = input.result;
  const c = await prisma.consultation.findUnique({ where: { id: input.consultationId } });
  if (!c?.followUpAt || c.followUpDoneAt)
    throw new OutcomeError("Für diese Beratung ist kein Follow-up offen.");
  if (r.reached === null) throw new OutcomeError("Bitte angeben, ob du den Kunden erreicht hast.");
  if (!r.result || !["TATTOO", "NO_TATTOO", "AGAIN"].includes(r.result))
    throw new OutcomeError("Bitte angeben, was das Follow-up ergeben hat.");
  if (r.result === "TATTOO" && !r.reached)
    throw new OutcomeError("Ein Tattoo-Termin geht nur, wenn du den Kunden erreicht hast.");
  const note = r.note?.trim().slice(0, 2000) || null;
  let nextAt: Date | null = null;
  if (r.result === "AGAIN") {
    const day = r.nextDate?.trim() ?? "";
    if (!isLocalDate(day)) throw new OutcomeError("Bitte den Tag fürs nächste Nachfassen angeben.");
    if (day <= localDateOf(now, tz))
      throw new OutcomeError("Das nächste Nachfassen muss in der Zukunft liegen (ab morgen).");
    nextAt = zonedTimeToUtc(day, FOLLOW_UP_MINUTE, tz);
  }

  if (r.result === "TATTOO") {
    // Same rules and sessions as the consultation outcome; the consultation note stays
    await recordOutcome(prisma, {
      consultationId: c.id,
      userId: input.userId,
      now,
      timeZone: tz,
      outcome: {
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: r.sessionPlan,
        furtherScheduled: r.furtherScheduled,
        sessions: r.sessions,
        note: c.outcomeNote ?? undefined,
      },
    });
  }

  await prisma.$transaction([
    prisma.followUpContact.create({
      data: {
        consultationId: c.id,
        dueAt: c.followUpAt,
        reached: r.reached,
        result: r.result,
        note,
        nextAt,
        recordedById: input.userId,
        recordedAt: now,
      },
    }),
    prisma.consultation.update({
      where: { id: c.id },
      data:
        r.result === "AGAIN"
          ? { followUpAt: nextAt, followUpDoneAt: null, followUpNotifiedAt: null }
          : {
              followUpDoneAt: now,
              // A tattoo agreed meanwhile (outcome corrected) is not undone here
              ...(r.result === "NO_TATTOO" && c.tattooBooked !== true
                ? { tattooBooked: false }
                : {}),
            },
    }),
  ]);
  await syncLeadStatusFromConsultations(prisma, c.leadId, now);
}

/** Worker: push "Heute nachfassen" to the tattooer once, when the follow-up is due. */
export async function notifyDueFollowUps(
  prisma: Pick<PrismaClient, "consultation" | "pushSubscription">,
  push: PushSender,
  now = new Date(),
) {
  const due = await prisma.consultation.findMany({
    where: {
      followUpAt: { lte: now },
      followUpDoneAt: null,
      followUpNotifiedAt: null,
      lead: { isTest: false },
    },
    take: 50,
    select: {
      id: true,
      outcomeNote: true,
      lead: { select: { id: true, name: true } },
      tattooer: { select: { userId: true } },
    },
  });
  for (const c of due) {
    await pushToUsers(prisma, push, [c.tattooer.userId], {
      title: `Heute nachfassen: ${c.lead.name}`,
      body:
        c.outcomeNote?.slice(0, 140) || "Kunde wollte sich noch überlegen – bitte kontaktieren.",
      url: `/leads/${c.lead.id}`,
      tag: `follow-up-${c.id}`,
    });
    await prisma.consultation.update({
      where: { id: c.id },
      data: { followUpNotifiedAt: now },
    });
  }
  return due.length;
}
