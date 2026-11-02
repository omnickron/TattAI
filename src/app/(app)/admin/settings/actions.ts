"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({
  consentCheckboxKey: z.string().trim().max(200),
  consentText: z.string().trim().max(5000),
});

export async function updateConsentSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const data = {
    consentCheckboxKey: parsed.data.consentCheckboxKey || null,
    consentText: parsed.data.consentText || null,
  };
  await prisma.appSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Gespeichert. Gilt für alle ab jetzt eingehenden Leads." };
}

export async function updateStudioSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const studioAddress =
    String(formData.get("studioAddress") ?? "")
      .trim()
      .slice(0, 500) || null;
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { studioAddress },
    create: { id: 1, studioAddress },
  });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Gespeichert. Gilt für neue Kalendereinträge." };
}
