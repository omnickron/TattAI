/**
 * Writes tattoo sessions into the tattooer's app calendar (the same one as the
 * consultations). The app stays the source of truth: every change marks the
 * session as pending, sync happens right away and is retried by the worker.
 * Events that must disappear go through a deletion queue.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { addDays, DEFAULT_TIME_ZONE, localDateOf } from "../time";
import { connectionOf, createInAppCalendar, type SchedulingDeps } from "./booking";
import { buildTattooEvent } from "./event-content";

type Tx = Pick<PrismaClient, "calendarEventDeletion" | "tattooBooking" | "consultation">;

const MAX_DELETION_ATTEMPTS = 10;

/** Automatic retry delay: 1, 2, 4 … minutes, at most one hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 60 * 60_000);
}

/** Turns a technical calendar error into a short German explanation. */
export function describeCalendarError(message: string | null | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("nicht verbunden")) {
    return "Diese Person hat ihren Google-Kalender noch nicht verbunden (unter „Verfügbarkeit“).";
  }
  if (m.includes("invalid_grant") || m.includes(" 401") || m.includes("token")) {
    return "Die Verbindung zu Google ist abgelaufen. Bitte den Google-Kalender unter „Verfügbarkeit“ neu verbinden.";
  }
  if (m.includes(" 403"))
    return "Google verweigert den Zugriff auf den Kalender. Bitte den Google-Kalender neu verbinden.";
  if (m.includes(" 404") || m.includes(" 410"))
    return "Der Kalender wurde in Google nicht gefunden – er wird neu angelegt.";
  if (m.includes("timeout") || m.includes("fetch failed") || /\b5\d\d\b/.test(m)) {
    return "Google war nicht erreichbar. Bitte später erneut versuchen.";
  }
  return "Die Übertragung zu Google ist fehlgeschlagen.";
}

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
        data: {
          calendarSyncPending: false,
          calendarSyncError: null,
          calendarSyncAttempts: 0,
          calendarNextAttemptAt: null,
        },
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
      ({ calendarId, eventId } = await createInAppCalendar(deps, profile, event));
    }
    await prisma.tattooBooking.update({
      where: { id: s.id },
      data: {
        calendarId,
        calendarEventId: eventId,
        calendarSyncPending: false,
        calendarSyncError: null,
        calendarSyncAttempts: 0,
        calendarNextAttemptAt: null,
        calendarSyncedAt: new Date(),
      },
    });
    return true;
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error(`[calendar] tattoo session ${s.id} sync failed:`, message);
    await prisma.tattooBooking.update({
      where: { id: s.id },
      data: {
        calendarSyncPending: true,
        calendarSyncError: message,
        calendarSyncAttempts: { increment: 1 },
        calendarNextAttemptAt: new Date(
          (deps.now ?? (() => new Date()))().getTime() + retryDelayMs(s.calendarSyncAttempts + 1),
        ),
      },
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
  const now = (deps.now ?? (() => new Date()))();
  const pending = await deps.prisma.tattooBooking.findMany({
    where: {
      calendarSyncPending: true,
      OR: [{ calendarNextAttemptAt: null }, { calendarNextAttemptAt: { lte: now } }],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let synced = 0;
  for (const s of pending) if (await syncSessionEvent(deps, s.id)) synced++;
  const deletions = await processCalendarDeletions(deps);
  return { synced, deleted: deletions.deleted };
}

/** Manual retry from the app: syncs right away (ignores the backoff) and explains the result. */
export async function retrySessionSync(deps: SchedulingDeps, sessionId: string) {
  const ok = await syncSessionEvent(deps, sessionId);
  if (ok) return { ok: true, message: "Mit Google synchronisiert." };
  const s = await deps.prisma.tattooBooking.findUnique({
    where: { id: sessionId },
    select: { calendarSyncError: true },
  });
  return { ok: false, message: describeCalendarError(s?.calendarSyncError) };
}

/** After (re)connecting Google: retry all open sessions of this tattooer right away. */
export async function resyncTattooerSessions(deps: SchedulingDeps, tattooerId: string) {
  await deps.prisma.tattooBooking.updateMany({
    where: { consultation: { tattooerId }, calendarSyncPending: true },
    data: { calendarNextAttemptAt: null },
  });
  const pending = await deps.prisma.tattooBooking.findMany({
    where: { consultation: { tattooerId }, calendarSyncPending: true },
    select: { id: true },
  });
  for (const p of pending) await syncSessionEvent(deps, p.id);
  return pending.length;
}
