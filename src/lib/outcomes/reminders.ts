/**
 * Morning push to tattooers whose consultations or tattoo sessions from yesterday or earlier
 * still have no outcome (without it, reports and billing are incomplete). At most once a day,
 * only while something is open.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { pushToUsers, type PushSender } from "../push";
import { missingAttendanceWhere } from "./attendance";
import { DEFAULT_TIME_ZONE, localDateOf, localMinuteOf, startOfLocalDay } from "../time";

export const OUTCOME_REMINDER_MINUTE = 9 * 60;

export async function notifyMissingOutcomes(
  prisma: Pick<
    PrismaClient,
    "consultation" | "tattooBooking" | "tattooerProfile" | "pushSubscription"
  >,
  push: PushSender,
  now = new Date(),
  tz = DEFAULT_TIME_ZONE,
) {
  if (localMinuteOf(now, tz) < OUTCOME_REMINDER_MINUTE) return 0;
  const today = localDateOf(now, tz);
  const startOfToday = startOfLocalDay(today, tz);
  const notYetReminded = {
    user: { active: true },
    OR: [{ outcomeReminderOn: null }, { outcomeReminderOn: { not: today } }],
  };
  const consultations = await prisma.consultation.groupBy({
    by: ["tattooerId"],
    where: {
      status: "SCHEDULED",
      walkIn: false,
      endsAt: { lt: startOfToday },
      lead: { isTest: false },
      tattooer: notYetReminded,
    },
    _count: { _all: true },
  });
  // Sessions of yesterday or earlier: the rule of the list, evaluated at the start of today
  const base = missingAttendanceWhere(startOfToday);
  const sessions = await prisma.tattooBooking.findMany({
    where: {
      ...base,
      consultation: { ...(base.consultation as object), tattooer: notYetReminded },
    },
    select: { consultation: { select: { tattooerId: true } } },
  });
  const counts = new Map<string, { consultations: number; sessions: number }>();
  const entry = (id: string) => {
    const e = counts.get(id) ?? { consultations: 0, sessions: 0 };
    counts.set(id, e);
    return e;
  };
  for (const row of consultations) entry(row.tattooerId).consultations += row._count._all;
  for (const s of sessions) entry(s.consultation.tattooerId).sessions++;

  let sent = 0;
  for (const [tattooerId, n] of counts) {
    const profile = await prisma.tattooerProfile.findUnique({
      where: { id: tattooerId },
      select: { userId: true },
    });
    if (!profile) continue;
    await pushToUsers(prisma, push, [profile.userId], {
      title: reminderTitle(n),
      body: "Bitte kurz eintragen, wie sie gelaufen sind – sonst fehlen sie in der Auswertung.",
      url: "/consultations",
      tag: "missing-outcomes",
    });
    await prisma.tattooerProfile.update({
      where: { id: tattooerId },
      data: { outcomeReminderOn: today },
    });
    sent++;
  }
  return sent;
}

export function reminderTitle(n: { consultations: number; sessions: number }) {
  const parts = [
    n.consultations === 1
      ? "1 Beratung"
      : n.consultations > 1
        ? `${n.consultations} Beratungen`
        : null,
    n.sessions === 1 ? "1 Tattoo-Termin" : n.sessions > 1 ? `${n.sessions} Tattoo-Termine` : null,
  ].filter(Boolean);
  return `${parts.join(" und ")} ohne Ergebnis`;
}
