/**
 * The bot hands a chat over to a person: bot off in this chat, reason on the lead
 * ("Braucht euch" list) and a push to whoever is responsible – the tattooer of the
 * upcoming consultation, otherwise the admins.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { activeAdminIds, pushToUsers, type PushSender } from "../push";
import { setBotEnabled } from "./state";

export async function handOverChat(
  deps: { prisma: PrismaClient; push?: PushSender },
  leadId: string,
  reason: string,
  now: Date,
) {
  const { prisma } = deps;
  await setBotEnabled(prisma, leadId, false, { reason: "BOT_HANDOVER", now });
  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { botHandoverNote: reason.slice(0, 500), botHandoverAt: now },
    select: {
      name: true,
      consultations: {
        where: { status: "SCHEDULED", endsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        take: 1,
        select: { tattooer: { select: { userId: true, user: { select: { active: true } } } } },
      },
    },
  });
  if (!deps.push) return;
  const t = lead.consultations[0]?.tattooer;
  const recipients = t?.user.active ? [t.userId] : await activeAdminIds(prisma);
  await pushToUsers(prisma, deps.push, recipients, {
    title: `${lead.name} braucht euch`,
    body: reason.slice(0, 140),
    url: `/leads/${leadId}`,
    tag: `handover-${leadId}`,
  });
}

/** Chats the bot handed over that nobody has picked up yet (visible for the user). */
export async function loadHandovers(
  prisma: Pick<PrismaClient, "lead">,
  scope: { isAdmin: boolean; tattooerId: string | null },
  take = 10,
) {
  return prisma.lead.findMany({
    where: {
      isTest: false,
      botEnabled: false,
      botDisabledReason: "BOT_HANDOVER",
      ...(scope.isAdmin
        ? {}
        : { consultations: { some: { tattooerId: scope.tattooerId ?? "__none__" } } }),
    },
    orderBy: { botHandoverAt: "desc" },
    take,
    select: { id: true, name: true, botHandoverNote: true, botHandoverAt: true },
  });
}
