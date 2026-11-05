"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { isOperator } from "@/lib/auth/operator";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { TEAMUP_PREFIX } from "@/lib/google/calendar";
import { createTeamupClient } from "@/lib/google/client";
import { moveUpcomingEntries } from "@/lib/scheduling/calendar-switch";
import { schedulingDeps } from "@/lib/scheduling/deps";

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
  const studioName =
    String(formData.get("studioName") ?? "")
      .trim()
      .slice(0, 100) || null;
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { studioAddress, studioName },
    create: { id: 1, studioAddress, studioName },
  });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Gespeichert. Gilt für neue Kalendereinträge und Nachrichten." };
}

/** TeamUp: sub-calendar for the app's entries and the "Artist" field. */
export async function updateTeamupSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const subcalendarId = String(formData.get("teamupSubcalendarId") ?? "").trim();
  const fieldId = String(formData.get("teamupArtistFieldId") ?? "").trim();
  if (!subcalendarId || !fieldId)
    return { ok: false, message: "Bitte Unterkalender und Artist-Feld auswählen." };

  const client = createTeamupClient();
  let subcalendarName: string;
  let fieldName: string;
  try {
    const [subcalendars, fields] = await Promise.all([
      client.listSubcalendars(),
      client.listFields(),
    ]);
    const sub = subcalendars.find((s) => s.id === subcalendarId);
    const field = fields.find((f) => f.id === fieldId);
    if (!sub || !field) return { ok: false, message: "Auswahl nicht (mehr) in TeamUp vorhanden." };
    subcalendarName = sub.name;
    fieldName = field.name;
  } catch (err) {
    return {
      ok: false,
      message: `TeamUp ist nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const before = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const data = {
    teamupSubcalendarId: subcalendarId,
    teamupSubcalendarName: subcalendarName,
    teamupArtistFieldId: fieldId,
    teamupArtistFieldName: fieldName,
  };
  await prisma.appSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });

  let note = "";
  const teamupProfiles = await prisma.tattooerProfile.findMany({
    where: { calendarProvider: "TEAMUP", teamupConnectedAt: { not: null } },
    select: { id: true },
  });
  if (
    before?.teamupArtistFieldId &&
    before.teamupArtistFieldId !== fieldId &&
    teamupProfiles.length
  ) {
    // Artist values of another field no longer match: everyone picks their artist again
    await prisma.tattooerProfile.updateMany({
      where: { id: { in: teamupProfiles.map((p) => p.id) } },
      data: { teamupConnectedAt: null, teamupArtist: null, teamupArtistLabel: null },
    });
    note = ` Das Artist-Feld wurde geändert: ${teamupProfiles.length} Tätowierer müssen ihren Artist unter „Verfügbarkeit“ neu wählen.`;
  } else if (before?.teamupSubcalendarId && before.teamupSubcalendarId !== subcalendarId) {
    const deps = schedulingDeps();
    await prisma.tattooerProfile.updateMany({
      where: { calendarProvider: "TEAMUP" },
      data: { consultationCalendarId: `${TEAMUP_PREFIX}${subcalendarId}` },
    });
    for (const p of teamupProfiles) await moveUpcomingEntries(deps, p.id);
    note = " Anstehende Termine wurden in den neuen Unterkalender verschoben.";
  }
  revalidatePath("/admin/settings");
  revalidatePath("/availability");
  return { ok: true, message: `TeamUp gespeichert.${note}` };
}

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
  const user = await requireAdmin();
  if (!isOperator(user))
    return { ok: false, message: "Nur der Betreiber von NEEDL kann die Rechnungsdaten ändern." };
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
  revalidatePath("/admin/settings");
  revalidatePath("/admin/billing");
  return { ok: true, message: "Rechnungsdaten gespeichert. Gilt für neue Rechnungen." };
}
