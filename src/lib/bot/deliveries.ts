/**
 * Delivers queued bot events (BotDelivery) to BOT_WEBHOOK_URL with retries.
 * Headers: X-NEEDL-Event, X-NEEDL-Delivery (idempotency key for the bot),
 * X-NEEDL-Timestamp and X-NEEDL-Signature (HMAC over "<timestamp>.<body>").
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { signBotEvent } from "./auth";

export const MAX_DELIVERY_ATTEMPTS = 10;
const MIN = 60_000;

export interface DeliveryConfig {
  url: string | undefined;
  secret: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export function deliveryConfigFromEnv(): DeliveryConfig {
  return {
    url: process.env.BOT_WEBHOOK_URL || undefined,
    secret: process.env.BOT_WEBHOOK_SECRET || undefined,
  };
}

export async function deliverBotEvents(prisma: PrismaClient, cfg: DeliveryConfig, limit = 25) {
  const now = (cfg.now ?? (() => new Date()))();
  const result = { delivered: 0, failed: 0, dropped: 0 };

  if (!cfg.url || !cfg.secret) {
    // No bot connected: drop events instead of flooding a bot configured later.
    const dropped = await prisma.botDelivery.updateMany({
      where: { status: { in: ["PENDING", "FAILED"] } },
      data: {
        status: "DEAD",
        lastError: "Kein Bot angebunden (BOT_WEBHOOK_URL/BOT_WEBHOOK_SECRET fehlt)",
      },
    });
    return { ...result, dropped: dropped.count };
  }

  const due = await prisma.botDelivery.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { lead: { select: { botEnabled: true } } },
  });

  for (const d of due) {
    // A customer message must not reach the bot after a person took over.
    if (d.event === "message.received" && d.lead && !d.lead.botEnabled) {
      await prisma.botDelivery.update({
        where: { id: d.id },
        data: { status: "DEAD", lastError: "Bot in diesem Chat inzwischen ausgeschaltet" },
      });
      result.dropped++;
      continue;
    }
    const body = JSON.stringify({
      id: d.id,
      event: d.event,
      createdAt: d.createdAt.toISOString(),
      data: d.payload,
    });
    const timestamp = String(Math.floor(now.getTime() / 1000));
    let error: string | null = null;
    try {
      const res = await (cfg.fetchImpl ?? fetch)(cfg.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-needl-event": d.event,
          "x-needl-delivery": d.id,
          "x-needl-timestamp": timestamp,
          "x-needl-signature": signBotEvent(cfg.secret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const attempts = d.attempts + 1;
    if (!error) {
      await prisma.botDelivery.update({
        where: { id: d.id },
        data: { status: "PROCESSED", attempts, deliveredAt: now, lastError: null },
      });
      result.delivered++;
    } else {
      const dead = attempts >= MAX_DELIVERY_ATTEMPTS;
      await prisma.botDelivery.update({
        where: { id: d.id },
        data: {
          status: dead ? "DEAD" : "FAILED",
          attempts,
          lastError: error.slice(0, 500),
          nextAttemptAt: new Date(now.getTime() + Math.min(MIN * 2 ** (attempts - 1), 60 * MIN)),
        },
      });
      result.failed++;
    }
  }
  return result;
}
