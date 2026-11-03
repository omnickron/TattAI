// Background worker: WhatsApp planning/dispatch, bot event delivery, media downloads
// and retries of failed Meta lead fetches.
// Runs every 30 seconds. Usage: npm run worker
import "dotenv/config";
import { processDueWebhookEvents } from "../src/lib/leads/meta-ingest";
import { createLeadFetcher } from "../src/lib/meta/fetcher";
import { createCalendarClient } from "../src/lib/google/client";
import { createPrismaClient } from "../src/lib/prisma-client";
import { ensureCalendarNames } from "../src/lib/scheduling/booking";
import { syncPendingSessions } from "../src/lib/scheduling/session-calendar";
import { defaultPhoneCountry } from "../src/lib/settings";
import { createWhatsAppClient } from "../src/lib/whatsapp/client";
import { runMessagingWorker } from "../src/lib/whatsapp/messaging";
import { deliverBotEvents, deliveryConfigFromEnv } from "../src/lib/bot/deliveries";
import { createMediaDownloader, downloadPendingAttachments } from "../src/lib/whatsapp/media";

const INTERVAL_MS = 30_000;
const prisma = createPrismaClient();
const whatsapp = createWhatsAppClient();
const calendarDeps = {
  prisma,
  calendar: createCalendarClient(),
  timeZone: process.env.APP_TIMEZONE || "Europe/Berlin",
  appUrl: process.env.APP_URL,
};
let stopping = false;
let lastLeadRetry = 0;

async function tick() {
  try {
    const result = await runMessagingWorker({
      prisma,
      whatsapp,
      timeZone: process.env.APP_TIMEZONE || "Europe/Berlin",
    });
    if (!result.skipped && (result.planned || result.sent || result.failed || result.noResponse)) {
      console.info(`[worker] ${new Date().toISOString()}`, result);
    }
  } catch (err) {
    console.error("[worker] messaging run failed:", err);
  }
  try {
    const bot = await deliverBotEvents(prisma, deliveryConfigFromEnv());
    if (bot.delivered || bot.failed) console.info("[worker] bot events:", bot);
  } catch (err) {
    console.error("[worker] bot delivery failed:", err);
  }
  try {
    await ensureCalendarNames(calendarDeps);
    const cal = await syncPendingSessions(calendarDeps);
    if (cal.synced || cal.deleted) console.info("[worker] calendar:", cal);
  } catch (err) {
    console.error("[worker] calendar sync failed:", err);
  }
  try {
    const media = await downloadPendingAttachments(prisma, createMediaDownloader());
    if (media.stored) console.info("[worker] stored attachments:", media.stored);
  } catch (err) {
    console.error("[worker] media download failed:", err);
  }
  if (Date.now() - lastLeadRetry > 5 * 60_000) {
    lastLeadRetry = Date.now();
    try {
      const retried = await processDueWebhookEvents({
        prisma,
        fetcher: createLeadFetcher(),
        defaultCountry: defaultPhoneCountry(),
      });
      if (retried.length) console.info("[worker] retried Meta lead fetches:", retried);
    } catch (err) {
      console.error("[worker] lead retry failed:", err);
    }
  }
}

async function main() {
  console.info(`[worker] started (WhatsApp ${whatsapp.mock ? "mock" : "live"})`);
  while (!stopping) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
  await prisma.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    console.info("[worker] stopping …");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
