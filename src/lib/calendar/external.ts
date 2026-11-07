/**
 * Entries from the tattooers' own calendars (TeamUp / Google) for display in the app
 * calendar: read-only "Belegt" blocks. Entries NEEDL wrote itself are left out (TeamUp
 * marks them; for Google, intervals matching an app appointment are dropped).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { RoutingCalendarClient } from "./routing";
import {
  CALENDAR_CONNECTED_WHERE,
  connectionOf,
  type CalendarProfileFields,
} from "../scheduling/booking";

export interface ExternalEntry {
  tattooerId: string;
  tattooerName: string;
  start: Date;
  end: Date;
  title: string | null;
  source: "TeamUp" | "Google";
}

export async function loadExternalEntries(
  prisma: Pick<PrismaClient, "tattooerProfile">,
  calendar: Pick<RoutingCalendarClient, "listBusyEntries">,
  opts: {
    from: Date;
    to: Date;
    /** null = all active tattooers */
    tattooerId: string | null;
    /** App appointments in the range, to drop their mirror images from Google */
    own: Array<{ tattooerId: string; start: Date; end: Date }>;
  },
): Promise<{ entries: ExternalEntry[]; failed: string[] }> {
  const profiles = (await prisma.tattooerProfile.findMany({
    where: {
      user: { active: true },
      ...CALENDAR_CONNECTED_WHERE,
      ...(opts.tattooerId ? { id: opts.tattooerId } : {}),
    },
    include: { user: { select: { name: true } } },
  })) as Array<CalendarProfileFields & { user: { name: string } }>;

  const failed: string[] = [];
  const lists = await Promise.all(
    profiles.map(async (p) => {
      try {
        const busy = await calendar.listBusyEntries(connectionOf(p), opts.from, opts.to);
        const source = p.calendarProvider === "TEAMUP" ? ("TeamUp" as const) : ("Google" as const);
        return busy
          .filter(
            (b) =>
              !opts.own.some(
                (o) =>
                  o.tattooerId === p.id &&
                  Math.abs(o.start.getTime() - b.start.getTime()) < 60_000 &&
                  Math.abs(o.end.getTime() - b.end.getTime()) < 60_000,
              ),
          )
          .map((b) => ({
            tattooerId: p.id,
            tattooerName: p.user.name,
            start: b.start,
            end: b.end,
            title: b.title,
            source,
          }));
      } catch (err) {
        console.error(
          `[calendar] external entries of ${p.id}:`,
          err instanceof Error ? err.message : err,
        );
        failed.push(p.user.name);
        return [];
      }
    }),
  );
  return { entries: lists.flat(), failed };
}
