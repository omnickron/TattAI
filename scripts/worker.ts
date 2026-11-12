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
import { notifyDueFollowUps } from "../src/lib/outcomes/follow-up";
import { notifyMissingOutcomes } from "../src/lib/outcomes/reminders";
import { refreshIntegrationSettings } from "../src/lib/integrations/store";
import { failStaleEvalRuns, runBotEval } from "../src/lib/bot/eval/run";
import { createMediaDownloader, downloadPendingAttachments } from "../src/lib/whatsapp/media";
import {
  recordWorkerCrash,
  recordWorkerStart,
  recordWorkerTick,
  type WorkerFailure,
} from "../src/lib/worker/health";

const INTERVAL_MS = 30_000;
const prisma = createPrismaClient();
// Declared before the first client is built (used inside createWhatsAppClientSafe)
let lastWhatsAppError = "";
// Rebuilt every tick: access data can change in the app at any time
let whatsapp = createWhatsAppClientSafe();
let calendarDeps = makeCalendarDeps();

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

// Jobs that failed in the current run (shown to the operator)
let failures: WorkerFailure[] = [];
function fail(job: string, err: unknown) {
  console.error(`[worker] ${job} failed:`, err);
  failures.push({ job, message: err instanceof Error ? err.message : String(err) });
}

async function tick() {
  // Access data maintained in the app (TeamUp, WhatsApp, Meta)
  await refreshIntegrationSettings(prisma).catch((err) => fail("settings", err));
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
      fail("messaging", err);
    }
  if (brain && !evalRunning) {
    try {
      const run = await prisma.botEvalRun.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
      });
      if (run) {
        evalRunning = true;
        console.info(`[worker] bot test ${run.id} started`);
        runBotEval({ prisma, brain, config: brainConfigFromEnv() }, run.id)
          .then((r) => console.info(`[worker] bot test ${run.id}: ${r.status}`))
          .catch((err) => console.error("[worker] bot test failed:", err))
          .finally(() => (evalRunning = false));
      }
    } catch (err) {
      fail("evalStart", err);
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
      fail("botInbox", err);
    }
  }
  try {
    const bot = await deliverBotEvents(prisma, {
      ...deliveryConfigFromEnv(),
      skipEvents: brain ? [BOT_EVENT] : [],
    });
    if (bot.delivered || bot.failed) console.info("[worker] bot events:", bot);
  } catch (err) {
    fail("botEvents", err);
  }
  try {
    await ensureCalendarNames(calendarDeps);
    const cal = await syncPendingSessions(calendarDeps);
    if (cal.synced || cal.deleted) console.info("[worker] calendar:", cal);
  } catch (err) {
    fail("calendar", err);
  }
  // Customer images only arrive through WhatsApp
  if (whatsapp)
    try {
      const media = await downloadPendingAttachments(prisma, createMediaDownloader());
      if (media.stored) console.info("[worker] stored attachments:", media.stored);
    } catch (err) {
      fail("media", err);
    }
  try {
    const followUps = await notifyDueFollowUps(prisma, push);
    if (followUps) console.info(`[worker] follow-up reminders: ${followUps}`);
  } catch (err) {
    fail("followUps", err);
  }
  try {
    const outcomes = await notifyMissingOutcomes(
      prisma,
      push,
      new Date(),
      process.env.APP_TIMEZONE || "Europe/Berlin",
    );
    if (outcomes) console.info(`[worker] missing-outcome reminders: ${outcomes}`);
  } catch (err) {
    fail("outcomes", err);
  }
  // GDPR retention: once every 6 hours
  if (Date.now() - lastRetention > 6 * 3600_000) {
    lastRetention = Date.now();
    try {
      const purged = await purgeStaleLeads(prisma);
      if (purged.deleted) console.info(`[worker] retention: ${purged.deleted} old leads deleted`);
    } catch (err) {
      fail("retention", err);
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
      fail("leadRetry", err);
    }
  }
}

async function main() {
  await failStaleEvalRuns(prisma).catch(() => undefined);
  await recordWorkerStart(prisma).catch((err) => console.error("[worker] heartbeat:", err));
  console.info(
    `[worker] started (WhatsApp ${!whatsapp ? "nicht eingerichtet" : whatsapp.mock ? "mock" : "live"}, Bot ${brain ? "NEEDL" : "aus/extern"})`,
  );
  while (!stopping) {
    const started = Date.now();
    failures = [];
    await tick();
    // Sign of life for the operator page
    await recordWorkerTick(prisma, Date.now() - started, failures).catch((err) =>
      console.error("[worker] heartbeat:", err),
    );
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

async function crash(err: unknown) {
  console.error(err);
  // Best effort, so the operator sees why the worker stopped
  await recordWorkerCrash(prisma, err).catch(() => undefined);
  process.exit(1);
}
process.on("uncaughtException", crash);
process.on("unhandledRejection", crash);

main().catch(crash);
