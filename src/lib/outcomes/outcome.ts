/**
 * Consultation outcome entered by the tattooer: held / no-show / cancelled,
 * tattoo booked (yes / no / still open), one or several sessions with date and amount.
 */
import type { LeadStatus, PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_TIME_ZONE, isLocalDate, zonedTimeToUtc } from "../time";
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
  sessions?: Array<{ date: string; amount?: string }>;
  note?: string;
}

export interface ValidOutcome {
  outcome: OutcomeKind;
  tattoo: TattooDecision | null;
  sessionPlan: SessionPlanValue | null;
  furtherScheduled: boolean | null;
  sessions: Array<{ date: string; amountCents: number | null }>;
  note: string | null;
}

export class OutcomeError extends Error {}

/** Checks the combination of answers; returns normalised values or throws OutcomeError (German message). */
export function validateOutcome(input: OutcomeInput): ValidOutcome {
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
    };
  }
  if (!input.tattoo || !["YES", "NO", "OPEN"].includes(input.tattoo)) {
    throw new OutcomeError("Bitte angeben, ob ein Tattoo-Termin vereinbart wurde.");
  }
  if (input.tattoo !== "YES") {
    return {
      outcome: "HELD",
      tattoo: input.tattoo,
      sessionPlan: null,
      furtherScheduled: null,
      sessions: [],
      note,
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
    .filter((s) => s.date?.trim() || s.amount?.trim())
    .map((s, i) => {
      if (!isLocalDate(s.date?.trim()))
        throw new OutcomeError(`Termin ${i + 1}: bitte ein gültiges Datum angeben.`);
      const cents = parseEuroToCents(s.amount);
      if (cents === "invalid")
        throw new OutcomeError(`Termin ${i + 1}: Betrag ist ungültig (z. B. 450 oder 1.250,50).`);
      return { date: s.date.trim(), amountCents: cents };
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
  const v = validateOutcome(input.outcome);
  const c = await prisma.consultation.findUnique({ where: { id: input.consultationId } });
  if (!c) throw new OutcomeError("Termin nicht gefunden.");
  if (c.startsAt > now) {
    throw new OutcomeError(
      "Das Ergebnis kann erst ab Beginn der Beratung eingetragen werden. Zum Absagen „Absagen“ nutzen.",
    );
  }

  await prisma.$transaction([
    prisma.consultation.update({
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
      },
    }),
    prisma.tattooBooking.deleteMany({ where: { consultationId: c.id } }),
    prisma.tattooBooking.createMany({
      data: v.sessions.map((s, i) => ({
        consultationId: c.id,
        sessionNumber: i + 1,
        date: sessionDate(s.date, input.timeZone),
        amountCents: s.amountCents,
      })),
    }),
  ]);
  await syncLeadStatusFromConsultations(prisma, c.leadId, now);
  return prisma.consultation.findUniqueOrThrow({
    where: { id: c.id },
    include: { tattooBookings: true },
  });
}

/** Adds a further session later. A single-session tattoo becomes a multi-session one. */
export async function addSession(
  prisma: PrismaClient,
  input: { consultationId: string; date: string; amount?: string; timeZone?: string },
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
  const next = Math.max(0, ...c.tattooBookings.map((b) => b.sessionNumber)) + 1;
  await prisma.$transaction([
    prisma.tattooBooking.create({
      data: {
        consultationId: c.id,
        sessionNumber: next,
        date: sessionDate(input.date, input.timeZone),
        amountCents: cents,
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
  input: { sessionId: string; date: string; amount?: string; timeZone?: string },
) {
  if (!isLocalDate(input.date)) throw new OutcomeError("Bitte ein gültiges Datum angeben.");
  const cents = parseEuroToCents(input.amount);
  if (cents === "invalid") throw new OutcomeError("Betrag ist ungültig (z. B. 450 oder 1.250,50).");
  await prisma.tattooBooking.update({
    where: { id: input.sessionId },
    data: { date: sessionDate(input.date, input.timeZone), amountCents: cents },
  });
}

export async function setSessionCancelled(
  prisma: PrismaClient,
  sessionId: string,
  cancelled: boolean,
) {
  await prisma.tattooBooking.update({ where: { id: sessionId }, data: { cancelled } });
}
