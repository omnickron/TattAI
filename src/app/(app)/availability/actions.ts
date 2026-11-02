"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireTattooer } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";
import { revokeToken } from "@/lib/google/oauth";
import { addDays, isLocalDate, parseTimeOfDay, zonedTimeToUtc } from "@/lib/time";

const done = (message: string): ActionState => {
  revalidatePath("/availability");
  return { ok: true, message };
};

const durationSchema = z.object({
  consultationMinutes: z.coerce.number().int().min(15).max(180),
  bufferMinutes: z.coerce.number().int().min(0).max(120),
});

export async function updateConsultationSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTattooer();
  const parsed = durationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Bitte gültige Werte wählen." };
  await prisma.tattooerProfile.update({
    where: { id: user.tattooerProfile.id },
    data: parsed.data,
  });
  return done("Gespeichert. Gilt für neue Termine.");
}

const ruleSchema = z.object({
  weekday: z.coerce.number().int().min(1).max(7),
  from: z.string(),
  to: z.string(),
});

export async function addAvailabilityRule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTattooer();
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Bitte Wochentag und Uhrzeiten angeben." };
  const startMinute = parseTimeOfDay(parsed.data.from);
  const endMinute = parseTimeOfDay(parsed.data.to);
  if (startMinute === null || endMinute === null)
    return { ok: false, message: "Uhrzeit ist ungültig." };
  if (endMinute <= startMinute)
    return { ok: false, message: "Das Ende muss nach dem Beginn liegen." };
  const data = {
    tattooerId: user.tattooerProfile.id,
    weekday: parsed.data.weekday,
    startMinute,
    endMinute,
  };
  if (await prisma.availabilityRule.findFirst({ where: data })) {
    return { ok: false, message: "Dieses Zeitfenster gibt es bereits." };
  }
  await prisma.availabilityRule.create({ data });
  return done("Zeitfenster hinzugefügt.");
}

export async function deleteAvailabilityRule(ruleId: string): Promise<ActionState> {
  const user = await requireTattooer();
  await prisma.availabilityRule.deleteMany({
    where: { id: ruleId, tattooerId: user.tattooerProfile.id },
  });
  return done("Zeitfenster entfernt.");
}

const exceptionSchema = z.object({
  kind: z.enum(["UNAVAILABLE", "AVAILABLE"]),
  fromDate: z.string(),
  toDate: z.string(),
  fromTime: z.string().optional().default(""),
  toTime: z.string().optional().default(""),
  note: z.string().trim().max(200).optional().default(""),
});

export async function addAvailabilityException(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTattooer();
  const parsed = exceptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Bitte Zeitraum angeben." };
  const { kind, fromDate, fromTime, note } = parsed.data;
  const toDate = parsed.data.toDate || fromDate;
  if (!isLocalDate(fromDate) || !isLocalDate(toDate))
    return { ok: false, message: "Datum ist ungültig." };

  let startsAt: Date;
  let endsAt: Date;
  if (fromTime || parsed.data.toTime) {
    const fromMin = parseTimeOfDay(fromTime || "00:00");
    const toMin = parseTimeOfDay(parsed.data.toTime || "24:00");
    if (fromMin === null || toMin === null) return { ok: false, message: "Uhrzeit ist ungültig." };
    startsAt = zonedTimeToUtc(fromDate, fromMin, APP_TIMEZONE);
    endsAt =
      toMin >= 1440
        ? zonedTimeToUtc(addDays(toDate, 1), 0, APP_TIMEZONE)
        : zonedTimeToUtc(toDate, toMin, APP_TIMEZONE);
  } else {
    // Whole days
    startsAt = zonedTimeToUtc(fromDate, 0, APP_TIMEZONE);
    endsAt = zonedTimeToUtc(addDays(toDate, 1), 0, APP_TIMEZONE);
  }
  if (endsAt <= startsAt) return { ok: false, message: "Das Ende muss nach dem Beginn liegen." };

  await prisma.availabilityException.create({
    data: { tattooerId: user.tattooerProfile.id, kind, startsAt, endsAt, note: note || null },
  });
  return done(
    kind === "UNAVAILABLE" ? "Abwesenheit eingetragen." : "Zusätzliche Zeit eingetragen.",
  );
}

export async function deleteAvailabilityException(id: string): Promise<ActionState> {
  const user = await requireTattooer();
  await prisma.availabilityException.deleteMany({
    where: { id, tattooerId: user.tattooerProfile.id },
  });
  return done("Ausnahme entfernt.");
}

export async function disconnectGoogleCalendar(): Promise<ActionState> {
  const user = await requireTattooer();
  const profile = await prisma.tattooerProfile.findUniqueOrThrow({
    where: { id: user.tattooerProfile.id },
  });
  if (profile.googleRefreshTokenEnc) {
    try {
      await revokeToken(decryptSecret(profile.googleRefreshTokenEnc));
    } catch {
      // Token unreadable or revoke failed: remove it locally anyway.
    }
  }
  await prisma.tattooerProfile.update({
    where: { id: profile.id },
    data: { googleRefreshTokenEnc: null, googleConnectedAt: null, googleAccountEmail: null },
  });
  return done(
    "Google-Kalender getrennt. Du bekommst keine neuen Termine, bis du ihn wieder verbindest.",
  );
}
