"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireOperator } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const percent = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "")
    .trim()
    .replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : NaN;
};

/** Operator only: commission, VAT and the issuer details printed on the invoices. */
export async function updateBillingSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireOperator();
  const commissionBps = percent(formData.get("commission"));
  const vatBps = percent(formData.get("vat"));
  if (Number.isNaN(commissionBps) || Number.isNaN(vatBps))
    return { ok: false, message: "Provision und Steuersatz bitte als Prozent zwischen 0 und 100." };
  const daysRaw = String(formData.get("paymentDays") ?? "").trim();
  const paymentDays = daysRaw ? Number(daysRaw) : null;
  if (
    paymentDays !== null &&
    (!Number.isInteger(paymentDays) || paymentDays < 0 || paymentDays > 90)
  )
    return { ok: false, message: "Zahlungsziel bitte in Tagen (0–90)." };
  const text = (k: string, max: number) =>
    String(formData.get(k) ?? "")
      .replace(/\r\n/g, "\n")
      .trim()
      .slice(0, max) || null;
  const iban = text("issuerIban", 42)?.toUpperCase() ?? null;
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9 ]{11,32}$/.test(iban))
    return {
      ok: false,
      message: "Die IBAN sieht nicht gültig aus (z. B. DE12 3456 7890 1234 5678 90).",
    };
  const email = text("issuerEmail", 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, message: "Die E-Mail-Adresse sieht nicht gültig aus." };

  const data = {
    commissionBps,
    vatBps,
    paymentDays,
    issuerName: text("issuerName", 200),
    issuerAddress: text("issuerAddress", 500),
    issuerTaxId: text("issuerTaxId", 50),
    issuerIban: iban,
    issuerEmail: email,
    updatedById: user.id,
  };
  await prisma.billingSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  revalidatePath("/operator");
  revalidatePath("/admin/billing");
  return { ok: true, message: "Rechnungsdaten gespeichert. Gilt für neue Rechnungen." };
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
  await requireOperator();
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
  revalidatePath("/operator");
  revalidatePath("/admin/bot");
  return { ok: true, message: "Grenzen gespeichert." };
}

/** Pauses the bot for all chats, or lets it run again after a pause. */
export async function setBotPaused(paused: boolean): Promise<void> {
  const user = await requireOperator();
  const data = paused
    ? { pausedAt: new Date(), pausedReason: `von Hand (${user.name})` }
    : { pausedAt: null, pausedReason: null };
  await prisma.botSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/operator");
  revalidatePath("/admin/bot");
}
