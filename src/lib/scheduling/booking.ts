/**
 * Booking service: available slots across tattooers, fair assignment and
 * double-booking-safe booking (DB first, then calendar, rollback on failure).
 */
import type { ConsultationMode, PrismaClient } from "@/generated/prisma/client";
import type { CalendarClient, CalendarConnection } from "../google/calendar";
import { DEFAULT_TIME_ZONE } from "../time";
import { buildConsultationEvent } from "./event-content";
import { chooseTattooer, type FairnessMember } from "./fairness";
import {
  computeFreeSlots,
  isSlotFree,
  poolSlots,
  type Interval,
  type PooledSlot,
  type SlotInput,
} from "./slots";

export const SCHEDULING_DEFAULTS = {
  /** Slot start grid inside availability windows. */
  stepMinutes: 15,
  /** Earliest bookable start from now. */
  minNoticeMinutes: 120,
  /** How far ahead slots are offered. */
  horizonDays: 28,
};

/** Arbitrary constant key for the booking advisory lock. */
const BOOKING_LOCK_KEY = 74_201_001;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export interface SchedulingDeps {
  prisma: PrismaClient;
  calendar: CalendarClient;
  now?: () => Date;
  random?: () => number;
  timeZone?: string;
  appUrl?: string;
}

export type BookingErrorCode =
  | "LEAD_NOT_FOUND"
  | "ALREADY_BOOKED"
  | "NO_TATTOOER_FREE"
  | "SLOT_TAKEN"
  | "CALENDAR_FAILED"
  | "NOT_FOUND"
  | "INVALID_STATE";

export class BookingError extends Error {
  constructor(
    readonly code: BookingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

const tattooerInclude = {
  user: { select: { name: true, active: true } },
  availabilityRules: true,
  availabilityExceptions: true,
} as const;

type BookableTattooer = Awaited<ReturnType<typeof loadBookableTattooers>>[number];

/** Active tattooers with a connected calendar (required to know their busy times). */
async function loadBookableTattooers(prisma: PrismaClient, ids?: string[]) {
  return prisma.tattooerProfile.findMany({
    where: {
      user: { active: true },
      googleConnectedAt: { not: null },
      ...(ids ? { id: { in: ids } } : {}),
    },
    include: tattooerInclude,
    orderBy: { createdAt: "asc" },
  });
}

export function connectionOf(t: {
  id: string;
  googleRefreshTokenEnc: string | null;
  consultationCalendarId: string | null;
}): CalendarConnection {
  return {
    tattooerId: t.id,
    refreshTokenEnc: t.googleRefreshTokenEnc,
    calendarId: t.consultationCalendarId,
  };
}

function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function nowOf(deps: SchedulingDeps) {
  return (deps.now ?? (() => new Date()))();
}

/**
 * Builds the slot input per tattooer: rules, exceptions, booked consultations
 * and Google busy times. Tattooers whose calendar cannot be read are skipped
 * (we cannot know whether they are free).
 */
async function buildSlotInputs(
  deps: SchedulingDeps,
  tattooers: BookableTattooer[],
  from: Date,
  to: Date,
  opts: { excludeConsultationId?: string } = {},
): Promise<Map<string, SlotInput>> {
  const ids = tattooers.map((t) => t.id);
  const margin = DAY;
  const booked = await deps.prisma.consultation.findMany({
    where: {
      tattooerId: { in: ids },
      status: { not: "CANCELLED" },
      startsAt: { lt: new Date(to.getTime() + margin) },
      endsAt: { gt: new Date(from.getTime() - margin) },
      ...(opts.excludeConsultationId ? { id: { not: opts.excludeConsultationId } } : {}),
    },
    select: { tattooerId: true, startsAt: true, endsAt: true },
  });

  const google = await Promise.all(
    tattooers.map(async (t) => {
      try {
        return [t.id, await deps.calendar.getBusy(connectionOf(t), from, to)] as const;
      } catch (err) {
        console.error(
          `[booking] free/busy failed for tattooer ${t.id}:`,
          err instanceof Error ? err.message : err,
        );
        return [t.id, null] as const;
      }
    }),
  );
  const googleBusy = new Map(google);

  const inputs = new Map<string, SlotInput>();
  for (const t of tattooers) {
    const gBusy = googleBusy.get(t.id);
    if (!gBusy) continue;
    const dbBusy: Interval[] = booked
      .filter((c) => c.tattooerId === t.id)
      .map((c) => ({ start: c.startsAt, end: c.endsAt }));
    inputs.set(t.id, {
      rules: t.availabilityRules.map((r) => ({
        weekday: r.weekday,
        startMinute: r.startMinute,
        endMinute: r.endMinute,
        validFrom: dateOnly(r.validFrom),
        validUntil: dateOnly(r.validUntil),
      })),
      exceptions: t.availabilityExceptions.map((e) => ({
        kind: e.kind,
        start: e.startsAt,
        end: e.endsAt,
      })),
      busy: [...dbBusy, ...gBusy],
      durationMinutes: t.consultationMinutes,
      bufferMinutes: t.bufferMinutes,
      timeZone: deps.timeZone ?? DEFAULT_TIME_ZONE,
    });
  }
  return inputs;
}

/** Free start times across all bookable tattooers (or a subset). */
export async function getAvailableSlots(
  deps: SchedulingDeps,
  range: { from: Date; to: Date; tattooerIds?: string[] },
): Promise<PooledSlot[]> {
  const tattooers = await loadBookableTattooers(deps.prisma, range.tattooerIds);
  const inputs = await buildSlotInputs(deps, tattooers, range.from, range.to);
  const now = nowOf(deps);
  const perTattooer = new Map<string, Interval[]>();
  for (const [id, input] of inputs) {
    perTattooer.set(
      id,
      computeFreeSlots(input, {
        from: range.from,
        to: range.to,
        now,
        minNoticeMinutes: SCHEDULING_DEFAULTS.minNoticeMinutes,
        stepMinutes: SCHEDULING_DEFAULTS.stepMinutes,
      }),
    );
  }
  return poolSlots(perTattooer);
}

/** Fairness members (all active tattooers) with counts in the evaluation window. */
export async function loadFairnessMembers(
  prisma: Pick<PrismaClient, "tattooerProfile" | "consultation" | "fairnessConfig">,
  now: Date,
): Promise<{ members: FairnessMember[]; windowDays: number; since: Date }> {
  const config = await prisma.fairnessConfig.findUnique({ where: { id: 1 } });
  const windowDays = config?.windowDays ?? 28;
  const since = new Date(now.getTime() - windowDays * DAY);
  const [profiles, counts] = await Promise.all([
    prisma.tattooerProfile.findMany({
      where: { user: { active: true } },
      select: { id: true, fairnessShare: { select: { weight: true } } },
    }),
    prisma.consultation.groupBy({
      by: ["tattooerId"],
      where: { status: { not: "CANCELLED" }, startsAt: { gte: since } },
      _count: { _all: true },
      _max: { startsAt: true },
    }),
  ]);
  const byId = new Map(counts.map((c) => [c.tattooerId, c]));
  return {
    windowDays,
    since,
    members: profiles.map((p) => ({
      tattooerId: p.id,
      weight: p.fairnessShare?.weight ?? 1,
      count: byId.get(p.id)?._count._all ?? 0,
      lastConsultationAt: byId.get(p.id)?._max.startsAt ?? null,
    })),
  };
}

function isOverlapViolation(err: unknown): boolean {
  const text = String((err as { message?: string })?.message ?? "") + JSON.stringify(err ?? {});
  return text.includes("Consultation_no_overlap") || text.includes("23P01");
}

async function eventFor(deps: SchedulingDeps, consultationId: string) {
  const c = await deps.prisma.consultation.findUniqueOrThrow({
    where: { id: consultationId },
    include: { lead: true },
  });
  const settings = await deps.prisma.appSettings.findUnique({ where: { id: 1 } });
  return buildConsultationEvent({
    lead: c.lead,
    mode: c.mode,
    start: c.startsAt,
    end: c.endsAt,
    studioAddress: settings?.studioAddress ?? null,
    appUrl: deps.appUrl ?? process.env.APP_URL ?? "http://localhost:3000",
    timeZone: deps.timeZone ?? DEFAULT_TIME_ZONE,
  });
}

/** Writes the calendar event for a consultation; returns calendar and event id. */
async function writeEvent(deps: SchedulingDeps, consultationId: string, tattooerId: string) {
  const profile = await deps.prisma.tattooerProfile.findUniqueOrThrow({
    where: { id: tattooerId },
  });
  const conn = connectionOf(profile);
  const calendarId = await deps.calendar.ensureConsultationCalendar(conn);
  if (calendarId !== profile.consultationCalendarId) {
    await deps.prisma.tattooerProfile.update({
      where: { id: tattooerId },
      data: { consultationCalendarId: calendarId },
    });
  }
  const eventId = await deps.calendar.createEvent(
    conn,
    calendarId,
    await eventFor(deps, consultationId),
  );
  return { calendarId, eventId };
}

/** Best-effort removal of a calendar event (logged on failure). */
async function removeEvent(
  deps: SchedulingDeps,
  tattooerId: string,
  calendarId: string | null,
  eventId: string | null,
): Promise<boolean> {
  if (!calendarId || !eventId) return true;
  try {
    const profile = await deps.prisma.tattooerProfile.findUniqueOrThrow({
      where: { id: tattooerId },
    });
    await deps.calendar.deleteEvent(connectionOf(profile), calendarId, eventId);
    return true;
  } catch (err) {
    console.error(
      `[booking] could not delete calendar event ${eventId}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

export interface BookInput {
  leadId: string;
  startsAt: Date;
  mode?: ConsultationMode;
  /** Admin override: book with this tattooer instead of the fair choice. */
  tattooerId?: string;
  createdById?: string | null;
}

/**
 * Books a consultation:
 * 1. finds tattooers free at the requested time (rules, exceptions, Google, DB),
 * 2. inside a DB transaction holding an advisory lock: re-checks DB overlaps,
 *    chooses fairly and inserts (an exclusion constraint guards as last line),
 * 3. writes the calendar event; on failure the booking is rolled back.
 */
export async function bookConsultation(deps: SchedulingDeps, input: BookInput) {
  const { prisma } = deps;
  const now = nowOf(deps);

  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new BookingError("LEAD_NOT_FOUND", "Lead nicht gefunden.");
  const upcoming = await prisma.consultation.findFirst({
    where: { leadId: lead.id, status: "SCHEDULED", endsAt: { gt: now } },
  });
  if (upcoming) {
    throw new BookingError(
      "ALREADY_BOOKED",
      "Für diesen Lead ist bereits ein Beratungstermin gebucht.",
    );
  }

  const tattooers = await loadBookableTattooers(
    prisma,
    input.tattooerId ? [input.tattooerId] : undefined,
  );
  const day = {
    from: new Date(input.startsAt.getTime() - DAY),
    to: new Date(input.startsAt.getTime() + DAY),
  };
  const inputs = await buildSlotInputs(deps, tattooers, day.from, day.to);
  const free = [...inputs.entries()]
    .filter(([, slotInput]) =>
      isSlotFree(slotInput, input.startsAt, {
        now,
        minNoticeMinutes: SCHEDULING_DEFAULTS.minNoticeMinutes,
      }),
    )
    .map(([id]) => id);
  if (!free.length) {
    throw new BookingError("NO_TATTOOER_FREE", "Zu diesem Zeitpunkt ist niemand verfügbar.");
  }

  const durations = new Map(tattooers.map((t) => [t.id, t]));

  let booked;
  try {
    booked = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`;

        // Re-check DB bookings under the lock (another booking may have just happened).
        const stillFree: string[] = [];
        for (const id of free) {
          const t = durations.get(id)!;
          const buffer = t.bufferMinutes * MIN;
          const end = new Date(input.startsAt.getTime() + t.consultationMinutes * MIN);
          const clash = await tx.consultation.count({
            where: {
              tattooerId: id,
              status: { not: "CANCELLED" },
              startsAt: { lt: new Date(end.getTime() + buffer) },
              endsAt: { gt: new Date(input.startsAt.getTime() - buffer) },
            },
          });
          if (!clash) stillFree.push(id);
        }
        if (!stillFree.length)
          throw new BookingError("SLOT_TAKEN", "Der Termin wurde gerade vergeben.");

        let tattooerId: string;
        if (input.tattooerId) {
          tattooerId = input.tattooerId;
        } else {
          const { members } = await loadFairnessMembers(tx, now);
          const chosen = chooseTattooer(members, stillFree, deps.random);
          tattooerId = chosen?.tattooerId ?? stillFree[0];
        }
        const t = durations.get(tattooerId)!;

        const consultation = await tx.consultation.create({
          data: {
            leadId: lead.id,
            tattooerId,
            startsAt: input.startsAt,
            endsAt: new Date(input.startsAt.getTime() + t.consultationMinutes * MIN),
            mode: input.mode ?? "ON_SITE",
            createdById: input.createdById ?? null,
          },
        });
        await tx.lead.update({
          where: { id: lead.id },
          data: { status: "CONSULTATION_BOOKED", statusChangedAt: now },
        });
        return consultation;
      },
      { timeout: 20_000, maxWait: 20_000 },
    );
  } catch (err) {
    if (err instanceof BookingError) throw err;
    if (isOverlapViolation(err))
      throw new BookingError("SLOT_TAKEN", "Der Termin wurde gerade vergeben.");
    throw err;
  }

  try {
    const { calendarId, eventId } = await writeEvent(deps, booked.id, booked.tattooerId);
    return await prisma.consultation.update({
      where: { id: booked.id },
      data: { calendarId, calendarEventId: eventId },
      include: { tattooer: { include: { user: { select: { name: true } } } } },
    });
  } catch (err) {
    console.error(
      `[booking] calendar event failed, rolling back ${booked.id}:`,
      err instanceof Error ? err.message : err,
    );
    await prisma.$transaction([
      prisma.consultation.delete({ where: { id: booked.id } }),
      prisma.lead.updateMany({
        where: { id: lead.id, status: "CONSULTATION_BOOKED" },
        data: { status: lead.status, statusChangedAt: lead.statusChangedAt },
      }),
    ]);
    throw new BookingError(
      "CALENDAR_FAILED",
      "Der Kalendereintrag konnte nicht erstellt werden. Der Termin wurde nicht gebucht.",
    );
  }
}

/** Cancels a consultation and removes the calendar event (best effort). */
export async function cancelConsultation(deps: SchedulingDeps, consultationId: string) {
  const { prisma } = deps;
  const c = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!c) throw new BookingError("NOT_FOUND", "Termin nicht gefunden.");
  if (c.status !== "SCHEDULED")
    throw new BookingError("INVALID_STATE", "Nur geplante Termine können abgesagt werden.");

  const now = nowOf(deps);
  await prisma.$transaction(async (tx) => {
    await tx.consultation.update({
      where: { id: c.id },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    const otherScheduled = await tx.consultation.count({
      where: { leadId: c.leadId, status: "SCHEDULED", id: { not: c.id } },
    });
    if (!otherScheduled) {
      await tx.lead.updateMany({
        where: { id: c.leadId, status: "CONSULTATION_BOOKED" },
        data: { status: "CANCELLED", statusChangedAt: now },
      });
    }
  });
  const removed = await removeEvent(deps, c.tattooerId, c.calendarId, c.calendarEventId);
  return { calendarEventRemoved: removed };
}

/** Admin: moves a consultation to another tattooer (same time). */
export async function reassignConsultation(
  deps: SchedulingDeps,
  consultationId: string,
  newTattooerId: string,
) {
  const { prisma } = deps;
  const now = nowOf(deps);
  const c = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!c) throw new BookingError("NOT_FOUND", "Termin nicht gefunden.");
  if (c.status !== "SCHEDULED")
    throw new BookingError("INVALID_STATE", "Nur geplante Termine können umverteilt werden.");
  if (c.startsAt <= now) {
    throw new BookingError("INVALID_STATE", "Vergangene Termine können nicht umverteilt werden.");
  }
  if (c.tattooerId === newTattooerId) return c;

  const [target] = await loadBookableTattooers(prisma, [newTattooerId]);
  if (!target)
    throw new BookingError(
      "NO_TATTOOER_FREE",
      "Diese Person ist nicht buchbar (inaktiv oder ohne Kalender).",
    );
  const inputs = await buildSlotInputs(
    deps,
    [target],
    new Date(c.startsAt.getTime() - DAY),
    new Date(c.startsAt.getTime() + DAY),
  );
  const slotInput = inputs.get(target.id);
  // Reassigning an existing booking ignores the minimum notice.
  if (!slotInput || !isSlotFree(slotInput, c.startsAt, { now: new Date(0), minNoticeMinutes: 0 })) {
    throw new BookingError(
      "NO_TATTOOER_FREE",
      `${target.user.name} ist zu diesem Zeitpunkt nicht frei.`,
    );
  }

  const previous = {
    tattooerId: c.tattooerId,
    endsAt: c.endsAt,
    calendarId: c.calendarId,
    calendarEventId: c.calendarEventId,
  };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`;
      await tx.consultation.update({
        where: { id: c.id },
        data: {
          tattooerId: target.id,
          endsAt: new Date(c.startsAt.getTime() + target.consultationMinutes * MIN),
          calendarId: null,
          calendarEventId: null,
        },
      });
    });
  } catch (err) {
    if (isOverlapViolation(err))
      throw new BookingError("SLOT_TAKEN", "Der Termin kollidiert mit einem anderen Termin.");
    throw err;
  }

  try {
    const { calendarId, eventId } = await writeEvent(deps, c.id, target.id);
    await prisma.consultation.update({
      where: { id: c.id },
      data: { calendarId, calendarEventId: eventId },
    });
  } catch (err) {
    console.error(
      `[booking] reassign calendar write failed for ${c.id}:`,
      err instanceof Error ? err.message : err,
    );
    await prisma.consultation.update({ where: { id: c.id }, data: previous });
    throw new BookingError(
      "CALENDAR_FAILED",
      "Der Kalendereintrag konnte nicht erstellt werden. Nichts wurde geändert.",
    );
  }
  await removeEvent(deps, previous.tattooerId, previous.calendarId, previous.calendarEventId);
  return prisma.consultation.findUniqueOrThrow({ where: { id: c.id } });
}

/** Changes on-site/phone and updates the calendar event (best effort). */
export async function updateConsultationMode(
  deps: SchedulingDeps,
  consultationId: string,
  mode: ConsultationMode,
) {
  const c = await deps.prisma.consultation.update({
    where: { id: consultationId },
    data: { mode },
  });
  return { calendarUpdated: await refreshConsultationEvent(deps, c.id) };
}

/** Re-writes the event content (e.g. after the tattoo summary changed). */
export async function refreshConsultationEvent(
  deps: SchedulingDeps,
  consultationId: string,
): Promise<boolean> {
  const c = await deps.prisma.consultation.findUniqueOrThrow({
    where: { id: consultationId },
    include: { tattooer: true },
  });
  if (!c.calendarId || !c.calendarEventId || c.status === "CANCELLED") return true;
  try {
    await deps.calendar.updateEvent(
      connectionOf(c.tattooer),
      c.calendarId,
      c.calendarEventId,
      await eventFor(deps, c.id),
    );
    return true;
  } catch (err) {
    console.error(
      `[booking] event update failed for ${c.id}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
