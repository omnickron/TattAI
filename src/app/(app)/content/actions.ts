"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { canAccessContent, deleteContentFile } from "@/lib/content/storage";
import { prisma } from "@/lib/db";

export async function deleteContentAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item || !canAccessContent(user, item)) return { ok: false, message: "Nicht gefunden." };
  await prisma.contentItem.delete({ where: { id } });
  await deleteContentFile(item.storagePath).catch(() => {});
  revalidatePath("/content");
  return { ok: true, message: "Gelöscht." };
}

export async function toggleSelectedAction(id: string): Promise<ActionState> {
  await requireAdmin();
  const item = await prisma.contentItem.findUnique({ where: { id } });
  if (!item) return { ok: false, message: "Nicht gefunden." };
  await prisma.contentItem.update({ where: { id }, data: { selectedForAd: !item.selectedForAd } });
  revalidatePath("/content");
  return {
    ok: true,
    message: item.selectedForAd ? "Markierung entfernt." : "Für Anzeige markiert.",
  };
}
