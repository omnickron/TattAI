import { after, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ingestDeps } from "@/lib/leads/ingest-deps";
import { processWebhookEvent, recordLeadgenEvents } from "@/lib/leads/meta-ingest";
import { verifyMetaSignature } from "@/lib/meta/signature";
import type { MetaWebhookPayload } from "@/lib/meta/types";
import { ensureIntegrationSettings, setting } from "@/lib/integrations/store";

/** Subscription verification handshake from Meta. */
export async function GET(request: NextRequest) {
  // Tokens maintained in the app: make sure this request sees the current values
  await ensureIntegrationSettings(prisma);
  const params = request.nextUrl.searchParams;
  const verifyToken = setting("META_VERIFY_TOKEN");
  if (
    verifyToken &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * Receives `leadgen` events. Events are stored first (idempotent, deduplicated
 * by leadgen id) and acknowledged immediately; lead details are fetched after
 * the response. Failures are retried by the webhook retry job.
 */
export async function POST(request: NextRequest) {
  await ensureIntegrationSettings(prisma);
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature, setting("META_APP_SECRET") ?? "")) {
    console.warn("[meta-webhook] rejected request with invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { newEventIds, duplicates } = await recordLeadgenEvents(prisma, payload);
  if (duplicates) console.info(`[meta-webhook] ignored ${duplicates} duplicate leadgen event(s)`);

  if (newEventIds.length) {
    after(async () => {
      const deps = ingestDeps();
      for (const id of newEventIds) await processWebhookEvent(deps, id);
    });
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
