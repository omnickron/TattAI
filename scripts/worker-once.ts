// Runs all worker jobs once (development helper). Usage: npx tsx scripts/worker-once.ts
import "dotenv/config";
import { deliverBotEvents, deliveryConfigFromEnv } from "../src/lib/bot/deliveries";
import { createCalendarClient } from "../src/lib/google/client";
import { createPrismaClient } from "../src/lib/prisma-client";
import { syncPendingSessions } from "../src/lib/scheduling/session-calendar";
import { createWhatsAppClient } from "../src/lib/whatsapp/client";
import { createMediaDownloader, downloadPendingAttachments } from "../src/lib/whatsapp/media";
import { runMessagingWorker } from "../src/lib/whatsapp/messaging";

const prisma = createPrismaClient();

async function main() {
  console.log(
    "messaging:",
    await runMessagingWorker({
      prisma,
      whatsapp: createWhatsAppClient(),
      timeZone: process.env.APP_TIMEZONE || "Europe/Berlin",
    }),
  );
  console.log("bot:", await deliverBotEvents(prisma, deliveryConfigFromEnv()));
  console.log("media:", await downloadPendingAttachments(prisma, createMediaDownloader()));
  console.log(
    "calendar:",
    await syncPendingSessions({
      prisma,
      calendar: createCalendarClient(prisma),
      appUrl: process.env.APP_URL,
    }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
