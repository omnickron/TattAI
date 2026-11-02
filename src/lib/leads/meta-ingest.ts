import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { CountryCode } from "libphonenumber-js";
import { mapMetaLead } from "../meta/map-lead";
import type { LeadgenChangeValue, MetaLeadFetcher, MetaWebhookPayload } from "../meta/types";
import { getConsentSettings } from "../settings";

export const META_LEADGEN_PROVIDER = "meta_leadgen";
export const MAX_ATTEMPTS = 8;

export interface IngestDeps {
  prisma: PrismaClient;
  fetcher: MetaLeadFetcher;
  defaultCountry: CountryCode;
  now?: () => Date;
}

export type ProcessResult = "created" | "duplicate" | "skipped" | "failed";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Exponential backoff: 1, 2, 4, ... minutes, capped at 6 hours. */
export function retryDelayMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60_000);
}

/** Extracts all `leadgen` changes from a webhook payload. */
export function extractLeadgenChanges(payload: MetaWebhookPayload): LeadgenChangeValue[] {
  if (payload?.object !== "page" || !Array.isArray(payload.entry)) return [];
  const result: LeadgenChangeValue[] = [];
  for (const entry of payload.entry) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value as Partial<LeadgenChangeValue> | undefined;
      if (change?.field !== "leadgen" || !value?.leadgen_id) continue;
      result.push({ ...value, leadgen_id: String(value.leadgen_id) } as LeadgenChangeValue);
    }
  }
  return result;
}

/**
 * Stores each leadgen change as a webhook event. The unique key
 * (provider, leadgen_id) makes repeated deliveries a no-op.
 * Returns the ids of newly stored events that still need processing.
 */
export async function recordLeadgenEvents(
  prisma: PrismaClient,
  payload: MetaWebhookPayload,
): Promise<{ newEventIds: string[]; duplicates: number }> {
  const newEventIds: string[] = [];
  let duplicates = 0;
  for (const change of extractLeadgenChanges(payload)) {
    try {
      const event = await prisma.webhookEvent.create({
        data: {
          provider: META_LEADGEN_PROVIDER,
          externalId: change.leadgen_id,
          payload: change as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      newEventIds.push(event.id);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      duplicates++;
    }
  }
  return { newEventIds, duplicates };
}

/** Fetches lead details and creates the lead. Safe to call repeatedly. */
export async function processWebhookEvent(deps: IngestDeps, eventId: string): Promise<ProcessResult> {
  const { prisma, fetcher, defaultCountry } = deps;
  const now = deps.now ?? (() => new Date());

  const event = await prisma.webhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status === "PROCESSED" || event.status === "DEAD") return "skipped";

  const change = event.payload as unknown as LeadgenChangeValue;
  const leadgenId = event.externalId;

  try {
    let result: ProcessResult = "duplicate";
    const existing = await prisma.lead.findUnique({ where: { metaLeadId: leadgenId } });
    if (!existing) {
      const data = await fetcher.fetchLead(leadgenId);
      const consent = await getConsentSettings(prisma);
      const mapped = mapMetaLead(data, consent, defaultCountry);
      try {
        await prisma.lead.create({
          data: {
            source: "META_LEAD_AD",
            metaLeadId: leadgenId,
            metaPageId: change.page_id ?? null,
            metaFormId: data.form_id ?? change.form_id ?? null,
            metaCampaignId: data.campaign_id ?? null,
            metaCampaignName: data.campaign_name ?? null,
            metaAdsetId: data.adset_id ?? change.adgroup_id ?? null,
            metaAdsetName: data.adset_name ?? null,
            metaAdId: data.ad_id ?? change.ad_id ?? null,
            metaAdName: data.ad_name ?? null,
            metaPlatform: data.platform ?? null,
            ...mapped,
            status: mapped.phoneValid ? "NEW" : "INVALID",
            rawPayload: data as unknown as Prisma.InputJsonValue,
          },
        });
        result = "created";
      } catch (err) {
        // A concurrent worker created the same lead in the meantime.
        if (!isUniqueViolation(err)) throw err;
      }
    }

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSED",
        processedAt: now(),
        attempts: { increment: 1 },
        lastError: null,
        nextAttemptAt: null,
      },
    });
    return result;
  } catch (err) {
    const attempts = event.attempts + 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[meta-leadgen] processing ${leadgenId} failed (attempt ${attempts}):`, message);
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: attempts >= MAX_ATTEMPTS ? "DEAD" : "FAILED",
        attempts,
        lastError: message.slice(0, 2000),
        nextAttemptAt:
          attempts >= MAX_ATTEMPTS ? null : new Date(now().getTime() + retryDelayMs(attempts)),
      },
    });
    return "failed";
  }
}

/**
 * Retries failed events whose backoff has elapsed, plus pending events that
 * were never processed (e.g. the process crashed right after storing them).
 */
export async function processDueWebhookEvents(deps: IngestDeps, limit = 50) {
  const now = (deps.now ?? (() => new Date()))();
  const due = await deps.prisma.webhookEvent.findMany({
    where: {
      provider: META_LEADGEN_PROVIDER,
      OR: [
        { status: "FAILED", nextAttemptAt: { lte: now } },
        { status: "PENDING", createdAt: { lte: new Date(now.getTime() - 60_000) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const results: ProcessResult[] = [];
  for (const { id } of due) results.push(await processWebhookEvent(deps, id));
  return results;
}
