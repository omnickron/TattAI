/**
 * Follow-ups: after a consultation the customer is interested but undecided; the tattooer
 * picks a day to contact them again. On that day (09:00) they get a push and the customer
 * shows up under "Heute nachfassen" until a new outcome is entered or it is marked done.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { pushToUsers, type PushSender } from "../push";
import { addDays, DEFAULT_TIME_ZONE, localDateOf, startOfLocalDay } from "../time";

/** Open follow-ups due until the end of today (overdue ones included). */
export function dueFollowUpWhere(
  now: Date,
  scope: { isAdmin: boolean; tattooerId: string | null },
  tz = DEFAULT_TIME_ZONE,
): Prisma.ConsultationWhereInput {
  const endOfToday = startOfLocalDay(addDays(localDateOf(now, tz), 1), tz);
  return {
    status: "HELD",
    tattooBooked: null,
    followUpAt: { lt: endOfToday },
    followUpDoneAt: null,
    // Nothing to do when the customer has booked again in the meantime
    lead: {
      isTest: false,
      consultations: { none: { status: "SCHEDULED", endsAt: { gt: now } } },
    },
    ...(scope.isAdmin ? {} : { tattooerId: scope.tattooerId ?? "__none__" }),
  };
}

export async function loadDueFollowUps(
  prisma: Pick<PrismaClient, "consultation">,
  scope: { isAdmin: boolean; tattooerId: string | null },
  now = new Date(),
  tz = DEFAULT_TIME_ZONE,
) {
  return prisma.consultation.findMany({
    where: dueFollowUpWhere(now, scope, tz),
    orderBy: { followUpAt: "asc" },
    take: 20,
    select: {
      id: true,
      followUpAt: true,
      outcomeNote: true,
      lead: { select: { id: true, name: true, phoneE164: true } },
      tattooer: { select: { user: { select: { name: true } } } },
    },
  });
}

export async function markFollowUpDone(
  prisma: Pick<PrismaClient, "consultation">,
  consultationId: string,
  now = new Date(),
) {
  await prisma.consultation.updateMany({
    where: { id: consultationId, followUpDoneAt: null },
    data: { followUpDoneAt: now },
  });
}

/** Worker: push "Heute nachfassen" to the tattooer once, when the follow-up is due. */
export async function notifyDueFollowUps(
  prisma: Pick<PrismaClient, "consultation" | "pushSubscription">,
  push: PushSender,
  now = new Date(),
) {
  const due = await prisma.consultation.findMany({
    where: {
      status: "HELD",
      tattooBooked: null,
      followUpAt: { lte: now },
      followUpDoneAt: null,
      followUpNotifiedAt: null,
      lead: {
        isTest: false,
        consultations: { none: { status: "SCHEDULED", endsAt: { gt: now } } },
      },
    },
    take: 50,
    select: {
      id: true,
      outcomeNote: true,
      lead: { select: { id: true, name: true } },
      tattooer: { select: { userId: true } },
    },
  });
  for (const c of due) {
    await pushToUsers(prisma, push, [c.tattooer.userId], {
      title: `Heute nachfassen: ${c.lead.name}`,
      body:
        c.outcomeNote?.slice(0, 140) || "Kunde wollte sich noch überlegen – bitte kontaktieren.",
      url: `/leads/${c.lead.id}`,
      tag: `follow-up-${c.id}`,
    });
    await prisma.consultation.update({
      where: { id: c.id },
      data: { followUpNotifiedAt: now },
    });
  }
  return due.length;
}
