// Development helper: creates sample leads with past consultations that still
// need an outcome ("Beratungen → Ergebnis fehlt"). Safe to run repeatedly.
// Usage: npm run dev:open-consultations [-- <per tattooer, default 2>]
import "dotenv/config";
import { randomInt } from "node:crypto";
import { createPrismaClient } from "../src/lib/prisma-client";
import { addDays, localDateOf, zonedTimeToUtc } from "../src/lib/time";

const FIRST = ["Mara", "Tim", "Julia", "Ben", "Lea", "Finn", "Nina", "Luca", "Clara", "Max"];
const LAST = ["Koch", "Bauer", "Richter", "Klein", "Wolf", "Neumann", "Schwarz", "Zimmermann"];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Nur für die Entwicklung gedacht.");
  const perTattooer = Math.max(1, Math.min(10, Number(process.argv[2] ?? 2) || 2));
  const prisma = createPrismaClient();
  const tz = process.env.APP_TIMEZONE || "Europe/Berlin";
  const today = localDateOf(new Date(), tz);
  const tattooers = await prisma.tattooerProfile.findMany({
    where: { user: { active: true } },
    include: { user: { select: { name: true } } },
  });
  let created = 0;

  for (const t of tattooers) {
    let made = 0;
    // Try past days/times until enough free slots were found (no overlaps allowed)
    for (let attempt = 0; attempt < 40 && made < perTattooer; attempt++) {
      const day = addDays(today, -(1 + randomInt(7)));
      const startMinute = (9 + randomInt(9)) * 60 + [0, 15, 30, 45][randomInt(4)];
      const startsAt = zonedTimeToUtc(day, startMinute, tz);
      const endsAt = new Date(startsAt.getTime() + t.consultationMinutes * 60_000);
      const clash = await prisma.consultation.count({
        where: {
          tattooerId: t.id,
          status: { not: "CANCELLED" },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (clash) continue;
      const name = `${FIRST[randomInt(FIRST.length)]} ${LAST[randomInt(LAST.length)]}`;
      await prisma.lead.create({
        data: {
          source: "MANUAL",
          name,
          phoneRaw: `0151 ${10000000 + randomInt(89999999)}`,
          phoneE164: `+49151${10000000 + randomInt(89999999)}`,
          phoneValid: true,
          whatsappConsent: true,
          whatsappConsentAt: new Date(),
          status: "CONSULTATION_BOOKED",
          createdAt: new Date(startsAt.getTime() - 3 * 24 * 3600_000),
          consultations: {
            create: {
              tattooerId: t.id,
              startsAt,
              endsAt,
              mode: randomInt(4) === 0 ? "PHONE" : "ON_SITE",
            },
          },
        },
      });
      made++;
      created++;
    }
    console.log(`${t.user.name}: ${made} offene Beratung(en)`);
  }
  console.log(
    `Fertig: ${created} offene Beratungen angelegt. In der App unter „Beratungen → Ergebnis fehlt“.`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
