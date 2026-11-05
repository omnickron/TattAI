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
    const raw = Object.fromEntries(
      LINK_FIELDS.map(({ key }) => [key, normalizeLink(String(formData.get(key) ?? ""))]),
    );
    const links = parseLinks(raw);
    const bad = LINK_FIELDS.find(({ key }) => raw[key] && !links[key]);
    if (bad)
      return {
        ok: false,
        message: `${bad.label}: bitte eine vollständige Adresse mit https:// angeben (z. B. https://www.euer-studio.de).`,
      };
    data.links = links as Prisma.InputJsonValue;
  } else if (section.list) {
    let items: unknown = [];
    try {
      items = JSON.parse(String(formData.get("items") ?? "[]"));
    } catch {
      return { ok: false, message: "Die Liste konnte nicht gelesen werden." };
    }
    const incomplete = Array.isArray(items)
      ? items.filter(
          (x: { q?: string; a?: string }) => Boolean(x?.q?.trim()) !== Boolean(x?.a?.trim()),
        )
      : [];
    if (incomplete.length)
      return {
        ok: false,
        message: `${incomplete.length} Eintrag${incomplete.length === 1 ? "" : "e"} unvollständig – bitte Frage und Antwort ausfüllen oder den Eintrag entfernen.`,
      };
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
        ok: true,
        warning: true,
        message: `Gespeichert – Hinweis: Hier steht eine Preisangabe („${warnings[0]}“). Der Bot nennt nie Preise, bitte entfernen.`,
      }
    : { ok: true, message: `„${section.title}“ gespeichert.` };
}

/** "www.studio.de" → "https://www.studio.de"; http is upgraded, everything else kept as typed. */
function normalizeLink(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^http:\/\//i.test(v)) return v.replace(/^http:/i, "https:");
  if (!/^[a-z]+:/i.test(v) && /^[\w-]+(\.[\w-]+)+/.test(v)) return `https://${v}`;
  return v;
}

const intField = (formData: FormData, name: string, min: number, max: number) => {
  const n = Number(String(formData.get(name) ?? "").trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const euroField = (formData: FormData, name: string) => {
  const raw = String(formData.get(name) ?? "")
    .trim()
    .replace(",", ".");
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n * 100) : null;
};

/** Limits and cost brake of the built-in bot. */
export async function updateBotSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const data = {
    maxPerHourPerLead: intField(formData, "maxPerHourPerLead", 1, 500),
    maxPerDayPerLead: intField(formData, "maxPerDayPerLead", 1, 2000),
    maxPerDayTotal: intField(formData, "maxPerDayTotal", 1, 100_000),
    dailyBudgetCents: euroField(formData, "dailyBudget"),
    monthlyBudgetCents: euroField(formData, "monthlyBudget"),
  };
  if (Object.values(data).some((v) => v === null))
    return { ok: false, message: "Bitte alle Felder mit gültigen Zahlen füllen." };
  const valid = data as { [K in keyof typeof data]: number };
  if (valid.maxPerHourPerLead > valid.maxPerDayPerLead)
    return { ok: false, message: "Das Stundenlimit darf nicht über dem Tageslimit liegen." };
  if (valid.dailyBudgetCents > valid.monthlyBudgetCents)
    return { ok: false, message: "Das Tageslimit darf nicht über dem Monatslimit liegen." };
  await prisma.botSettings.upsert({ where: { id: 1 }, update: valid, create: { id: 1, ...valid } });
  revalidatePath("/admin/bot");
  return { ok: true, message: "Grenzen gespeichert." };
}

/** Pauses the bot for all chats, or lets it run again after a pause. */
export async function setBotPaused(paused: boolean): Promise<void> {
  const user = await requireAdmin();
  const data = paused
    ? { pausedAt: new Date(), pausedReason: `von Hand (${user.name})` }
    : { pausedAt: null, pausedReason: null };
  await prisma.botSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/admin/bot");
}
