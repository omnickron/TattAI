import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ATTEMPTS,
  processDueWebhookEvents,
  processWebhookEvent,
  recordLeadgenEvents,
  type IngestDeps,
} from "@/lib/leads/meta-ingest";
import { MockLeadFetcher } from "@/lib/meta/graph";
import type { MetaLeadData, MetaLeadFetcher, MetaWebhookPayload } from "@/lib/meta/types";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();

function payload(...leadgenIds: string[]): MetaWebhookPayload {
  return {
    object: "page",
    entry: [
      {
        id: "page-1",
        time: 1767225600,
        changes: leadgenIds.map((id) => ({
          field: "leadgen",
          value: { leadgen_id: id, page_id: "page-1", form_id: "form-1", ad_id: "ad-1" },
        })),
      },
    ],
  };
}

function deps(fetcher: MetaLeadFetcher = new MockLeadFetcher(), now = () => new Date()): IngestDeps {
  return { prisma, fetcher, defaultCountry: "DE", now };
}

async function ingest(p: MetaWebhookPayload, d = deps()) {
  const { newEventIds } = await recordLeadgenEvents(prisma, p);
  for (const id of newEventIds) await processWebhookEvent(d, id);
  return newEventIds;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.appSettings.create({
    data: { id: 1, consentCheckboxKey: "whatsapp_consent", consentText: "Einwilligungstext v1" },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Meta leadgen ingestion", () => {
  it("creates a lead with campaign data and consent snapshot", async () => {
    await ingest(payload("lead-1"));
    const leads = await prisma.lead.findMany();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      metaLeadId: "lead-1",
      source: "META_LEAD_AD",
      metaPageId: "page-1",
      whatsappConsent: true,
      whatsappConsentText: "Einwilligungstext v1",
    });
    expect(leads[0].metaCampaignId).toBeTruthy();
    expect(leads[0].metaAdsetName).toBeTruthy();
  });

  it("ignores repeated deliveries of the same lead", async () => {
    const fetcher = new MockLeadFetcher();
    const spy = vi.spyOn(fetcher, "fetchLead");
    await ingest(payload("lead-1"), deps(fetcher));
    const second = await ingest(payload("lead-1"), deps(fetcher));
    const third = await ingest(payload("lead-1", "lead-1"), deps(fetcher));

    expect(second).toHaveLength(0);
    expect(third).toHaveLength(0);
    expect(await prisma.lead.count()).toBe(1);
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("deduplicates within a single payload", async () => {
    const ids = await ingest(payload("lead-1", "lead-2", "lead-1"));
    expect(ids).toHaveLength(2);
    expect(await prisma.lead.count()).toBe(2);
  });

  it("is safe when the same event is processed twice concurrently", async () => {
    const { newEventIds } = await recordLeadgenEvents(prisma, payload("lead-1"));
    const d = deps();
    const results = await Promise.all([
      processWebhookEvent(d, newEventIds[0]),
      processWebhookEvent(d, newEventIds[0]),
    ]);
    expect(results).toContain("created");
    expect(await prisma.lead.count()).toBe(1);
  });

  it("marks leads with invalid phone numbers as INVALID", async () => {
    const fetcher: MetaLeadFetcher = {
      fetchLead: async (id): Promise<MetaLeadData> => ({
        id,
        field_data: [
          { name: "full_name", values: ["Max Test"] },
          { name: "phone_number", values: ["12345"] },
        ],
      }),
    };
    await ingest(payload("lead-x"), deps(fetcher));
    const lead = await prisma.lead.findUniqueOrThrow({ where: { metaLeadId: "lead-x" } });
    expect(lead).toMatchObject({ status: "INVALID", phoneValid: false, phoneE164: null, phoneRaw: "12345" });
    expect(lead.whatsappConsent).toBe(false);
  });

  it("ignores non-leadgen changes and foreign objects", async () => {
    const { newEventIds } = await recordLeadgenEvents(prisma, {
      object: "page",
      entry: [{ changes: [{ field: "feed", value: { leadgen_id: "nope" } }] }],
    });
    const other = await recordLeadgenEvents(prisma, { object: "user", entry: [] });
    expect(newEventIds).toHaveLength(0);
    expect(other.newEventIds).toHaveLength(0);
  });

  it("records failures and retries with backoff until success", async () => {
    let calls = 0;
    const flaky: MetaLeadFetcher = {
      async fetchLead(id) {
        calls++;
        if (calls === 1) throw new Error("Graph API 500");
        return new MockLeadFetcher().fetchLead(id);
      },
    };
    let clock = new Date("2026-01-01T10:00:00Z");
    const d = deps(flaky, () => clock);

    await ingest(payload("lead-1"), d);
    let event = await prisma.webhookEvent.findFirstOrThrow();
    expect(event).toMatchObject({ status: "FAILED", attempts: 1, lastError: "Graph API 500" });
    expect(event.nextAttemptAt?.toISOString()).toBe("2026-01-01T10:01:00.000Z");

    // Not due yet
    expect(await processDueWebhookEvents(d)).toEqual([]);

    clock = new Date("2026-01-01T10:02:00Z");
    expect(await processDueWebhookEvents(d)).toEqual(["created"]);
    event = await prisma.webhookEvent.findFirstOrThrow();
    expect(event).toMatchObject({ status: "PROCESSED", attempts: 2, lastError: null });
    expect(await prisma.lead.count()).toBe(1);
  });

  it("gives up after the maximum number of attempts", async () => {
    const broken: MetaLeadFetcher = {
      fetchLead: async () => {
        throw new Error("boom");
      },
    };
    const { newEventIds } = await recordLeadgenEvents(prisma, payload("lead-1"));
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await processWebhookEvent(deps(broken), newEventIds[0]);
    const event = await prisma.webhookEvent.findFirstOrThrow();
    expect(event.status).toBe("DEAD");
    expect(event.attempts).toBe(MAX_ATTEMPTS);
  });
});
