import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/meta/signature";
import { processWhatsAppWebhook, type WaWebhookPayload } from "@/lib/whatsapp/webhook";

/** Subscription verification handshake from Meta. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
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
 * WhatsApp Cloud API events. Processing is idempotent, so on errors we answer
 * 500 and let Meta retry the delivery.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "";
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), secret)) {
    console.warn("[whatsapp-webhook] rejected request with invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: WaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  try {
    await processWhatsAppWebhook(prisma, payload);
  } catch (err) {
    console.error(
      "[whatsapp-webhook] processing failed:",
      err instanceof Error ? err.message : err,
    );
    return new Response("Error", { status: 500 });
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}
