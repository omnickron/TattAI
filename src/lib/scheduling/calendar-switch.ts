/**
 * Choosing the calendar of a tattooer: Google (own account) or TeamUp (shared studio
 * calendar, entries marked with the tattooer's "Artist" value). On a switch, upcoming
 * consultations and tattoo sessions move to the new calendar (old entries are removed).
 */
import { isTeamupCalendarId } from "../google/calendar";
import { loadTeamupConfig } from "../teamup/config";
import { teamupConfigured } from "../teamup/teamup";
import {
  BookingError,
  connectionOf,
  createInAppCalendar,
  isCalendarConnected,
  type SchedulingDeps,
} from "./booking";
import { buildConsultationEvent } from "./event-content";
import { processCalendarDeletions, syncSessionEvent } from "./session-calendar";
import { DEFAULT_TIME_ZONE } from "../time";

function nowOf(deps: SchedulingDeps) {
  return (deps.now ?? (() => new Date()))();
}

/** Connects the tattooer to the studio's TeamUp calendar with the given artist value. */
export async function connectTeamup(
  deps: SchedulingDeps,
  tattooerId: string,
  artist: { value: string; label: string },
  /** Own sub-calendar of the tattooer; null = studio default from the settings */
  subcalendar: { id: string; name: string } | null = null,
) {
  const { prisma } = deps;
  const value = artist.value.trim();
  if (!value) throw new BookingError("INVALID_STATE", "Bitte deinen Artist auswählen.");
  if (!teamupConfigured(await loadTeamupConfig(prisma))) {
    throw new BookingError(
      "INVALID_STATE",
      "TeamUp ist noch nicht eingerichtet. Der Admin muss es zuerst unter „Einstellungen“ verbinden.",
    );
  }
  const taken = await prisma.tattooerProfile.findFirst({
    where: { id: { not: tattooerId }, teamupArtist: value, calendarProvider: "TEAMUP" },
    include: { user: { select: { name: true } } },
  });
  if (taken)
    throw new BookingError(
      "INVALID_STATE",
      `Dieser Artist ist schon ${taken.user.name} zugeordnet.`,
    );

  const profile = await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: tattooerId } });
  const calendarId = await deps.calendar.ensureConsultationCalendar({
    ...connectionOf(profile),
    provider: "TEAMUP",
    teamupArtist: value,
    teamupSubcalendarId: subcalendar?.id ?? null,
    calendarId: null,
  });
  await prisma.tattooerProfile.update({
    where: { id: tattooerId },
    data: {
      calendarProvider: "TEAMUP",
      teamupArtist: value,
      teamupArtistLabel: artist.label.trim() || value,
      teamupSubcalendarId: subcalendar?.id ?? null,
      teamupSubcalendarName: subcalendar?.name ?? null,
      teamupConnectedAt: nowOf(deps),
      consultationCalendarId: calendarId,
      // Remember the Google app calendar for a later switch back
      ...(profile.consultationCalendarId && !isTeamupCalendarId(profile.consultationCalendarId)
        ? { googleCalendarId: profile.consultationCalendarId }
        : {}),
    },
  });
  return moveUpcomingEntries(deps, tattooerId);
}

/** Switches back to the (already connected) Google calendar. */
export async function switchToGoogle(deps: SchedulingDeps, tattooerId: string) {
  const { prisma } = deps;
  const profile = await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: tattooerId } });
  if (!profile.googleConnectedAt) {
    throw new BookingError("INVALID_STATE", "Bitte zuerst den Google-Kalender verbinden.");
  }
  await prisma.tattooerProfile.update({
    where: { id: tattooerId },
    data: {
      calendarProvider: "GOOGLE",
      consultationCalendarId: profile.googleCalendarId ?? null,
    },
  });
  return moveUpcomingEntries(deps, tattooerId);
}

/** Stops using TeamUp. Back to Google if that is connected, otherwise no calendar. */
export async function disconnectTeamup(deps: SchedulingDeps, tattooerId: string) {
  const { prisma } = deps;
  const profile = await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: tattooerId } });
  await prisma.tattooerProfile.update({
    where: { id: tattooerId },
    data: {
      calendarProvider: "GOOGLE",
      teamupConnectedAt: null,
      consultationCalendarId: profile.googleCalendarId ?? null,
    },
  });
  if (profile.googleConnectedAt) return moveUpcomingEntries(deps, tattooerId);
  return { moved: 0, failed: 0 };
}

/**
 * Re-creates upcoming consultations and tattoo sessions in the tattooer's current calendar
 * and removes them from the previous one. Best effort: failures are logged and counted;
 * tattoo sessions stay pending and are retried by the worker.
 */
export async function moveUpcomingEntries(deps: SchedulingDeps, tattooerId: string) {
  const { prisma } = deps;
  const now = nowOf(deps);
  const tz = deps.timeZone ?? DEFAULT_TIME_ZONE;
  const profile = await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: tattooerId } });
  let moved = 0;
  let failed = 0;

  const consultations = await prisma.consultation.findMany({
    where: { tattooerId, status: "SCHEDULED", walkIn: false, endsAt: { gt: now } },
    include: { lead: true },
  });
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  for (const c of consultations) {
    if (c.calendarId && c.calendarId === profile.consultationCalendarId) continue;
    try {
      if (c.calendarId && c.calendarEventId) {
        await prisma.calendarEventDeletion.create({
          data: { tattooerId, calendarId: c.calendarId, eventId: c.calendarEventId },
        });
      }
      let target: { calendarId: string | null; eventId: string | null } = {
        calendarId: null,
        eventId: null,
      };
      const fresh = await prisma.tattooerProfile.findUniqueOrThrow({ where: { id: tattooerId } });
      if (isCalendarConnected(fresh)) {
        target = await createInAppCalendar(
          deps,
          fresh,
          buildConsultationEvent({
            lead: c.lead,
            mode: c.mode,
            start: c.startsAt,
            end: c.endsAt,
            studioAddress: settings?.studioAddress ?? null,
            appUrl: deps.appUrl ?? process.env.APP_URL ?? "http://localhost:3000",
            timeZone: tz,
          }),
        );
      }
      await prisma.consultation.update({
        where: { id: c.id },
        data: { calendarId: target.calendarId, calendarEventId: target.eventId },
      });
      moved++;
    } catch (err) {
      failed++;
      console.error(
        `[calendar] moving consultation ${c.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Tattoo sessions: the regular sync removes entries in a different calendar and re-creates them
  const sessions = await prisma.tattooBooking.findMany({
    where: {
      consultation: { tattooerId },
      cancelled: false,
      date: { gte: new Date(now.getTime() - 24 * 3600_000) },
    },
    select: { id: true },
  });
  await prisma.tattooBooking.updateMany({
    where: { id: { in: sessions.map((s) => s.id) } },
    data: { calendarSyncPending: true, calendarNextAttemptAt: null },
  });
  for (const s of sessions) {
    if (await syncSessionEvent(deps, s.id)) moved++;
    else failed++;
  }
  // Remove the old consultation entries right away (retried by the worker otherwise)
  await processCalendarDeletions(deps);
  return { moved, failed };
}
