import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadExternalEntries } from "@/lib/calendar/external";
import type { CalendarConnection } from "@/lib/google/calendar";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const at = (h: number) => new Date(`2026-11-09T${String(h).padStart(2, "0")}:00:00Z`);

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

describe("entries from the tattooers' own calendars", () => {
  it("shows foreign entries, drops NEEDL's own and reports unreachable calendars", async () => {
    const mk = (name: string, provider: "GOOGLE" | "TEAMUP") =>
      prisma.user.create({
        data: {
          name,
          email: `${name}@example.com`,
          role: "TATTOOER",
          tattooerProfile: {
            create:
              provider === "GOOGLE"
                ? { googleConnectedAt: new Date() }
                : { calendarProvider: "TEAMUP", teamupConnectedAt: new Date(), teamupArtist: name },
          },
        },
        include: { tattooerProfile: true },
      });
    const kim = (await mk("Kim", "GOOGLE")).tattooerProfile!.id;
    const nico = (await mk("Nico", "TEAMUP")).tattooerProfile!.id;
    const broken = (await mk("Alex", "GOOGLE")).tattooerProfile!.id;

    const calendar = {
      async listBusyEntries(conn: CalendarConnection) {
        if (conn.tattooerId === broken) throw new Error("token expired");
        if (conn.tattooerId === kim)
          return [
            { start: at(9), end: at(10), title: null }, // NEEDL's own consultation (mirror)
            { start: at(13), end: at(14), title: null },
          ];
        return [{ start: at(11), end: at(12), title: "Tattoo Max" }];
      },
    };
    const r = await loadExternalEntries(prisma, calendar, {
      from: at(0),
      to: at(23),
      tattooerId: null,
      own: [{ tattooerId: kim, start: at(9), end: at(10) }],
    });
    const show = r.entries
      .map((e) => `${e.tattooerName} ${e.source} ${e.start.getUTCHours()} ${e.title ?? "-"}`)
      .sort();
    expect(show).toEqual(["Kim Google 13 -", "Nico TeamUp 11 Tattoo Max"]);
    expect(r.failed).toEqual(["Alex"]);
    expect(nico).toBeTruthy();
  });
});
