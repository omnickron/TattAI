"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
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
  if (!fieldId) return { ok: false, message: "Bitte das Artist-Feld auswählen." };

  const client = createTeamupClient();
  let subcalendarName: string | null = null;
  let fieldName: string;
  try {
    const [subcalendars, fields] = await Promise.all([
      client.listSubcalendars(),
      client.listFields(),
    ]);
    const sub = subcalendarId ? subcalendars.find((s) => s.id === subcalendarId) : null;
    const field = fields.find((f) => f.id === fieldId);
    if ((subcalendarId && !sub) || !field)
      return { ok: false, message: "Auswahl nicht (mehr) in TeamUp vorhanden." };
    subcalendarName = sub?.name ?? null;
    fieldName = field.name;
  } catch (err) {
    return {
      ok: false,
      message: `TeamUp ist nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const before = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const data = {
    teamupSubcalendarId: subcalendarId || null,
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
  } else if (
    subcalendarId &&
    before?.teamupSubcalendarId &&
    before.teamupSubcalendarId !== subcalendarId
  ) {
    // Only tattooers without an own sub-calendar use the default
    const deps = schedulingDeps();
    const usingDefault = await prisma.tattooerProfile.findMany({
      where: { calendarProvider: "TEAMUP", teamupSubcalendarId: null },
      select: { id: true },
    });
    await prisma.tattooerProfile.updateMany({
      where: { id: { in: usingDefault.map((p) => p.id) } },
      data: { consultationCalendarId: `${TEAMUP_PREFIX}${subcalendarId}` },
    });
    for (const p of usingDefault) await moveUpcomingEntries(deps, p.id);
    if (usingDefault.length)
      note =
        " Anstehende Termine ohne eigenen Unterkalender wurden in den neuen Standard verschoben.";
  }
  revalidatePath("/admin/settings");
  revalidatePath("/availability");
  return { ok: true, message: `TeamUp gespeichert.${note}` };
}

/** Consultation forms the studio offers and whether the consultation is free. */
export async function updateConsultationSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const data = {
    consultationOnSite: formData.get("onSite") === "on",
    consultationPhone: formData.get("phone") === "on",
    consultationFree: formData.get("free") === "on",
  };
  if (!data.consultationOnSite && !data.consultationPhone)
    return { ok: false, message: "Mindestens eine Beratungsform muss angeboten werden." };
  await prisma.appSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Gespeichert. Gilt für neue Buchungen und den Bot." };
}
