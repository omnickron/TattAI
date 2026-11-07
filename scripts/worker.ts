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
import { brainConfigFromEnv, createBrainClient } from "../src/lib/bot/brain";
import { BOT_EVENT, processBotInbox } from "../src/lib/bot/inbox";
import { createPushSender } from "../src/lib/push";
import { purgeStaleLeads } from "../src/lib/leads/retention";
import { refreshIntegrationSettings } from "../src/lib/integrations/store";
import { failStaleEvalRuns, runBotEval } from "../src/lib/bot/eval/run";
import { createMediaDownloader, downloadPendingAttachments } from "../src/lib/whatsapp/media";

const INTERVAL_MS = 30_000;
const prisma = createPrismaClient();
// Rebuilt every tick: access data can change in the app at any time
let whatsapp = createWhatsAppClientSafe();
let calendarDeps = makeCalendarDeps();

let lastWhatsAppError = "";
function createWhatsAppClientSafe() {
  try {
    const client = createWhatsAppClient();
    lastWhatsAppError = "";
    return client;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== lastWhatsAppError) console.error("[worker] WhatsApp not configured:", message);
    lastWhatsAppError = message;
    return null;
  }
}

function makeCalendarDeps() {
  return {
    prisma,
    calendar: createCalendarClient(prisma),
    timeZone: process.env.APP_TIMEZONE || "Europe/Berlin",
    appUrl: process.env.APP_URL,
  };
}
// Built-in bot: on when an Anthropic API key is set
const brain = createBrainClient();
const push = createPushSender();
let stopping = false;
// A bot test run takes minutes: it runs alongside the regular jobs
let evalRunning = false;
let lastLeadRetry = 0;
let lastRetention = 0;

async function tick() {
  // Access data maintained in the app (TeamUp, WhatsApp, Meta)
  await refreshIntegrationSettings(prisma).catch((err) =>
    console.error("[worker] integration settings:", err),
  );
  whatsapp = createWhatsAppClientSafe();
  calendarDeps = makeCalendarDeps();
  if (whatsapp)
    try {
      const result = await runMessagingWorker({
        prisma,
        whatsapp,
        timeZone: process.env.APP_TIMEZONE || "Europe/Berlin",
      });
      if (
        !result.skipped &&
        (result.planned || result.sent || result.failed || result.noResponse)
      ) {
        console.info(`[worker] ${new Date().toISOString()}`, result);
      }
    } catch (err) {
      console.error("[worker] messaging run failed:", err);
    }
  if (brain && !evalRunning) {
    const run = await prisma.botEvalRun
      .findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } })
      .catch(() => null);
    if (run) {
      evalRunning = true;
      console.info(`[worker] bot test ${run.id} started`);
      runBotEval({ prisma, brain, config: brainConfigFromEnv() }, run.id)
        .then((r) => console.info(`[worker] bot test ${run.id}: ${r.status}`))
        .catch((err) => console.error("[worker] bot test failed:", err))
        .finally(() => (evalRunning = false));
    }
  }
  if (brain && whatsapp) {
    try {
      const inbox = await processBotInbox({
        ...calendarDeps,
        whatsapp,
        brain,
        push,
        config: brainConfigFromEnv(),
      });
      if (inbox.answered || inbox.handedOver || inbox.failed) console.info("[worker] bot:", inbox);
    } catch (err) {
      console.error("[worker] bot run failed:", err);
    }
  }
  try {
    const bot = await deliverBotEvents(prisma, {
      ...deliveryConfigFromEnv(),
      skipEvents: brain ? [BOT_EVENT] : [],
    });
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
  // GDPR retention: once every 6 hours
  if (Date.now() - lastRetention > 6 * 3600_000) {
    lastRetention = Date.now();
    try {
      const purged = await purgeStaleLeads(prisma);
      if (purged.deleted) console.info(`[worker] retention: ${purged.deleted} old leads deleted`);
    } catch (err) {
      console.error("[worker] retention failed:", err);
    }
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
  await failStaleEvalRuns(prisma).catch(() => undefined);
  console.info(
    `[worker] started (WhatsApp ${!whatsapp ? "nicht eingerichtet" : whatsapp.mock ? "mock" : "live"}, Bot ${brain ? "NEEDL" : "aus/extern"})`,
  );
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
