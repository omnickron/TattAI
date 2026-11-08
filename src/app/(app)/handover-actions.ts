"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { leadScope, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { markFollowUpDone } from "@/lib/outcomes/follow-up";

/**
 * A person confirms that a chat the bot handed over was dealt with: only this removes it
 * from "Braucht euch". The bot's state in the chat is not touched; a note records who.
 */
export async function resolveHandover(leadId: string): Promise<ActionState> {
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({
    where: { AND: [leadScope(user), { id: leadId }] },
    select: { id: true, botHandoverAt: true, botHandoverResolvedAt: true, botHandoverNote: true },
  });
  if (!lead) return { ok: false, message: "Kunde nicht gefunden." };
  if (!lead.botHandoverAt || lead.botHandoverResolvedAt)
    return { ok: true, message: "Schon erledigt." };
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: { botHandoverResolvedAt: new Date(), botHandoverResolvedById: user.id },
    }),
    prisma.leadNote.create({
      data: {
        leadId: lead.id,
        authorId: user.id,
        body: `Übergabe vom Bot erledigt${lead.botHandoverNote ? ` (${lead.botHandoverNote})` : ""}.`,
      },
    }),
  ]);
  revalidatePath("/");
  revalidatePath(`/leads/${lead.id}`);
  return { ok: true, message: "Erledigt." };
}

/** The tattooer contacted the customer of a follow-up (without a new outcome yet). */
export async function completeFollowUp(consultationId: string): Promise<ActionState> {
  const user = await requireUser();
  const c = await prisma.consultation.findFirst({
    where: {
      id: consultationId,
      ...(user.role === "ADMIN" ? {} : { tattooerId: user.tattooerProfile?.id ?? "__none__" }),
    },
    select: { id: true },
  });
  if (!c) return { ok: false, message: "Beratung nicht gefunden." };
  await markFollowUpDone(prisma, c.id);
  revalidatePath("/");
  return { ok: true, message: "Erledigt." };
}
