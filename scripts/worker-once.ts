// Runs the messaging worker once (development helper). Usage: npx tsx scripts/worker-once.ts
import "dotenv/config";
import { createPrismaClient } from "../src/lib/prisma-client";
import { createWhatsAppClient } from "../src/lib/whatsapp/client";
import { runMessagingWorker } from "../src/lib/whatsapp/messaging";

const prisma = createPrismaClient();
runMessagingWorker({
  prisma,
  whatsapp: createWhatsAppClient(),
  timeZone: process.env.APP_TIMEZONE || "Europe/Berlin",
})
  .then((r) => console.log(r))
  .finally(() => prisma.$disconnect());
