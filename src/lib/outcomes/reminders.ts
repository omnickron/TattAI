/**
 * Morning push to tattooers whose consultations from yesterday or earlier still have no
 * outcome (without it, reports and billing are incomplete). At most once a day, only while
 * something is open.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { pushToUsers, type PushSender } from "../push";
import { DEFAULT_TIME_ZONE, localDateOf, localMinuteOf, startOfLocalDay } from "../time";

export const OUTCOME_REMINDER_MINUTE = 9 * 60;

export async function notifyMissingOutcomes(
  prisma: Pick<PrismaClient, "consultation" | "tattooerProfile" | "pushSubscription">,
  push: PushSender,
  now = new Date(),
  tz = DEFAULT_TIME_ZONE,
) {
  if (localMinuteOf(now, tz) < OUTCOME_REMINDER_MINUTE) return 0;
  const today = localDateOf(now, tz);
  const open = await prisma.consultation.groupBy({
    by: ["tattooerId"],
    where: {
      status: "SCHEDULED",
      walkIn: false,
      endsAt: { lt: startOfLocalDay(today, tz) },
      lead: { isTest: false },
      tattooer: {
        user: { active: true },
        OR: [{ outcomeReminderOn: null }, { outcomeReminderOn: { not: today } }],
      },
    },
    _count: { _all: true },
  });
  let sent = 0;
  for (const row of open) {
    const profile = await prisma.tattooerProfile.findUnique({
      where: { id: row.tattooerId },
      select: { userId: true },
    });
    if (!profile) continue;
    const n = row._count._all;
    await pushToUsers(prisma, push, [profile.userId], {
      title: n === 1 ? "1 Beratung ohne Ergebnis" : `${n} Beratungen ohne Ergebnis`,
      body: "Bitte kurz eintragen, wie sie gelaufen sind – sonst fehlen sie in der Auswertung.",
      url: "/consultations",
      tag: "missing-outcomes",
    });
    await prisma.tattooerProfile.update({
      where: { id: row.tattooerId },
      data: { outcomeReminderOn: today },
    });
    sent++;
  }
  return sent;
}
