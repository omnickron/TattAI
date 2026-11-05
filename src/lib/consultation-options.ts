/**
 * Which consultation forms the studio offers (Einstellungen) and whether the consultation is
 * free. Used by the booking forms in the app and by the bot.
 */
import type { ConsultationMode, PrismaClient } from "@/generated/prisma/client";

export interface ConsultationOptions {
  modes: ConsultationMode[];
  free: boolean;
}

export const MODE_OPTION_LABELS: Record<ConsultationMode, string> = {
  ON_SITE: "Vor Ort",
  PHONE: "Telefon (kann nicht anreisen)",
};

export function toConsultationOptions(
  row: {
    consultationOnSite: boolean;
    consultationPhone: boolean;
    consultationFree: boolean;
  } | null,
): ConsultationOptions {
  const modes: ConsultationMode[] = [];
  if (row?.consultationOnSite ?? true) modes.push("ON_SITE");
  if (row?.consultationPhone ?? true) modes.push("PHONE");
  // At least one form always exists
  return { modes: modes.length ? modes : ["ON_SITE"], free: row?.consultationFree ?? true };
}

export async function loadConsultationOptions(
  prisma: Pick<PrismaClient, "appSettings">,
): Promise<ConsultationOptions> {
  const row = await prisma.appSettings.findUnique({
    where: { id: 1 },
    select: { consultationOnSite: true, consultationPhone: true, consultationFree: true },
  });
  return toConsultationOptions(row);
}

/** Forms to show in a select: the offered ones plus the current value of an existing entry. */
export function selectableModes(
  options: ConsultationOptions,
  current?: ConsultationMode | null,
): ConsultationMode[] {
  return current && !options.modes.includes(current) ? [...options.modes, current] : options.modes;
}
