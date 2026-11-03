/**
 * Writes tattoo sessions into the tattooer's app calendar (the same one as the
 * consultations). The app stays the source of truth: every change marks the
 * session as pending, sync happens right away and is retried by the worker.
 * Events that must disappear go through a deletion queue.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { addDays, DEFAULT_TIME_ZONE, localDateOf } from "../time";
import { connectionOf, type SchedulingDeps } from "./booking";
import { buildTattooEvent } from "./event-content";

type Tx = Pick<PrismaClient, "calendarEventDeletion" | "tattooBooking" | "consultation">;

const MAX_DELETION_ATTEMPTS = 10;

/** Queues removal of the calendar events of the given sessions (call before deleting them). */
export async function queueSessionEventDeletions(
  db: Tx,
  where: { consultationId?: string; ids?: string[] },
) {
  const sessions = await db.tattooBooking.findMany({
    where: {
      ...(where.consultationId ? { consultationId: where.consultationId } : {}),
      ...(where.ids ? { id: { in: where.ids } } : {}),
      calendarEventId: { not: null },
    },
    select: {
      calendarId: true,
      calendarEventId: true,
      consultation: { select: { tattooerId: true } },
    },
  });
  if (!sessions.length) return 0;
  const res = await db.calendarEventDeletion.createMany({
    data: sessions.map((s) => ({
      tattooerId: s.consultation.tattooerId,
      calendarId: s.calendarId!,
      eventId: s.calendarEventId!,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

/** Queues removal of ALL calendar events of a lead (GDPR deletion). */
export async function queueLeadEventDeletions(prisma: PrismaClient, leadId: string) {
  const consultations = await prisma.consultation.findMany({
    where: { leadId, calendarEventId: { not: null }, calendarId: { not: null } },
    select: { tattooerId: true, calendarId: true, calendarEventId: true },
  });
  const sessions = await prisma.tattooBooking.findMany({
    where: { consultation: { leadId }, calendarEventId: { not: null } },
    select: {
      calendarId: true,
      calendarEventId: true,
      consultation: { select: { tattooerId: true } },
    },
  });
  const data = [
    ...consultations.map((c) => ({
      tattooerId: c.tattooerId,
      calendarId: c.calendarId!,
      eventId: c.calendarEventId!,
    })),
    ...sessions.map((s) => ({
      tattooerId: s.consultation.tattooerId,
      calendarId: s.calendarId!,
      eventId: s.calendarEventId!,
    })),
  ];
  if (data.length) await prisma.calendarEventDeletion.createMany({ data, skipDuplicates: true });
  return data.length;
}

/** Brings one session's calendar event in line with the database. Never throws. */
export async function syncSessionEvent(deps: SchedulingDeps, sessionId: string): Promise<boolean> {
  const { prisma, calendar } = deps;
  const tz = deps.timeZone ?? DEFAULT_TIME_ZONE;
  const s = await prisma.tattooBooking.findUnique({
    where: { id: sessionId },
    include: { consultation: { include: { lead: true, tattooer: true } } },
  });
  if (!s) return true;
  const c = s.consultation;
  const profile = c.tattooer;
  const wanted = !s.cancelled && c.status === "HELD" && c.tattooBooked === true;

  try {
    // Remove the event if it should not exist (or lives in another calendar than now)
    const calendarChanged =
      s.calendarId &&
      profile.consultationCalendarId &&
      s.calendarId !== profile.consultationCalendarId;
    if (s.calendarEventId && (!wanted || calendarChanged)) {
      await calendar.deleteEvent(connectionOf(profile), s.calendarId!, s.calendarEventId);
      await prisma.tattooBooking.update({
        where: { id: s.id },
        data: { calendarEventId: null, calendarId: null },
      });
      s.calendarEventId = null;
    }
    if (!wanted || !profile.googleConnectedAt) {
      await prisma.tattooBooking.update({
        where: { id: s.id },
        data: { calendarSyncPending: false, calendarSyncError: null },
      });
      return true;
    }

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    const localDate = localDateOf(s.date, tz);
    const count = await prisma.tattooBooking.count({
      where: { consultationId: c.id, cancelled: false },
    });
    const event = buildTattooEvent({
      lead: c.lead,
      sessionNumber: s.sessionNumber,
      multipleSessions: c.sessionPlan === "MULTIPLE" || count > 1,
      slot: s.startsAt && s.endsAt ? { start: s.startsAt, end: s.endsAt } : null,
      localDate,
      nextLocalDate: addDays(localDate, 1),
      studioAddress: settings?.studioAddress ?? null,
      note: s.note,
      appUrl: deps.appUrl ?? process.env.APP_URL ?? "http://localhost:3000",
      timeZone: tz,
    });
    const conn = connectionOf(profile);
    let calendarId = s.calendarId;
    let eventId = s.calendarEventId;
    if (eventId && calendarId) {
      await calendar.updateEvent(conn, calendarId, eventId, event);
    } else {
      calendarId = await calendar.ensureConsultationCalendar(conn);
      if (calendarId !== profile.consultationCalendarId) {
        await prisma.tattooerProfile.update({
          where: { id: profile.id },
          data: { consultationCalendarId: calendarId },
        });
      }
      eventId = await calendar.createEvent(conn, calendarId, event);
    }
    await prisma.tattooBooking.update({
      where: { id: s.id },
      data: {
        calendarId,
        calendarEventId: eventId,
        calendarSyncPending: false,
        calendarSyncError: null,
        calendarSyncedAt: new Date(),
      },
    });
    return true;
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error(`[calendar] tattoo session ${s.id} sync failed:`, message);
    await prisma.tattooBooking.update({
      where: { id: s.id },
      data: { calendarSyncPending: true, calendarSyncError: message },
    });
    return false;
  }
}

/** Processes queued event deletions (best effort, retried). */
export async function processCalendarDeletions(deps: SchedulingDeps, limit = 25) {
  const { prisma, calendar } = deps;
  const due = await prisma.calendarEventDeletion.findMany({
    where: { attempts: { lt: MAX_DELETION_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let deleted = 0;
  for (const d of due) {
    const profile = await prisma.tattooerProfile.findUnique({ where: { id: d.tattooerId } });
    try {
      if (profile) await calendar.deleteEvent(connectionOf(profile), d.calendarId, d.eventId);
      await prisma.calendarEventDeletion.delete({ where: { id: d.id } });
      deleted++;
    } catch (err) {
      await prisma.calendarEventDeletion.update({
        where: { id: d.id },
        data: {
          attempts: { increment: 1 },
          lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        },
      });
    }
  }
  return { deleted };
}

/** Sync all sessions of a consultation (after outcome/session changes) and pending deletions. */
export async function syncConsultationSessions(deps: SchedulingDeps, consultationId: string) {
  await processCalendarDeletions(deps);
  const sessions = await deps.prisma.tattooBooking.findMany({
    where: { consultationId },
    select: { id: true },
  });
  let ok = true;
  for (const s of sessions) ok = (await syncSessionEvent(deps, s.id)) && ok;
  return ok;
}

/** Worker: retry sessions whose calendar sync failed or is still open. */
export async function syncPendingSessions(deps: SchedulingDeps, limit = 25) {
  const pending = await deps.prisma.tattooBooking.findMany({
    where: { calendarSyncPending: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let synced = 0;
  for (const s of pending) if (await syncSessionEvent(deps, s.id)) synced++;
  const deletions = await processCalendarDeletions(deps);
  return { synced, deleted: deletions.deleted };
}
