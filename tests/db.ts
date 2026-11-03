import { createPrismaClient } from "@/lib/prisma-client";

/** Prisma client for the dedicated test database (never the dev database). */
export function createTestPrisma() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set for integration tests");
  return createPrismaClient(url);
}

export async function resetDatabase(prisma: ReturnType<typeof createTestPrisma>) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "WebhookEvent", "LeadNote", "Message", "TattooBooking", "Consultation", "Lead",
             "AppSettings", "FairnessShare", "FairnessConfig", "AvailabilityRule",
             "AvailabilityException", "TattooerProfile", "User", "OutboundMessage", "FollowUpStep",
             "ReminderRule", "WhatsAppTemplate", "MessagingSettings", "LeadAttachment", "BotDelivery",
             "CalendarEventDeletion", "AfterConsultationRule"
             RESTART IDENTITY CASCADE
  `);
}
