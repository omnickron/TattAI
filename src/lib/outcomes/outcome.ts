/**
 * Consultation outcome entered by the tattooer: held / no-show / cancelled,
 * tattoo booked (yes / no / still open), one or several sessions with date and amount.
 */
import type { LeadStatus, PrismaClient } from "@/generated/prisma/client";
import {
  DEFAULT_TIME_ZONE,
  isLocalDate,
  localDateOf,
  isQuarterHour,
  parseTimeOfDay,
  zonedTimeToUtc,
} from "../time";
import { queueSessionEventDeletions } from "../scheduling/session-calendar";
import { parseEuroToCents } from "./money";

export type OutcomeKind = "HELD" | "NO_SHOW" | "CANCELLED";
export type TattooDecision = "YES" | "NO" | "OPEN";
export type SessionPlanValue = "SINGLE" | "MULTIPLE";

export interface OutcomeInput {
  outcome: OutcomeKind;
  tattoo?: TattooDecision;
  sessionPlan?: SessionPlanValue;
  /** Only for MULTIPLE: are further sessions (beyond the first) already scheduled? */
  furtherScheduled?: boolean;
  /** start/end: optional local times "HH:MM" */
  sessions?: Array<{ date: string; amount?: string; start?: string; end?: string }>;
  note?: string;
  /** Tattoo still open ("Follow-up"): local date "YYYY-MM-DD" to contact the customer again */
  followUpDate?: string;
}

/** Time of day the follow-up reminder is due (local). */
export const FOLLOW_UP_MINUTE = 9 * 60;

export interface ValidOutcome {
  outcome: OutcomeKind;
  tattoo: TattooDecision | null;
  sessionPlan: SessionPlanValue | null;
  furtherScheduled: boolean | null;
  sessions: Array<{
    date: string;
    amountCents: number | null;
    start: string | null;
    end: string | null;
  }>;
  note: string | null;
  followUpDate: string | null;
}

export class OutcomeError extends Error {}

/** Checks the combination of answers; returns normalised values or throws OutcomeError (German message). */
export function validateOutcome(input: OutcomeInput, today?: string): ValidOutcome {
  const note = input.note?.trim().slice(0, 2000) || null;
  if (!["HELD", "NO_SHOW", "CANCELLED"].includes(input.outcome))
    throw new OutcomeError("Bitte ein Ergebnis wählen.");
  if (input.outcome !== "HELD") {
    return {
      outcome: input.outcome,
      tattoo: null,
      sessionPlan: null,
      furtherScheduled: null,
      sessions: [],
      note,
      followUpDate: null,
    };
  }
  if (!input.tattoo || !["YES", "NO", "OPEN"].includes(input.tattoo)) {
    throw new OutcomeError("Bitte angeben, ob ein Tattoo-Termin vereinbart wurde.");
  }
  if (input.tattoo !== "YES") {
    let followUpDate: string | null = null;
    if (input.tattoo === "OPEN") {
      followUpDate = input.followUpDate?.trim() ?? "";
      if (!isLocalDate(followUpDate))
        throw new OutcomeError("Bitte angeben, wann der Kunde wieder kontaktiert werden soll.");
      if (today && followUpDate <= today)
        throw new OutcomeError("Das Follow-up muss in der Zukunft liegen (ab morgen).");
    }
    return {
      outcome: "HELD",
      tattoo: input.tattoo,
      sessionPlan: null,
      furtherScheduled: null,
      sessions: [],
      note,
      followUpDate,
    };
  }
  if (input.sessionPlan !== "SINGLE" && input.sessionPlan !== "MULTIPLE") {
    throw new OutcomeError("Bitte angeben, ob es ein Termin oder mehrere Termine werden.");
  }
  if (input.sessionPlan === "MULTIPLE" && typeof input.furtherScheduled !== "boolean") {
    throw new OutcomeError(
      "Bitte angeben, ob nur der erste Termin oder schon weitere vergeben sind.",
    );
  }

  const sessions = (input.sessions ?? [])
    .filter((s) => s.date?.trim() || s.amount?.trim() || s.start?.trim() || s.end?.trim())
    .map((s, i) => {
      if (!isLocalDate(s.date?.trim()))
        throw new OutcomeError(`Termin ${i + 1}: bitte ein gültiges Datum angeben.`);
      const cents = parseEuroToCents(s.amount);
      if (cents === "invalid")
        throw new OutcomeError(`Termin ${i + 1}: Betrag ist ungültig (z. B. 450 oder 1.250,50).`);
      const time = parseTimes(s.start, s.end, `Termin ${i + 1}: `);
      return { date: s.date.trim(), amountCents: cents, ...time };
    });

  const further = input.sessionPlan === "MULTIPLE" ? Boolean(input.furtherScheduled) : null;
  if (input.sessionPlan === "SINGLE" && sessions.length !== 1) {
    throw new OutcomeError("Bitte genau einen Tattoo-Termin angeben.");
  }
  if (input.sessionPlan === "MULTIPLE" && !further && sessions.length !== 1) {
    throw new OutcomeError(
      "Bitte den ersten Tattoo-Termin angeben – weitere können später ergänzt werden.",
    );
  }
  if (input.sessionPlan === "MULTIPLE" && further && sessions.length < 2) {
    throw new OutcomeError(
      "Bitte mindestens zwei Termine angeben (oder „nur der erste Termin vergeben“ wählen).",
    );
  }
  return {
    outcome: "HELD",
    tattoo: "YES",
    sessionPlan: input.sessionPlan,
    furtherScheduled: further,
    sessions,
    note,
    followUpDate: null,
  };
}

/** Optional session time: both or none, end after start. Throws OutcomeError. */
export function parseTimes(
  start?: string,
  end?: string,
  prefix = "",
): { start: string | null; end: string | null } {
  const s = start?.trim() || "";
  const e = end?.trim() || "";
  if (!s && !e) return { start: null, end: null };
  if (!s || !e)
    throw new OutcomeError(`${prefix}Bitte Beginn und Ende angeben (oder beides leer lassen).`);
  const sm = parseTimeOfDay(s);
  const em = parseTimeOfDay(e);
  if (sm === null || em === null) throw new OutcomeError(`${prefix}Uhrzeit ist ungültig.`);
  if (!isQuarterHour(sm) || !isQuarterHour(em)) {
    throw new OutcomeError(
      `${prefix}Bitte Uhrzeiten im Viertelstunden-Raster wählen (:00, :15, :30, :45).`,
    );
  }
  if (em <= sm) throw new OutcomeError(`${prefix}Das Ende muss nach dem Beginn liegen.`);
  return { start: s, end: e };
}

/** startsAt/endsAt of a session (null when no time was given). */
export function sessionSlot(
  localDate: string,
  start: string | null | undefined,
  end: string | null | undefined,
  timeZone = DEFAULT_TIME_ZONE,
) {
  if (!start || !end) return { startsAt: null, endsAt: null };
  return {
    startsAt: zonedTimeToUtc(localDate, parseTimeOfDay(start)!, timeZone),
    endsAt: zonedTimeToUtc(localDate, parseTimeOfDay(end)!, timeZone),
  };
}

/** Local date ("YYYY-MM-DD") to the stored instant (local midnight). */
export function sessionDate(localDate: string, timeZone = DEFAULT_TIME_ZONE): Date {
  return zonedTimeToUtc(localDate, 0, timeZone);
}

const CONSULTATION_PHASE: LeadStatus[] = [
  "CONSULTATION_BOOKED",
  "CONSULTATION_DONE",
  "TATTOO_BOOKED",
  "NO_TATTOO",
  "NO_SHOW",
  "CANCELLED",
];

/** Lead status derived from all consultations of the lead. */
export async function syncLeadStatusFromConsultations(
  prisma: PrismaClient,
  leadId: string,
  now: Date,
) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!lead || !CONSULTATION_PHASE.includes(lead.status)) return;
  const consultations = await prisma.consultation.findMany({
    where: { leadId },
    orderBy: { startsAt: "desc" },
    select: { status: true, tattooBooked: true, outcomeRecordedAt: true },
  });
  let status: LeadStatus;
  if (consultations.some((c) => c.status === "HELD" && c.tattooBooked === true))
    status = "TATTOO_BOOKED";
  else if (consultations.some((c) => c.status === "SCHEDULED")) status = "CONSULTATION_BOOKED";
  else {
    const latest = consultations[0];
    if (!latest) return;
    status =
      latest.status === "HELD"
        ? latest.tattooBooked === false
          ? "NO_TATTOO"
          : "CONSULTATION_DONE"
        : latest.status === "NO_SHOW"
          ? "NO_SHOW"
          : "CANCELLED";
  }
  if (status !== lead.status) {
    await prisma.lead.update({ where: { id: leadId }, data: { status, statusChangedAt: now } });
  }
}

/** Records (or corrects) the outcome; replaces the tattoo sessions with the given ones. */
export async function recordOutcome(
  prisma: PrismaClient,
  input: {
    consultationId: string;
    userId: string;
    outcome: OutcomeInput;
    now?: Date;
    timeZone?: string;
  },
) {
  const now = input.now ?? new Date();
  const tz = input.timeZone ?? DEFAULT_TIME_ZONE;
  const c = await prisma.consultation.findUnique({ where: { id: input.consultationId } });
  // A follow-up date that is already set may stay as it is (e.g. when correcting the note)
  const keepFollowUp =
    c?.followUpAt && input.outcome.followUpDate === localDateOf(c.followUpAt, tz);
  const v = validateOutcome(input.outcome, keepFollowUp ? undefined : localDateOf(now, tz));
  const followUpAt = v.followUpDate ? zonedTimeToUtc(v.followUpDate, FOLLOW_UP_MINUTE, tz) : null;
  const followUpChanged = followUpAt?.getTime() !== c?.followUpAt?.getTime();
  if (!c) throw new OutcomeError("Termin nicht gefunden.");
  if (c.startsAt > now) {
    throw new OutcomeError(
      "Das Ergebnis kann erst ab Beginn der Beratung eingetragen werden. Zum Absagen „Absagen“ nutzen.",
    );
  }

  await prisma.$transaction(async (tx) => {
    // Existing sessions are replaced: their calendar events must go.
    await queueSessionEventDeletions(tx, { consultationId: c.id });
    await tx.consultation.update({
      where: { id: c.id },
      data: {
        status: v.outcome,
        cancelledAt: v.outcome === "CANCELLED" ? (c.cancelledAt ?? now) : null,
        tattooBooked: v.tattoo === "YES" ? true : v.tattoo === "NO" ? false : null,
        sessionPlan: v.sessionPlan,
        furtherSessionsScheduled: v.furtherScheduled,
        outcomeNote: v.note,
        outcomeRecordedAt: now,
        outcomeRecordedById: input.userId,
        followUpAt,
        ...(followUpChanged ? { followUpDoneAt: null, followUpNotifiedAt: null } : {}),
      },
    });
    await tx.tattooBooking.deleteMany({ where: { consultationId: c.id } });
    await tx.tattooBooking.createMany({
      data: v.sessions.map((s, i) => ({
        consultationId: c.id,
        sessionNumber: i + 1,
        date: sessionDate(s.date, input.timeZone),
        ...sessionSlot(s.date, s.start, s.end, input.timeZone),
        amountCents: s.amountCents,
        calendarSyncPending: true,
      })),
    });
  });
  await syncLeadStatusFromConsultations(prisma, c.leadId, now);
  return prisma.consultation.findUniqueOrThrow({
    where: { id: c.id },
    include: { tattooBookings: true },
  });
}

/** Adds a further session later. A single-session tattoo becomes a multi-session one. */
export async function addSession(
  prisma: PrismaClient,
  input: {
    consultationId: string;
    date: string;
    amount?: string;
    start?: string;
    end?: string;
    timeZone?: string;
  },
) {
  const c = await prisma.consultation.findUnique({
    where: { id: input.consultationId },
    include: { tattooBookings: { select: { sessionNumber: true } } },
  });
  if (!c || c.status !== "HELD" || c.tattooBooked !== true) {
    throw new OutcomeError("Sitzungen gibt es nur bei Beratungen mit vereinbartem Tattoo.");
  }
  if (!isLocalDate(input.date)) throw new OutcomeError("Bitte ein gültiges Datum angeben.");
  const cents = parseEuroToCents(input.amount);
  if (cents === "invalid") throw new OutcomeError("Betrag ist ungültig (z. B. 450 oder 1.250,50).");
  const time = parseTimes(input.start, input.end);
  const next = Math.max(0, ...c.tattooBookings.map((b) => b.sessionNumber)) + 1;
  await prisma.$transaction([
    prisma.tattooBooking.create({
      data: {
        consultationId: c.id,
        sessionNumber: next,
        date: sessionDate(input.date, input.timeZone),
        ...sessionSlot(input.date, time.start, time.end, input.timeZone),
        amountCents: cents,
        calendarSyncPending: true,
      },
    }),
    prisma.consultation.update({
      where: { id: c.id },
      data: {
        sessionPlan: "MULTIPLE",
        furtherSessionsScheduled: next > 1 ? true : c.furtherSessionsScheduled,
      },
    }),
  ]);
}

export async function updateSession(
  prisma: PrismaClient,
  input: {
    sessionId: string;
    date: string;
    amount?: string;
    start?: string;
    end?: string;
    timeZone?: string;
  },
) {
  const time = parseTimes(input.start, input.end);
  if (!isLocalDate(input.date)) throw new OutcomeError("Bitte ein gültiges Datum angeben.");
  const cents = parseEuroToCents(input.amount);
  if (cents === "invalid") throw new OutcomeError("Betrag ist ungültig (z. B. 450 oder 1.250,50).");
  await prisma.tattooBooking.update({
    where: { id: input.sessionId },
    data: {
      date: sessionDate(input.date, input.timeZone),
      ...sessionSlot(input.date, time.start, time.end, input.timeZone),
      amountCents: cents,
      calendarSyncPending: true,
    },
  });
}

export async function setSessionCancelled(
  prisma: PrismaClient,
  sessionId: string,
  cancelled: boolean,
) {
  await prisma.tattooBooking.update({
    where: { id: sessionId },
    data: { cancelled, calendarSyncPending: true },
  });
}
