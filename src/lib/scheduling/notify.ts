/**
 * Push to the tattooer (and admins) when a consultation is booked, moved, cancelled or
 * handed to another tattooer. Admins choose in their settings between all consultations
 * and only their own. Whoever made the change in the app gets no push about it.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { pushToUsers, type PushSender } from "../push";
import { DEFAULT_TIME_ZONE } from "../time";

export type AppointmentEvent = "BOOKED" | "MOVED" | "CANCELLED" | "REASSIGNED";

export interface NotifyDeps {
  prisma: Pick<PrismaClient, "consultation" | "user" | "pushSubscription" | "tattooerProfile">;
  push?: PushSender;
  timeZone?: string;
}

const TITLES: Record<AppointmentEvent, string> = {
  BOOKED: "Neue Beratung",
  MOVED: "Beratung verschoben",
  CANCELLED: "Beratung abgesagt",
  REASSIGNED: "Beratung neu zugeteilt",
};

/** "Mo., 18.11. – 14:00 Uhr" */
export function appointmentLabel(d: Date, tz = DEFAULT_TIME_ZONE) {
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("de-DE", { timeZone: tz, ...o }).format(d);
  return `${f({ weekday: "short", day: "2-digit", month: "2-digit" })} – ${f({ hour: "2-digit", minute: "2-digit" })} Uhr`;
}

/** Users to notify: the tattooer(s) concerned plus admins who want every consultation. */
export async function appointmentRecipients(
  prisma: NotifyDeps["prisma"],
  tattooerIds: string[],
  exceptUserId?: string | null,
) {
  const [profiles, admins] = await Promise.all([
    prisma.tattooerProfile.findMany({
      where: { id: { in: tattooerIds }, user: { active: true } },
      select: { userId: true },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", active: true, pushAllAppointments: true },
      select: { id: true },
    }),
  ]);
  const ids = new Set([...profiles.map((p) => p.userId), ...admins.map((a) => a.id)]);
  if (exceptUserId) ids.delete(exceptUserId);
  return [...ids];
}

/**
 * Best effort: a failed push never breaks a booking.
 * `previousTattooerId`: for REASSIGNED / MOVED to another tattooer, the one who lost it.
 */
export async function notifyAppointment(
  deps: NotifyDeps,
  event: AppointmentEvent,
  consultationId: string,
  opts: { previousTattooerId?: string | null; byUserId?: string | null } = {},
) {
  if (!deps.push?.configured) return 0;
  try {
    const c = await deps.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: {
        id: true,
        startsAt: true,
        mode: true,
        tattooerId: true,
        walkIn: true,
        lead: { select: { id: true, name: true, isTest: true } },
        tattooer: { select: { user: { select: { name: true } } } },
      },
    });
    if (!c || c.walkIn || c.lead.isTest) return 0;
    const tattooers = [c.tattooerId];
    if (opts.previousTattooerId && opts.previousTattooerId !== c.tattooerId)
      tattooers.push(opts.previousTattooerId);
    const recipients = await appointmentRecipients(deps.prisma, tattooers, opts.byUserId);
    const firstName = c.tattooer.user.name.split(/\s+/)[0];
    return await pushToUsers(deps.prisma, deps.push, recipients, {
      title: `${TITLES[event]}: ${c.lead.name}`,
      body: `${appointmentLabel(c.startsAt, deps.timeZone)} · bei ${firstName} · ${c.mode === "PHONE" ? "telefonisch" : "vor Ort"}`,
      url: `/leads/${c.lead.id}`,
      tag: `consultation-${c.id}`,
    });
  } catch (err) {
    console.error("[notify] appointment push failed:", err);
    return 0;
  }
}
