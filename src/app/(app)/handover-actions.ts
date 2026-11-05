"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { leadScope, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * A person took care of a chat the bot handed over (e.g. called the customer): it leaves
 * the "Braucht euch" list, the bot stays off, and a note records who did it.
 */
export async function resolveHandover(leadId: string): Promise<ActionState> {
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({
    where: { AND: [leadScope(user), { id: leadId }] },
    select: { id: true, botEnabled: true, botDisabledReason: true, botHandoverNote: true },
  });
  if (!lead) return { ok: false, message: "Kunde nicht gefunden." };
  if (lead.botEnabled || lead.botDisabledReason !== "BOT_HANDOVER")
    return { ok: true, message: "Schon erledigt." };
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: { botDisabledReason: "HUMAN_TAKEOVER", botDisabledById: user.id },
    }),
    prisma.leadNote.create({
      data: {
        leadId: lead.id,
        authorId: user.id,
        body: `Übergabe vom Bot erledigt${lead.botHandoverNote ? ` (${lead.botHandoverNote})` : ""}. Der Bot bleibt in diesem Chat aus.`,
      },
    }),
  ]);
  revalidatePath("/");
  revalidatePath(`/leads/${lead.id}`);
  return { ok: true, message: "Erledigt." };
}
