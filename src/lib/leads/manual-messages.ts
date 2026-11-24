/**
 * Contacts handled by hand ("Manuell betreut" = bot off in the chat): a new customer
 * message is shown once in the app (until someone opens the contact) and pushed to the
 * admins and – if the customer already has one – the responsible tattooer.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { activeAdminIds, pushToUsers, type PushSender } from "../push";

/** Unread messages from contacts handled by hand (admin: all, tattooer: own customers). */
export function manualUnreadWhere(scope: {
  isAdmin: boolean;
  tattooerId: string | null;
}): Prisma.LeadWhereInput {
  return {
    isTest: false,
    manualUnreadAt: { not: null },
    ...(scope.isAdmin
      ? {}
      : { consultations: { some: { tattooerId: scope.tattooerId ?? "__none__" } } }),
  };
}

export async function loadManualUnread(
  prisma: Pick<PrismaClient, "lead">,
  scope: { isAdmin: boolean; tattooerId: string | null },
  take = 10,
) {
  return prisma.lead.findMany({
    where: manualUnreadWhere(scope),
    orderBy: { manualUnreadAt: "desc" },
    take,
    select: {
      id: true,
      name: true,
      manualUnreadAt: true,
      messages: {
        where: { direction: "INBOUND" },
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { body: true },
      },
    },
  });
}

/** Recipients: active admins and the tattooer of the customer's latest consultation. */
export async function manualMessageRecipients(
  prisma: Pick<PrismaClient, "user" | "consultation">,
  leadId: string,
) {
  const [admins, latest] = await Promise.all([
    activeAdminIds(prisma),
    prisma.consultation.findFirst({
      where: { leadId, status: { not: "CANCELLED" } },
      orderBy: { startsAt: "desc" },
      select: { tattooer: { select: { userId: true, user: { select: { active: true } } } } },
    }),
  ]);
  const ids = new Set(admins);
  if (latest?.tattooer.user.active) ids.add(latest.tattooer.userId);
  return [...ids];
}

/**
 * Called for every new inbound message: marks it unread and pushes (unless switched off
 * in the settings). Never throws on push errors.
 */
export async function notifyManualMessage(
  prisma: PrismaClient,
  lead: { id: string; name: string; botEnabled: boolean; isTest: boolean },
  text: string,
  now: Date,
  push?: PushSender,
) {
  if (lead.botEnabled || lead.isTest) return false;
  await prisma.lead.update({ where: { id: lead.id }, data: { manualUnreadAt: now } });
  if (!push) return true;
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: 1 },
      select: { pushManualMessages: true },
    });
    if (settings && !settings.pushManualMessages) return true;
    const recipients = await manualMessageRecipients(prisma, lead.id);
    await pushToUsers(prisma, push, recipients, {
      title: `Neue Nachricht von ${lead.name}`,
      body: text.slice(0, 140),
      url: `/leads/${lead.id}#chat`,
      // Several messages in a row replace each other on the phone
      tag: `manual-${lead.id}`,
    });
  } catch (err) {
    console.error("[manual-messages] push failed:", err);
  }
  return true;
}
