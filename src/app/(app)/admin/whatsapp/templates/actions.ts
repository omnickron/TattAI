"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createWhatsAppClient, WhatsAppApiError } from "@/lib/whatsapp/client";
import {
  ALLOWED_VARIABLES,
  compileTemplate,
  isValidTemplateName,
} from "@/lib/whatsapp/template-text";
import { submitTemplateForReview, TemplateError } from "@/lib/whatsapp/templates";

const PATH = "/admin/whatsapp/templates";

const createSchema = z.object({
  purpose: z.enum(["FIRST_CONTACT", "FOLLOW_UP", "REMINDER", "AFTER_CONSULTATION"]),
  name: z.string().trim().toLowerCase(),
  category: z.enum(["UTILITY", "MARKETING"]),
  bodyText: z.string(),
});

export async function createTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Bitte alle Felder ausfüllen." };
  const { purpose, name, category, bodyText } = parsed.data;
  if (!isValidTemplateName(name)) {
    return {
      ok: false,
      message: "Name: nur Kleinbuchstaben, Ziffern und Unterstrich (z. B. erstkontakt).",
    };
  }
  const compiled = compileTemplate(bodyText, ALLOWED_VARIABLES[purpose]);
  if (!compiled.ok) return { ok: false, message: compiled.error };
  let created: { id: string };
  try {
    created = await prisma.whatsAppTemplate.create({
      data: { purpose, name, category, bodyText: bodyText.trim() },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, message: "Ein Template mit diesem Namen gibt es schon." };
    }
    throw err;
  }
  revalidatePath(PATH);
  // Fresh page (resets the form) and jump to the new template.
  redirect(`${PATH}?created=${created.id}#template-${created.id}`);
}

export async function updateTemplateText(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const t = await prisma.whatsAppTemplate.findUnique({ where: { id } });
  if (!t) return { ok: false, message: "Template nicht gefunden." };
  if (t.status === "PENDING")
    return {
      ok: false,
      message: "Während der Prüfung bei Meta kann der Text nicht geändert werden.",
    };
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const category = formData.get("category") === "MARKETING" ? "MARKETING" : "UTILITY";
  const compiled = compileTemplate(bodyText, ALLOWED_VARIABLES[t.purpose]);
  if (!compiled.ok) return { ok: false, message: compiled.error };
  await prisma.whatsAppTemplate.update({ where: { id }, data: { bodyText, category } });
  revalidatePath(PATH);
  return {
    ok: true,
    message: t.approvedText
      ? "Gespeichert. Bis die neue Fassung genehmigt ist, wird die bisherige verschickt – bitte einreichen."
      : "Gespeichert.",
  };
}

export async function submitTemplate(id: string): Promise<ActionState> {
  await requireAdmin();
  try {
    const t = await submitTemplateForReview(prisma, createWhatsAppClient(), id);
    revalidatePath(PATH);
    return {
      ok: true,
      message:
        t.status === "APPROVED"
          ? "Eingereicht und genehmigt."
          : "Bei Meta eingereicht. Die Prüfung dauert meist Minuten bis Stunden.",
    };
  } catch (err) {
    if (err instanceof TemplateError || err instanceof WhatsAppApiError)
      return { ok: false, message: err.message };
    throw err;
  }
}

export async function deleteTemplate(id: string): Promise<ActionState> {
  await requireAdmin();
  const t = await prisma.whatsAppTemplate.findUnique({
    where: { id },
    include: {
      _count: { select: { followUpSteps: true, reminderRules: true, outboundMessages: true } },
    },
  });
  if (!t) return { ok: false, message: "Template nicht gefunden." };
  const settings = await prisma.messagingSettings.findUnique({ where: { id: 1 } });
  if (
    t._count.followUpSteps ||
    t._count.reminderRules ||
    t._count.outboundMessages ||
    settings?.firstContactTemplateId === id ||
    settings?.secondMessageTemplateId === id
  ) {
    return { ok: false, message: "Das Template wird verwendet und kann nicht gelöscht werden." };
  }
  await prisma.whatsAppTemplate.delete({ where: { id } });
  revalidatePath(PATH);
  return { ok: true, message: "Gelöscht." };
}
