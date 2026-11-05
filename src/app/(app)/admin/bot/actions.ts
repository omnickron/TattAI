"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/session";
import { LINK_FIELDS, parseLinks, parseQAList, priceMentions, SECTIONS } from "@/lib/bot/knowledge";
import { prisma } from "@/lib/db";

/** Saves one section of the bot knowledge. Price mentions are saved but flagged. */
export async function saveKnowledgeSection(
  sectionKey: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  const section = SECTIONS.find((s) => s.key === sectionKey);
  if (!section) return { ok: false, message: "Unbekannter Bereich." };

  const data: Prisma.BotKnowledgeUncheckedUpdateInput = { updatedById: user.id };
  const warnings: string[] = [];
  if (section.fields) {
    for (const f of section.fields) {
      const raw = String(formData.get(f.name) ?? "")
        .replace(/\r\n/g, "\n")
        .trim();
      if (raw.length > f.max)
        return { ok: false, message: `${f.label}: höchstens ${f.max} Zeichen.` };
      data[f.name] = raw || null;
      warnings.push(...priceMentions(raw));
    }
  } else if (section.links) {
    const links = parseLinks(
      Object.fromEntries(LINK_FIELDS.map(({ key }) => [key, String(formData.get(key) ?? "")])),
    );
    const given = LINK_FIELDS.filter(({ key }) => String(formData.get(key) ?? "").trim());
    if (given.length > Object.keys(links).length)
      return { ok: false, message: "Links müssen mit https:// beginnen." };
    data.links = links as Prisma.InputJsonValue;
  } else if (section.list) {
    let items: unknown = [];
    try {
      items = JSON.parse(String(formData.get("items") ?? "[]"));
    } catch {
      return { ok: false, message: "Die Liste konnte nicht gelesen werden." };
    }
    const list = parseQAList(items);
    data[section.list] = list as unknown as Prisma.InputJsonValue;
    for (const qa of list) warnings.push(...priceMentions(qa.a));
  }

  await prisma.botKnowledge.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...(data as Prisma.BotKnowledgeUncheckedCreateInput) },
  });
  revalidatePath("/admin/bot");
  return warnings.length
    ? {
        ok: false,
        message: `Gespeichert – aber hier steht eine Preisangabe: „${warnings[0]}“. Der Bot nennt nie Preise, bitte entfernen.`,
      }
    : { ok: true, message: `„${section.title}“ gespeichert.` };
}
