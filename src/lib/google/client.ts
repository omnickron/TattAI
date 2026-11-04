import type { PrismaClient } from "@/generated/prisma/client";
import { RoutingCalendarClient } from "../calendar/routing";
import { loadTeamupConfig } from "../teamup/config";
import { isTeamupMock, MockTeamupClient, TeamupClient } from "../teamup/teamup";
import type { CalendarClient } from "./calendar";
import { GoogleCalendarClient } from "./google-calendar";
import { isCalendarMock, MockCalendarClient } from "./mock-calendar";

type Db = Pick<PrismaClient, "appSettings" | "tattooerProfile">;

/** The app database (lazy, so scripts can pass their own client instead). */
async function appDb(): Promise<Db> {
  return (await import("../db")).prisma;
}

/** Google or TeamUp per tattooer (see RoutingCalendarClient). */
export function createCalendarClient(db?: Db): RoutingCalendarClient {
  const getDb = () => (db ? Promise.resolve(db) : appDb());
  const google: CalendarClient = isCalendarMock()
    ? new MockCalendarClient()
    : new GoogleCalendarClient();
  const teamup = isTeamupMock()
    ? new MockTeamupClient(async () => {
        // Sample "Artist" choices: the tattooers' names
        const profiles = await (
          await getDb()
        ).tattooerProfile.findMany({
          where: { user: { active: true } },
          select: { user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        });
        return profiles.map((p) => ({ id: p.user.name, name: p.user.name }));
      })
    : new TeamupClient(async () => loadTeamupConfig(await getDb()));
  return new RoutingCalendarClient(google, teamup);
}

/** TeamUp client with the admin helpers (sub-calendars, fields). */
export function createTeamupClient(db?: Db): TeamupClient | MockTeamupClient {
  return createCalendarClient(db).teamup as TeamupClient | MockTeamupClient;
}
