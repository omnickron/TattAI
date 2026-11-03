// Runs all worker jobs once (development helper). Usage: npx tsx scripts/worker-once.ts
import "dotenv/config";
import { deliverBotEvents, deliveryConfigFromEnv } from "../src/lib/bot/deliveries";
import { createPrismaClient } from "../src/lib/prisma-client";
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
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
