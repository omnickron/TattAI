"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { leadScope, requireAdmin, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { LEAD_STATUS_ORDER } from "@/lib/labels";
import { normalizePhone } from "@/lib/phone";
import { defaultPhoneCountry } from "@/lib/settings";

const leadSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt.").max(200),
  phone: z.string().trim().max(50),
  email: z.union([z.literal(""), z.email("E-Mail-Adresse ist ungültig.").trim().max(200)]),
  status: z.enum(LEAD_STATUS_ORDER as [string, ...string[]]),
});

export async function updateLead(
  leadId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { name, phone, email, status } = parsed.data;
  const current = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!current) return { ok: false, message: "Lead nicht gefunden." };

  const normalized = normalizePhone(phone, defaultPhoneCountry());
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      name,
      phoneRaw: normalized.raw || null,
      phoneE164: normalized.e164,
      phoneValid: normalized.valid,
      email: email ? email.toLowerCase() : null,
      status: status as (typeof LEAD_STATUS_ORDER)[number],
      ...(current.status !== status ? { statusChangedAt: new Date() } : {}),
    },
  });
  revalidatePath(`/leads/${leadId}`);
  return {
    ok: true,
    message:
      normalized.valid || !phone
        ? "Gespeichert."
        : "Gespeichert. Hinweis: Telefonnummer ist ungültig.",
  };
}

const noteSchema = z.object({ body: z.string().trim().min(1, "Notiz ist leer.").max(5000) });

export async function addLeadNote(
  leadId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const lead = await prisma.lead.findFirst({
    where: { AND: [leadScope(user), { id: leadId }] },
    select: { id: true },
  });
  if (!lead) return { ok: false, message: "Kein Zugriff auf diesen Lead." };

  await prisma.leadNote.create({ data: { leadId, authorId: user.id, body: parsed.data.body } });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, message: "Notiz gespeichert." };
}

/** Permanently deletes a lead incl. notes, messages and consultations (GDPR). */
export async function deleteLead(leadId: string): Promise<ActionState> {
  await requireAdmin();
  await prisma.lead.delete({ where: { id: leadId } }).catch(() => null);
  revalidatePath("/leads");
  redirect("/leads");
}
