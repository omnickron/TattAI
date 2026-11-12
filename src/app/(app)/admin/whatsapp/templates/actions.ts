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
      _count: {
        select: {
          followUpSteps: true,
          introSteps: true,
          reminderRules: true,
          afterRules: true,
          outboundMessages: true,
        },
      },
    },
  });
  if (!t) return { ok: false, message: "Template nicht gefunden." };
  const settings = await prisma.messagingSettings.findUnique({ where: { id: 1 } });
  const usedBy = [
    settings?.firstContactTemplateId === id && "Erstkontakt",
    t._count.introSteps && "weitere Erstnachrichten",
    t._count.followUpSteps && "Nachfassen",
    t._count.reminderRules && "Erinnerungen",
    t._count.afterRules && "Nachrichten nach dem Termin",
  ].filter(Boolean);
  if (usedBy.length)
    return {
      ok: false,
      message: `Wird noch verwendet (${usedBy.join(", ")}) – dort zuerst entfernen bzw. ein anderes Template wählen.`,
    };
  // Templates are also removed at Meta (all versions); the chat history keeps the sent texts
  if (t.submissionCount) {
    const wa = createWhatsAppClient();
    const names = [...new Set([t.approvedName, t.submittedName].filter(Boolean))] as string[];
    try {
      for (const name of names) await wa.deleteTemplate?.(name);
    } catch (err) {
      return {
        ok: false,
        message:
          `Löschen bei Meta fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`.slice(
            0,
            300,
          ),
      };
    }
  }
  // Sent messages keep their text in the chat history; only the link to the template goes
  if (t._count.outboundMessages) {
    const queued = await prisma.outboundMessage.count({
      where: { templateId: id, status: "QUEUED" },
    });
    if (queued)
      return {
        ok: false,
        message: `${queued} geplante Nachricht(en) nutzen dieses Template noch – bitte warten oder in der Warteschlange entfernen.`,
      };
  }
  await prisma.whatsAppTemplate.delete({ where: { id } });
  revalidatePath(PATH);
  return { ok: true, message: "Gelöscht." };
}
