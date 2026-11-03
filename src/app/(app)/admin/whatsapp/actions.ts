"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isLocalDate, parseTimeOfDay } from "@/lib/time";
import { loadMessagingSettings, pauseSending } from "@/lib/whatsapp/messaging";
import { parseSendTimes } from "@/lib/whatsapp/throttle";

const ok = (message: string): ActionState => {
  revalidatePath("/admin/whatsapp");
  return { ok: true, message };
};

export async function setSendingEnabled(enabled: boolean): Promise<ActionState> {
  await requireAdmin();
  await loadMessagingSettings(prisma);
  await prisma.messagingSettings.update({ where: { id: 1 }, data: { sendingEnabled: enabled } });
  return ok(
    enabled ? "Automatischer Versand eingeschaltet." : "Automatischer Versand ausgeschaltet.",
  );
}

export async function pauseSendingAction(): Promise<ActionState> {
  await requireAdmin();
  await pauseSending(prisma, "Manuell pausiert");
  return ok("Versand pausiert.");
}

export async function resumeSending(): Promise<ActionState> {
  await requireAdmin();
  await prisma.messagingSettings.update({
    where: { id: 1 },
    data: { pausedAt: null, pausedReason: null },
  });
  return ok("Versand wird fortgesetzt.");
}

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const settingsSchema = z
  .object({
    batchWindowMinutes: int(5, 600),
    maxPerBatch: int(1, 1000),
    maxPerDay: int(1, 10000),
    minGapSeconds: int(5, 3600),
    maxGapSeconds: int(5, 3600),
    warmupStartDate: z.string().optional().default(""),
    warmupStartPerDay: int(1, 10000),
    warmupIncreasePerDay: int(0, 10000),
    noResponseAfterHours: int(1, 24 * 30),
    firstContactTemplateId: z.string().optional().default(""),
  })
  .refine((v) => v.maxGapSeconds >= v.minGapSeconds, {
    message: "Der maximale Abstand muss ≥ dem minimalen sein.",
  });

export async function updateMessagingSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;

  // Send times: one text field per weekday, e.g. "10:00, 13:00, 17:00"
  const raw: Array<{ weekday: number; time: string }> = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    const value = String(formData.get(`times_${weekday}`) ?? "");
    for (const part of value.split(/[,;\s]+/).filter(Boolean)) {
      if (parseTimeOfDay(part) === null)
        return { ok: false, message: `Ungültige Uhrzeit „${part}“.` };
      raw.push({ weekday, time: part });
    }
  }
  if (v.warmupStartDate && !isLocalDate(v.warmupStartDate))
    return { ok: false, message: "Ungültiges Startdatum." };
  if (v.firstContactTemplateId) {
    const t = await prisma.whatsAppTemplate.findFirst({
      where: { id: v.firstContactTemplateId, purpose: "FIRST_CONTACT" },
    });
    if (!t) return { ok: false, message: "Template für den Erstkontakt nicht gefunden." };
  }

  await loadMessagingSettings(prisma);
  await prisma.messagingSettings.update({
    where: { id: 1 },
    data: {
      ...v,
      sendTimes: parseSendTimes(raw) as unknown as Prisma.InputJsonValue,
      warmupStartDate: v.warmupStartDate ? new Date(`${v.warmupStartDate}T00:00:00Z`) : null,
      firstContactTemplateId: v.firstContactTemplateId || null,
    },
  });
  return ok("Gespeichert.");
}

export async function addFollowUpStep(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const delayHours = Number(formData.get("delayHours"));
  const templateId = String(formData.get("templateId") ?? "");
  if (!Number.isInteger(delayHours) || delayHours < 1 || delayHours > 24 * 30) {
    return { ok: false, message: "Wartezeit: 1 bis 720 Stunden." };
  }
  const t = await prisma.whatsAppTemplate.findFirst({
    where: { id: templateId, purpose: "FOLLOW_UP" },
  });
  if (!t) return { ok: false, message: "Bitte ein Nachfass-Template wählen." };
  const count = await prisma.followUpStep.count();
  await prisma.followUpStep.create({ data: { position: count + 1, delayHours, templateId } });
  return ok("Schritt hinzugefügt.");
}

export async function deleteFollowUpStep(id: string): Promise<ActionState> {
  await requireAdmin();
  await prisma.$transaction(async (tx) => {
    await tx.followUpStep.delete({ where: { id } });
    const rest = await tx.followUpStep.findMany({ orderBy: { position: "asc" } });
    // Renumber in two passes to avoid unique conflicts.
    for (const [i, s] of rest.entries())
      await tx.followUpStep.update({ where: { id: s.id }, data: { position: 1000 + i } });
    for (const [i, s] of rest.entries())
      await tx.followUpStep.update({ where: { id: s.id }, data: { position: i + 1 } });
  });
  return ok("Schritt entfernt.");
}

export async function addReminderRule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const hoursBefore = Number(formData.get("hoursBefore"));
  const templateId = String(formData.get("templateId") ?? "");
  if (!Number.isInteger(hoursBefore) || hoursBefore < 1 || hoursBefore > 24 * 14) {
    return { ok: false, message: "Abstand: 1 bis 336 Stunden vor dem Termin." };
  }
  const t = await prisma.whatsAppTemplate.findFirst({
    where: { id: templateId, purpose: "REMINDER" },
  });
  if (!t) return { ok: false, message: "Bitte ein Erinnerungs-Template wählen." };
  if (await prisma.reminderRule.findUnique({ where: { hoursBefore } })) {
    return { ok: false, message: "Für diesen Abstand gibt es schon eine Erinnerung." };
  }
  await prisma.reminderRule.create({ data: { hoursBefore, templateId } });
  return ok("Erinnerung hinzugefügt.");
}

export async function deleteReminderRule(id: string): Promise<ActionState> {
  await requireAdmin();
  await prisma.reminderRule.delete({ where: { id } });
  return ok("Erinnerung entfernt.");
}

export async function cancelOutbound(id: string): Promise<ActionState> {
  await requireAdmin();
  await prisma.outboundMessage.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "CANCELLED" },
  });
  return ok("Nachricht aus der Warteschlange entfernt.");
}

export async function setBotGloballyEnabled(enabled: boolean): Promise<ActionState> {
  await requireAdmin();
  await loadMessagingSettings(prisma);
  await prisma.messagingSettings.update({
    where: { id: 1 },
    data: { botGloballyEnabled: enabled },
  });
  return ok(
    enabled
      ? "Bot für alle Chats eingeschaltet (außer übernommene)."
      : "Bot für alle Chats ausgeschaltet.",
  );
}

const AFTER_CONDITIONS = ["HELD", "TATTOO_BOOKED", "UNDECIDED", "NO_TATTOO", "NO_SHOW"] as const;

export async function addAfterRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const hoursAfter = Number(formData.get("hoursAfter"));
  const condition = String(formData.get("condition") ?? "") as (typeof AFTER_CONDITIONS)[number];
  const templateId = String(formData.get("templateId") ?? "");
  if (!Number.isInteger(hoursAfter) || hoursAfter < 0 || hoursAfter > 24 * 30) {
    return { ok: false, message: "Abstand: 0 bis 720 Stunden nach der Beratung." };
  }
  if (!AFTER_CONDITIONS.includes(condition))
    return { ok: false, message: "Bitte einen Anlass wählen." };
  const t = await prisma.whatsAppTemplate.findFirst({
    where: { id: templateId, purpose: "AFTER_CONSULTATION" },
  });
  if (!t) return { ok: false, message: "Bitte ein Template „Nach dem Termin“ wählen." };
  if (
    await prisma.afterConsultationRule.findUnique({
      where: { hoursAfter_condition: { hoursAfter, condition } },
    })
  ) {
    return { ok: false, message: "Diese Nachricht gibt es für diesen Anlass und Abstand schon." };
  }
  await prisma.afterConsultationRule.create({ data: { hoursAfter, condition, templateId } });
  return ok("Nachricht nach dem Termin hinzugefügt.");
}

export async function deleteAfterRule(id: string): Promise<ActionState> {
  await requireAdmin();
  await prisma.$transaction([
    prisma.outboundMessage.updateMany({
      where: { afterRuleId: id, status: "QUEUED" },
      data: { status: "CANCELLED" },
    }),
    prisma.afterConsultationRule.delete({ where: { id } }),
  ]);
  return ok("Nachricht nach dem Termin entfernt.");
}
