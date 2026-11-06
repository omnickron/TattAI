import type { PrismaClient } from "@/generated/prisma/client";
import { isTeamupMock, normalizeCalendarKey, type TeamupConfig } from "./teamup";

type SettingsDb = Pick<PrismaClient, "appSettings">;

/**
 * TeamUp access of the studio: API key and calendar key only from environment variables
 * (secrets), sub-calendar and artist field from the admin settings.
 */
export async function loadTeamupConfig(db: SettingsDb): Promise<TeamupConfig | null> {
  const settings = await db.appSettings.findUnique({
    where: { id: 1 },
    select: { teamupSubcalendarId: true, teamupArtistFieldId: true },
  });
  const mock = isTeamupMock();
  const apiKey = mock ? "mock" : process.env.TEAMUP_API_KEY?.trim();
  const calendarKey = mock ? "mock" : normalizeCalendarKey(process.env.TEAMUP_CALENDAR_KEY);
  if (!apiKey || !calendarKey) return null;
  return {
    apiKey,
    calendarKey,
    subcalendarId: settings?.teamupSubcalendarId ?? null,
    artistFieldId: settings?.teamupArtistFieldId ?? null,
  };
}

/** Whether the server has TeamUp credentials at all (env or sample mode). */
export function teamupCredentialsPresent(): boolean {
  return (
    isTeamupMock() ||
    Boolean(process.env.TEAMUP_API_KEY?.trim() && process.env.TEAMUP_CALENDAR_KEY?.trim())
  );
}
