// Sample data for development: admin, tattooers, settings and ~40 leads.
// Safe to run repeatedly (upserts by e-mail / Meta lead id).
import "dotenv/config";
import type { LeadStatus } from "../src/generated/prisma/client";
import { MockLeadFetcher } from "../src/lib/meta/graph";
import { mapMetaLead } from "../src/lib/meta/map-lead";
import { createPrismaClient } from "../src/lib/prisma-client";

const prisma = createPrismaClient();

const CONSENT_KEY = "whatsapp_consent";
const CONSENT_TEXT =
  "[Platzhalter] Ich bin einverstanden, dass mich das Studio per WhatsApp zu meiner Tattoo-Anfrage kontaktiert. Die Einwilligung kann ich jederzeit widerrufen.";

const TATTOOERS = [
  { name: "Alex Berger", email: "alex@example.com", weight: 2 },
  { name: "Kim Novak", email: "kim@example.com", weight: 2 },
  { name: "Sam Richter", email: "sam@example.com", weight: 1 },
];

const STATUSES: LeadStatus[] = [
  "NEW",
  "NEW",
  "NEW",
  "NEW",
  "NEW",
  "NEW",
  "CONTACTED",
  "CONTACTED",
  "CONTACTED",
  "IN_CHAT",
  "IN_CHAT",
  "CONSULTATION_BOOKED",
  "CONSULTATION_BOOKED",
  "CONSULTATION_BOOKED",
  "CONSULTATION_DONE",
  "TATTOO_BOOKED",
  "TATTOO_BOOKED",
  "NO_TATTOO",
  "NO_SHOW",
  "CANCELLED",
  "NO_RESPONSE",
];

const WITH_CONSULTATION = new Set<LeadStatus>([
  "CONSULTATION_BOOKED",
  "CONSULTATION_DONE",
  "TATTOO_BOOKED",
  "NO_TATTOO",
  "NO_SHOW",
]);

// Placeholder WhatsApp texts. In sample mode they count as approved by Meta.
const TEMPLATES = [
  {
    purpose: "FIRST_CONTACT" as const,
    name: "erstkontakt",
    bodyText:
      "Hallo {{Vorname}}, danke für deine Tattoo-Anfrage bei {{Studio}}! [Platzhalter] Erzähl uns gern kurz, was du dir vorstellst – dann finden wir einen Termin für deine Beratung.",
  },
  {
    purpose: "FOLLOW_UP" as const,
    name: "nachfassen_1",
    bodyText:
      "Hallo {{Vorname}}, wir wollten kurz nachfragen: Hast du noch Interesse an einer Tattoo-Beratung? [Platzhalter]",
  },
  {
    purpose: "FOLLOW_UP" as const,
    name: "nachfassen_2",
    bodyText:
      "Hallo {{Vorname}}, das ist unsere letzte Nachricht zu deiner Anfrage. Wenn du später Lust hast, schreib uns einfach hier. [Platzhalter]",
  },
  {
    purpose: "REMINDER" as const,
    name: "erinnerung",
    bodyText:
      "Hallo {{Vorname}}, kleine Erinnerung an deine Tattoo-Beratung am {{Datum}} um {{Uhrzeit}} ({{Ort}}) mit {{Tätowierer}}. Bis bald! [Platzhalter]",
  },
];

async function seedMessaging() {
  const mock = process.env.WHATSAPP_MOCK === "true";
  const ids: Record<string, string> = {};
  for (const t of TEMPLATES) {
    const existing = await prisma.whatsAppTemplate.findUnique({
      where: { name_language: { name: t.name, language: "de" } },
    });
    const template =
      existing ??
      (await prisma.whatsAppTemplate.create({
        data: {
          ...t,
          ...(mock
            ? {
                status: "APPROVED",
                submissionCount: 1,
                submittedName: t.name,
                submittedText: t.bodyText,
                approvedName: t.name,
                approvedText: t.bodyText,
                approvedAt: new Date(),
              }
            : {}),
        },
      }));
    ids[t.name] = template.id;
  }

  if (!(await prisma.messagingSettings.findUnique({ where: { id: 1 } }))) {
    await prisma.messagingSettings.create({
      data: {
        id: 1,
        sendingEnabled: false,
        sendTimes: [
          ...[1, 2, 3, 4, 5].flatMap((weekday) =>
            ["10:00", "13:00", "17:00"].map((time) => ({ weekday, time })),
          ),
          { weekday: 6, time: "11:00" },
        ],
        firstContactTemplateId: ids.erstkontakt,
      },
    });
  }
  if ((await prisma.followUpStep.count()) === 0) {
    await prisma.followUpStep.createMany({
      data: [
        { position: 1, delayHours: 24, templateId: ids.nachfassen_1 },
        { position: 2, delayHours: 72, templateId: ids.nachfassen_2 },
      ],
    });
  }
  if ((await prisma.reminderRule.count()) === 0) {
    await prisma.reminderRule.createMany({
      data: [
        { hoursBefore: 24, templateId: ids.erinnerung },
        { hoursBefore: 2, templateId: ids.erinnerung },
      ],
    });
  }
  await prisma.appSettings.updateMany({
    where: { id: 1, studioName: null },
    data: { studioName: "[Platzhalter] Studio" },
  });
}

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL || "inhaber@example.com").toLowerCase();
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: process.env.ADMIN_NAME || "Studio-Inhaber", role: "ADMIN" },
  });
  // The studio owner also tattoos.
  const adminProfile = await prisma.tattooerProfile.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, fairnessShare: { create: { weight: 1 } } },
  });

  const profiles: string[] = [];
  for (const t of TATTOOERS) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        email: t.email,
        name: t.name,
        role: "TATTOOER",
        tattooerProfile: { create: { fairnessShare: { create: { weight: t.weight } } } },
      },
      include: { tattooerProfile: true },
    });
    profiles.push(user.tattooerProfile!.id);
  }

  // Sample availability (local time) and – in mock mode – a "connected" calendar.
  const SAMPLE_RULES = [
    [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 10 * 60, endMinute: 18 * 60 })),
    [2, 3, 4].map((weekday) => ({ weekday, startMinute: 12 * 60, endMinute: 20 * 60 })),
    [5, 6].map((weekday) => ({ weekday, startMinute: 11 * 60, endMinute: 16 * 60 })),
    [1, 3].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 12 * 60 })),
  ];
  const calendarMock = process.env.GOOGLE_CALENDAR_MOCK === "true";
  for (const [i, id] of [...profiles, adminProfile.id].entries()) {
    if ((await prisma.availabilityRule.count({ where: { tattooerId: id } })) === 0) {
      await prisma.availabilityRule.createMany({
        data: SAMPLE_RULES[i % SAMPLE_RULES.length].map((r) => ({ ...r, tattooerId: id })),
      });
    }
    if (calendarMock) {
      await prisma.tattooerProfile.updateMany({
        where: { id, googleConnectedAt: null },
        data: { googleConnectedAt: new Date(), consultationCalendarId: `mock-beratungen-${id}` },
      });
    }
  }

  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      consentCheckboxKey: CONSENT_KEY,
      consentText: CONSENT_TEXT,
      studioAddress: "[Platzhalter] Studioadresse",
    },
  });
  await prisma.fairnessConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  await seedMessaging();

  const fetcher = new MockLeadFetcher(CONSENT_KEY);
  const now = Date.now();
  let created = 0;

  for (let i = 0; i < 40; i++) {
    const metaLeadId = `seed-${String(i).padStart(3, "0")}`;
    if (await prisma.lead.findUnique({ where: { metaLeadId } })) continue;

    const createdAt = new Date(now - (i * 13 + (i % 5) * 3) * 60 * 60 * 1000);
    const data = await fetcher.fetchLead(metaLeadId);
    data.created_time = createdAt.toISOString();
    if (i % 9 === 4) data.custom_disclaimer_responses = [];

    const mapped = mapMetaLead(data, { checkboxKey: CONSENT_KEY, text: CONSENT_TEXT }, "DE");
    const status: LeadStatus = mapped.phoneValid ? STATUSES[i % STATUSES.length] : "INVALID";

    const lead = await prisma.lead.create({
      data: {
        source: "META_LEAD_AD",
        metaLeadId,
        metaFormId: data.form_id,
        metaCampaignId: data.campaign_id,
        metaCampaignName: data.campaign_name,
        metaAdsetId: data.adset_id,
        metaAdsetName: data.adset_name,
        metaAdId: data.ad_id,
        metaAdName: data.ad_name,
        metaPlatform: data.platform,
        ...mapped,
        status,
        statusChangedAt: createdAt,
        rawPayload: JSON.parse(JSON.stringify(data)),
        createdAt,
      },
    });

    if (WITH_CONSULTATION.has(status)) {
      const day = new Date(createdAt);
      day.setUTCDate(day.getUTCDate() + (status === "CONSULTATION_BOOKED" ? 7 : 2));
      day.setUTCHours(9 + (i % 7), i % 2 ? 30 : 0, 0, 0);
      const consultation = await prisma.consultation.create({
        data: {
          leadId: lead.id,
          tattooerId: profiles[i % profiles.length],
          startsAt: day,
          endsAt: new Date(day.getTime() + 30 * 60 * 1000),
          status:
            status === "CONSULTATION_BOOKED"
              ? "SCHEDULED"
              : status === "NO_SHOW"
                ? "NO_SHOW"
                : "HELD",
          tattooBooked: status === "TATTOO_BOOKED" ? true : status === "NO_TATTOO" ? false : null,
        },
      });
      if (status === "TATTOO_BOOKED") {
        await prisma.tattooBooking.create({
          data: {
            consultationId: consultation.id,
            date: new Date(day.getTime() + 21 * 24 * 60 * 60 * 1000),
            amountCents: 25000 + (i % 4) * 15000,
          },
        });
      }
    }
    created++;
  }

  console.log(
    `Seed done: admin ${adminEmail}, ${TATTOOERS.length} tattooers, ${created} new leads.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
