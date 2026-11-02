// Retries failed / stuck Meta lead fetches. Run periodically (e.g. every 5 min via cron)
// until the background job runner arrives in phase 3.
import "dotenv/config";
import { processDueWebhookEvents } from "../src/lib/leads/meta-ingest";
import { createLeadFetcher } from "../src/lib/meta/fetcher";
import { createPrismaClient } from "../src/lib/prisma-client";
import { defaultPhoneCountry } from "../src/lib/settings";

const prisma = createPrismaClient();

processDueWebhookEvents({
  prisma,
  fetcher: createLeadFetcher(),
  defaultCountry: defaultPhoneCountry(),
})
  .then((results) => console.log(`Processed ${results.length} due webhook event(s):`, results))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
