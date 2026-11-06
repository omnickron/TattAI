/**
 * Booking service: available slots across tattooers, fair assignment and
 * double-booking-safe booking (DB first, then calendar, rollback on failure).
 */
import type { ConsultationMode, PrismaClient } from "@/generated/prisma/client";
import {
  APP_CALENDAR_NAME,
  CalendarError,
  type CalendarClient,
  type CalendarConnection,
  type CalendarEventInput,
  type CalendarProviderName,
} from "../google/calendar";
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
      ...CALENDAR_CONNECTED_WHERE,
      ...(ids ? { id: { in: ids } } : {}),
    },
    include: tattooerInclude,
    orderBy: { createdAt: "asc" },
  });
}

/** Calendar fields of a tattooer profile (Google or TeamUp). */
export type CalendarProfileFields = {
  id: string;
  googleRefreshTokenEnc: string | null;
  googleConnectedAt: Date | null;
  consultationCalendarId: string | null;
  calendarProvider: CalendarProviderName;
  teamupArtist: string | null;
  teamupSubcalendarId?: string | null;
  teamupConnectedAt: Date | null;
};

/** Prisma filter: tattooers whose chosen calendar is connected. */
export const CALENDAR_CONNECTED_WHERE = {
  OR: [
    { calendarProvider: "GOOGLE" as const, googleConnectedAt: { not: null } },
    { calendarProvider: "TEAMUP" as const, teamupConnectedAt: { not: null } },
  ],
};

/** Is the tattooer's chosen calendar (Google or TeamUp) connected? */
export function isCalendarConnected(
  t: Pick<CalendarProfileFields, "calendarProvider" | "googleConnectedAt" | "teamupConnectedAt">,
): boolean {
  return t.calendarProvider === "TEAMUP"
    ? Boolean(t.teamupConnectedAt)
    : Boolean(t.googleConnectedAt);
}

/** "Google-Kalender" or "TeamUp-Kalender" for messages. */
export function calendarLabel(t: Pick<CalendarProfileFields, "calendarProvider">): string {
  return t.calendarProvider === "TEAMUP" ? "TeamUp-Kalender" : "Google-Kalender";
}

export function connectionOf(t: CalendarProfileFields): CalendarConnection {
  return {
    tattooerId: t.id,
    provider: t.calendarProvider,
    teamupArtist: t.teamupArtist,
    teamupSubcalendarId: t.teamupSubcalendarId ?? null,
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
 * and calendar busy times (Google or TeamUp). Tattooers whose calendar cannot be read are skipped
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
      walkIn: false,
      startsAt: { lt: new Date(to.getTime() + margin) },
      endsAt: { gt: new Date(from.getTime() - margin) },
      ...(opts.excludeConsultationId ? { id: { not: opts.excludeConsultationId } } : {}),
    },
    select: { tattooerId: true, startsAt: true, endsAt: true },
  });
  // Tattoo sessions with a time slot: nobody consults while tattooing.
  const tattooSessions = await deps.prisma.tattooBooking.findMany({
    where: {
      cancelled: false,
      consultation: { tattooerId: { in: ids }, status: "HELD" },
      startsAt: { not: null, lt: new Date(to.getTime() + margin) },
      endsAt: { gt: new Date(from.getTime() - margin) },
    },
    select: { startsAt: true, endsAt: true, consultation: { select: { tattooerId: true } } },
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
    const dbBusy: Interval[] = [
      ...booked
        .filter((c) => c.tattooerId === t.id)
        .map((c) => ({ start: c.startsAt, end: c.endsAt })),
      ...tattooSessions
        .filter((x) => x.consultation.tattooerId === t.id)
        .map((x) => ({ start: x.startsAt!, end: x.endsAt! })),
    ];
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
      where: { status: { not: "CANCELLED" }, walkIn: false, startsAt: { gte: since } },
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
    include: {
      lead: true,
      _count: { select: { attachments: { where: { status: { in: ["STORED", "PENDING"] } } } } },
    },
  });
  const settings = await deps.prisma.appSettings.findUnique({ where: { id: 1 } });
  return buildConsultationEvent({
    imageCount: c._count.attachments,
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
type CalendarProfile = CalendarProfileFields;

/**
 * Creates an event in the tattooer's app calendar ("Studio-Termine"), creating
 * the calendar if needed. If the calendar was deleted in Google, it is recreated once.
 */
export async function createInAppCalendar(
  deps: SchedulingDeps,
  profile: CalendarProfile,
  event: CalendarEventInput,
): Promise<{ calendarId: string; eventId: string }> {
  let current = profile.consultationCalendarId;
  for (let attempt = 0; attempt < 2; attempt++) {
    const conn = connectionOf({ ...profile, consultationCalendarId: current });
    const calendarId = await deps.calendar.ensureConsultationCalendar(conn);
    if (calendarId !== current) {
      await deps.prisma.tattooerProfile.update({
        where: { id: profile.id },
        data: { consultationCalendarId: calendarId, consultationCalendarName: APP_CALENDAR_NAME },
      });
    }
    try {
      return { calendarId, eventId: await deps.calendar.createEvent(conn, calendarId, event) };
    } catch (err) {
      const gone = err instanceof CalendarError && (err.status === 404 || err.status === 410);
      if (!gone || attempt > 0) throw err;
      console.warn(
        `[calendar] app calendar of ${profile.id} no longer exists – creating a new one`,
      );
      current = null;
    }
  }
  throw new Error("unreachable");
}

/** Writes the calendar event for a consultation; returns calendar and event id. */
async function writeEvent(deps: SchedulingDeps, consultationId: string, tattooerId: string) {
  const profile = await deps.prisma.tattooerProfile.findUniqueOrThrow({
    where: { id: tattooerId },
  });
  return createInAppCalendar(deps, profile, await eventFor(deps, consultationId));
}

/**
 * Keeps the app calendar name in line with APP_CALENDAR_NAME (renames existing
 * calendars once, e.g. "Beratungen" → "Studio-Termine"). Called by the worker.
 */
export async function ensureCalendarNames(deps: SchedulingDeps) {
  if (!deps.calendar.renameCalendar) return { renamed: 0 };
  const profiles = await deps.prisma.tattooerProfile.findMany({
    where: {
      calendarProvider: "GOOGLE",
      googleConnectedAt: { not: null },
      consultationCalendarId: { not: null },
      OR: [
        { consultationCalendarName: null },
        { consultationCalendarName: { not: APP_CALENDAR_NAME } },
      ],
    },
  });
  let renamed = 0;
  for (const p of profiles) {
    try {
      const res = await deps.calendar.renameCalendar(
        connectionOf(p),
        p.consultationCalendarId!,
        APP_CALENDAR_NAME,
      );
      await deps.prisma.tattooerProfile.update({
        where: { id: p.id },
        // A calendar deleted in Google is recreated with the new name on the next write.
        data:
          res === "missing"
            ? { consultationCalendarId: null, consultationCalendarName: null }
            : { consultationCalendarName: APP_CALENDAR_NAME },
      });
      if (res === "ok") renamed++;
    } catch (err) {
      console.error(
        `[calendar] renaming calendar of ${p.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { renamed };
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
              walkIn: false,
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
        // Reference images sent before (or of a moved/cancelled consultation) come along
        await tx.leadAttachment.updateMany({
          where: {
            leadId: lead.id,
            OR: [{ consultationId: null }, { consultation: { status: "CANCELLED" } }],
          },
          data: { consultationId: consultation.id },
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

/**
 * Moves a consultation to another start time (used by the chatbot).
 * Keeps the same tattooer if they are free; otherwise the consultation is
 * re-booked fairly with someone who is free (old one cancelled).
 */
export async function rescheduleConsultation(
  deps: SchedulingDeps,
  consultationId: string,
  newStart: Date,
) {
  const { prisma } = deps;
  const now = nowOf(deps);
  const c = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!c) throw new BookingError("NOT_FOUND", "Termin nicht gefunden.");
  if (c.status !== "SCHEDULED" || c.startsAt <= now) {
    throw new BookingError(
      "INVALID_STATE",
      "Nur künftige, geplante Termine können umgebucht werden.",
    );
  }
  if (c.startsAt.getTime() === newStart.getTime()) return c;

  // 1. Same tattooer, if free at the new time
  const [same] = await loadBookableTattooers(prisma, [c.tattooerId]);
  if (same) {
    const inputs = await buildSlotInputs(
      deps,
      [same],
      new Date(newStart.getTime() - DAY),
      new Date(newStart.getTime() + DAY),
      { excludeConsultationId: c.id },
    );
    const input = inputs.get(same.id);
    if (
      input &&
      isSlotFree(input, newStart, { now, minNoticeMinutes: SCHEDULING_DEFAULTS.minNoticeMinutes })
    ) {
      const newEnd = new Date(newStart.getTime() + same.consultationMinutes * MIN);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`;
          const buffer = same.bufferMinutes * MIN;
          const clash = await tx.consultation.count({
            where: {
              id: { not: c.id },
              tattooerId: same.id,
              status: { not: "CANCELLED" },
              walkIn: false,
              startsAt: { lt: new Date(newEnd.getTime() + buffer) },
              endsAt: { gt: new Date(newStart.getTime() - buffer) },
            },
          });
          if (clash) throw new BookingError("SLOT_TAKEN", "Der Termin wurde gerade vergeben.");
          await tx.consultation.update({
            where: { id: c.id },
            data: { startsAt: newStart, endsAt: newEnd },
          });
        });
      } catch (err) {
        if (err instanceof BookingError) throw err;
        if (isOverlapViolation(err))
          throw new BookingError("SLOT_TAKEN", "Der Termin wurde gerade vergeben.");
        throw err;
      }
      if (!(await refreshConsultationEvent(deps, c.id))) {
        await prisma.consultation.update({
          where: { id: c.id },
          data: { startsAt: c.startsAt, endsAt: c.endsAt },
        });
        throw new BookingError(
          "CALENDAR_FAILED",
          "Der Kalendereintrag konnte nicht verschoben werden. Nichts wurde geändert.",
        );
      }
      return prisma.consultation.findUniqueOrThrow({ where: { id: c.id } });
    }
  }

  // 2. Someone else: book the new time fairly, then drop the old consultation.
  await prisma.consultation.update({
    where: { id: c.id },
    data: { status: "CANCELLED", cancelledAt: now, rescheduled: true },
  });
  try {
    const booked = await bookConsultation(deps, {
      leadId: c.leadId,
      startsAt: newStart,
      mode: c.mode,
      createdById: c.createdById,
    });
    await removeEvent(deps, c.tattooerId, c.calendarId, c.calendarEventId);
    return booked;
  } catch (err) {
    await prisma.consultation.update({
      where: { id: c.id },
      data: { status: "SCHEDULED", cancelledAt: null, rescheduled: false },
    });
    await prisma.lead.updateMany({
      where: { id: c.leadId },
      data: { status: "CONSULTATION_BOOKED" },
    });
    throw err;
  }
}

/**
 * Manual move of a consultation by admin/tattooer: same tattooer, new start.
 * Only conflicts are checked (other consultations, tattoo sessions, Google busy,
 * buffer) – not the availability windows, since the time was agreed personally.
 */
export async function moveConsultation(
  deps: SchedulingDeps,
  consultationId: string,
  newStart: Date,
) {
  const { prisma } = deps;
  const now = nowOf(deps);
  const c = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!c) throw new BookingError("NOT_FOUND", "Termin nicht gefunden.");
  if (c.status !== "SCHEDULED" || c.startsAt <= now) {
    throw new BookingError(
      "INVALID_STATE",
      "Nur künftige, geplante Termine können verschoben werden.",
    );
  }
  if (newStart <= now)
    throw new BookingError("INVALID_STATE", "Der neue Termin muss in der Zukunft liegen.");
  if (newStart.getTime() === c.startsAt.getTime()) return c;

  const profile = await prisma.tattooerProfile.findUniqueOrThrow({
    where: { id: c.tattooerId },
    include: tattooerInclude,
  });
  const newEnd = new Date(newStart.getTime() + profile.consultationMinutes * MIN);

  // Busy times: consultations, tattoo sessions, blockers/absences and Google.
  const conflict = await findConflict(deps, profile, newStart, newEnd, {
    excludeConsultationId: c.id,
    bufferMinutes: profile.bufferMinutes,
  });
  if (conflict) throw new BookingError("NO_TATTOOER_FREE", conflict);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`;
      const buffer = profile.bufferMinutes * MIN;
      const clash = await tx.consultation.count({
        where: {
          id: { not: c.id },
          tattooerId: profile.id,
          status: { not: "CANCELLED" },
          walkIn: false,
          startsAt: { lt: new Date(newEnd.getTime() + buffer) },
          endsAt: { gt: new Date(newStart.getTime() - buffer) },
        },
      });
      if (clash)
        throw new BookingError(
          "SLOT_TAKEN",
          `${profile.user.name} hat zu dieser Zeit bereits eine Beratung.`,
        );
      const sessionClash = await tx.tattooBooking.count({
        where: {
          cancelled: false,
          consultation: { tattooerId: profile.id, status: "HELD" },
          startsAt: { not: null, lt: new Date(newEnd.getTime() + buffer) },
          endsAt: { gt: new Date(newStart.getTime() - buffer) },
        },
      });
      if (sessionClash) {
        throw new BookingError(
          "SLOT_TAKEN",
          `${profile.user.name} hat zu dieser Zeit einen Tattoo-Termin.`,
        );
      }
      await tx.consultation.update({
        where: { id: c.id },
        data: { startsAt: newStart, endsAt: newEnd },
      });
    });
  } catch (err) {
    if (err instanceof BookingError) throw err;
    if (isOverlapViolation(err))
      throw new BookingError("SLOT_TAKEN", "Der Termin kollidiert mit einer anderen Beratung.");
    throw err;
  }

  if (!(await refreshConsultationEvent(deps, c.id))) {
    await prisma.consultation.update({
      where: { id: c.id },
      data: { startsAt: c.startsAt, endsAt: c.endsAt },
    });
    throw new BookingError(
      "CALENDAR_FAILED",
      "Der Kalendereintrag konnte nicht verschoben werden. Nichts wurde geändert.",
    );
  }
  return prisma.consultation.findUniqueOrThrow({ where: { id: c.id } });
}

// ---------------------------------------------------------------------------
// Manual entries from the calendar (consultation, tattoo session, blocker)
// ---------------------------------------------------------------------------

const timeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: DEFAULT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Describes why the tattooer is not free in [start, end) – or null if free.
 * Checks consultations (with buffer), timed tattoo sessions, blockers/absences
 * and, if connected, calendar busy times (Google or TeamUp; app entries excluded).
 */
export async function findConflict(
  deps: SchedulingDeps,
  profile: CalendarProfileFields & { user: { name: string } },
  start: Date,
  end: Date,
  opts: { excludeConsultationId?: string; bufferMinutes?: number } = {},
): Promise<string | null> {
  const { prisma } = deps;
  const buffer = (opts.bufferMinutes ?? 0) * MIN;
  const name = profile.user.name;
  const consultation = await prisma.consultation.findFirst({
    where: {
      tattooerId: profile.id,
      status: { not: "CANCELLED" },
      walkIn: false,
      startsAt: { lt: new Date(end.getTime() + buffer) },
      endsAt: { gt: new Date(start.getTime() - buffer) },
      ...(opts.excludeConsultationId ? { id: { not: opts.excludeConsultationId } } : {}),
    },
    include: { lead: { select: { name: true } } },
  });
  if (consultation) {
    return `${name} hat um ${timeFmt.format(consultation.startsAt)} Uhr bereits eine Beratung (${consultation.lead.name}).`;
  }
  const session = await prisma.tattooBooking.findFirst({
    where: {
      cancelled: false,
      consultation: { tattooerId: profile.id, status: "HELD" },
      startsAt: { not: null, lt: end },
      endsAt: { gt: start },
    },
  });
  if (session)
    return `${name} hat um ${timeFmt.format(session.startsAt!)} Uhr einen Tattoo-Termin.`;
  const block = await prisma.availabilityException.findFirst({
    where: {
      tattooerId: profile.id,
      kind: "UNAVAILABLE",
      startsAt: { lt: end },
      endsAt: { gt: start },
    },
  });
  if (block) return `${name} ist in dieser Zeit geblockt${block.note ? ` („${block.note}“)` : ""}.`;
  if (isCalendarConnected(profile)) {
    let busy: Interval[];
    try {
      busy = await deps.calendar.getBusy(connectionOf(profile), start, end);
    } catch {
      throw new BookingError(
        "CALENDAR_FAILED",
        `Der ${calendarLabel(profile)} ist gerade nicht erreichbar. Bitte später erneut versuchen.`,
      );
    }
    if (busy.some((b) => b.start < end && b.end > start))
      return `${name} hat zu dieser Zeit einen Termin im ${calendarLabel(profile)}.`;
  }
  return null;
}

async function profileForManual(prisma: PrismaClient, tattooerId: string) {
  const profile = await prisma.tattooerProfile.findUnique({
    where: { id: tattooerId },
    include: { user: { select: { name: true, active: true } } },
  });
  if (!profile || !profile.user.active)
    throw new BookingError("NOT_FOUND", "Diese Person ist nicht (mehr) aktiv.");
  return profile;
}

/** Consultation entered by hand: chosen tattooer, conflicts checked, availability windows not enforced. */
export async function createManualConsultation(
  deps: SchedulingDeps,
  input: {
    leadId: string;
    tattooerId: string;
    startsAt: Date;
    mode: ConsultationMode;
    createdById?: string | null;
  },
) {
  const { prisma } = deps;
  const now = nowOf(deps);
  if (input.startsAt <= now)
    throw new BookingError("INVALID_STATE", "Der Termin muss in der Zukunft liegen.");
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new BookingError("LEAD_NOT_FOUND", "Kontakt nicht gefunden.");
  const upcoming = await prisma.consultation.findFirst({
    where: { leadId: lead.id, status: "SCHEDULED", endsAt: { gt: now } },
  });
  if (upcoming)
    throw new BookingError(
      "ALREADY_BOOKED",
      "Für diesen Kontakt ist bereits eine Beratung geplant.",
    );
  const profile = await profileForManual(prisma, input.tattooerId);
  const endsAt = new Date(input.startsAt.getTime() + profile.consultationMinutes * MIN);
  const conflict = await findConflict(deps, profile, input.startsAt, endsAt, {
    bufferMinutes: profile.bufferMinutes,
  });
  if (conflict) throw new BookingError("NO_TATTOOER_FREE", conflict);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`;
      const clash = await tx.consultation.count({
        where: {
          tattooerId: profile.id,
          status: { not: "CANCELLED" },
          walkIn: false,
          startsAt: { lt: endsAt },
          endsAt: { gt: input.startsAt },
        },
      });
      if (clash) throw new BookingError("SLOT_TAKEN", "Der Termin wurde gerade vergeben.");
      const c = await tx.consultation.create({
        data: {
          leadId: lead.id,
          tattooerId: profile.id,
          startsAt: input.startsAt,
          endsAt,
          mode: input.mode,
          createdById: input.createdById ?? null,
        },
      });
      if (
        [
          "NEW",
          "CONTACTED",
          "IN_CHAT",
          "NO_RESPONSE",
          "CANCELLED",
          "NO_SHOW",
          "CONSULTATION_DONE",
        ].includes(lead.status)
      ) {
        await tx.lead.update({
          where: { id: lead.id },
          data: { status: "CONSULTATION_BOOKED", statusChangedAt: now },
        });
      }
      return c;
    });
  } catch (err) {
    if (err instanceof BookingError) throw err;
    if (isOverlapViolation(err))
      throw new BookingError("SLOT_TAKEN", "Der Termin kollidiert mit einer anderen Beratung.");
    throw err;
  }

  if (isCalendarConnected(profile)) {
    try {
      const { calendarId, eventId } = await writeEvent(deps, created.id, profile.id);
      await prisma.consultation.update({
        where: { id: created.id },
        data: { calendarId, calendarEventId: eventId },
      });
    } catch (err) {
      console.error(
        `[booking] manual consultation calendar write failed:`,
        err instanceof Error ? err.message : err,
      );
      await prisma.$transaction([
        prisma.consultation.delete({ where: { id: created.id } }),
        prisma.lead.updateMany({
          where: { id: lead.id, status: "CONSULTATION_BOOKED" },
          data: { status: lead.status, statusChangedAt: lead.statusChangedAt },
        }),
      ]);
      throw new BookingError(
        "CALENDAR_FAILED",
        "Der Kalendereintrag konnte nicht erstellt werden. Der Termin wurde nicht angelegt.",
      );
    }
  }
  return created;
}

/** Blocker: time in which the tattooer gets no consultations (stored as unavailability). */
export async function createBlocker(
  deps: SchedulingDeps,
  input: { tattooerId: string; startsAt: Date; endsAt: Date; note?: string | null },
) {
  if (input.endsAt <= input.startsAt)
    throw new BookingError("INVALID_STATE", "Das Ende muss nach dem Beginn liegen.");
  const profile = await profileForManual(deps.prisma, input.tattooerId);
  const consultation = await deps.prisma.consultation.findFirst({
    where: {
      tattooerId: profile.id,
      status: "SCHEDULED",
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
  });
  if (consultation) {
    throw new BookingError(
      "NO_TATTOOER_FREE",
      `In dieser Zeit liegt bereits eine Beratung (${timeFmt.format(consultation.startsAt)} Uhr).`,
    );
  }
  return deps.prisma.availabilityException.create({
    data: {
      tattooerId: profile.id,
      kind: "UNAVAILABLE",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      note: input.note?.trim().slice(0, 200) || "Blocker",
    },
  });
}

/** Checks a tattoo session slot of a booked tattoo; returns the profile for further use. */
export async function checkSessionSlot(
  deps: SchedulingDeps,
  consultationId: string,
  start: Date,
  end: Date,
) {
  const c = await deps.prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!c || c.status !== "HELD" || c.tattooBooked !== true) {
    throw new BookingError("INVALID_STATE", "Für diesen Kontakt ist kein Tattoo gebucht.");
  }
  if (end <= start)
    throw new BookingError("INVALID_STATE", "Das Ende muss nach dem Beginn liegen.");
  const profile = await profileForManual(deps.prisma, c.tattooerId);
  const conflict = await findConflict(deps, profile, start, end);
  if (conflict) throw new BookingError("NO_TATTOOER_FREE", conflict);
  return profile;
}

/**
 * Walk-in customer: creates a tattoo project without a consultation (a consultation record
 * flagged `walkIn`, already "held" with a booked tattoo). The sessions are added to it like
 * to any other booked tattoo. It never shows up as a consultation.
 */
export async function createWalkInProject(
  deps: SchedulingDeps,
  input: { leadId: string; tattooerId: string; startsAt: Date; endsAt: Date; createdById: string },
): Promise<string> {
  const { prisma } = deps;
  if (input.endsAt <= input.startsAt)
    throw new BookingError("INVALID_STATE", "Das Ende muss nach dem Beginn liegen.");
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new BookingError("LEAD_NOT_FOUND", "Kontakt nicht gefunden.");
  const profile = await profileForManual(prisma, input.tattooerId);
  const conflict = await findConflict(deps, profile, input.startsAt, input.endsAt);
  if (conflict) throw new BookingError("NO_TATTOOER_FREE", conflict);
  const now = nowOf(deps);
  const project = await prisma.$transaction(async (tx) => {
    const c = await tx.consultation.create({
      data: {
        leadId: lead.id,
        tattooerId: profile.id,
        walkIn: true,
        // Zero-length range: never overlaps consultations (exclusion constraint)
        startsAt: input.startsAt,
        endsAt: input.startsAt,
        status: "HELD",
        tattooBooked: true,
        sessionPlan: "SINGLE",
        outcomeRecordedAt: now,
        outcomeRecordedById: input.createdById,
        createdById: input.createdById,
      },
    });
    await tx.lead.update({
      where: { id: lead.id },
      data: { status: "TATTOO_BOOKED", statusChangedAt: now },
    });
    return c;
  });
  return project.id;
}
