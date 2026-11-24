"use server";

import { rm } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { voiceFilePath } from "@/lib/whatsapp/voice";

const PATH = "/admin/whatsapp/voice";

export async function deleteVoiceMemo(id: string): Promise<ActionState> {
  await requireAdmin();
  const memo = await prisma.voiceMemo.findUnique({ where: { id } });
  if (!memo) return { ok: false, message: "Nicht gefunden." };
  await prisma.voiceMemo.delete({ where: { id } });
  await rm(voiceFilePath(memo.storagePath), { force: true }).catch(() => undefined);
  revalidatePath(PATH);
  return { ok: true, message: "Sprachnachricht gelöscht." };
}

/** Voice memo sent automatically when a customer replies for the first time. */
export async function setFirstReplyVoiceMemo(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = String(formData.get("voiceMemoId") ?? "");
  if (id && !(await prisma.voiceMemo.findUnique({ where: { id } })))
    return { ok: false, message: "Sprachnachricht nicht gefunden." };
  await prisma.messagingSettings.upsert({
    where: { id: 1 },
    update: { firstReplyVoiceMemoId: id || null },
    create: { id: 1, firstReplyVoiceMemoId: id || null },
  });
  revalidatePath(PATH);
  return {
    ok: true,
    message: id
      ? "Gespeichert: Diese Sprachnachricht geht ab jetzt nach der ersten Antwort eines Kunden raus."
      : "Gespeichert: Nach der ersten Antwort wird keine Sprachnachricht mehr verschickt.",
  };
}

/** What is said in the recording (read by the bot), also for memos already sent. */
export async function updateVoiceMemoTranscript(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const transcript = String(formData.get("transcript") ?? "")
    .trim()
    .slice(0, 2000);
  await prisma.voiceMemo.update({ where: { id }, data: { transcript: transcript || null } });
  revalidatePath(PATH);
  return { ok: true, message: "Gespeichert – der Bot kennt jetzt den Inhalt." };
}
