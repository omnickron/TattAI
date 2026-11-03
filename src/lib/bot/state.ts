/**
 * Whether the chatbot may act in a chat. It is switched off per chat when a
 * person replies (takeover) or manually, and globally via the master switch.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type BotDisabledReason = "HUMAN_TAKEOVER" | "MANUAL";

export const BOT_REASON_LABELS: Record<BotDisabledReason, string> = {
  HUMAN_TAKEOVER: "Chat von einem Menschen übernommen",
  MANUAL: "manuell ausgeschaltet",
};

type Db = Pick<PrismaClient, "lead" | "botDelivery" | "messagingSettings">;

/** Queues an event for the bot webhook (delivered with retries by the worker). */
export async function enqueueBotEvent(
  db: Pick<PrismaClient, "botDelivery">,
  event: string,
  leadId: string | null,
  data: Record<string, unknown>,
) {
  return db.botDelivery.create({
    data: { event, leadId, payload: { event, ...data } as Prisma.InputJsonValue },
  });
}

export async function isBotGloballyEnabled(
  db: Pick<PrismaClient, "messagingSettings">,
): Promise<boolean> {
  const s = await db.messagingSettings.findUnique({
    where: { id: 1 },
    select: { botGloballyEnabled: true },
  });
  return s?.botGloballyEnabled ?? true;
}

/** Bot may act in this chat: master switch on, chat not taken over, no opt-out. */
export function botActiveFor(
  lead: { botEnabled: boolean; whatsappOptOut: boolean },
  globallyEnabled: boolean,
): boolean {
  return globallyEnabled && lead.botEnabled && !lead.whatsappOptOut;
}

/** Switches the bot for one chat on or off and informs the bot. Idempotent. */
export async function setBotEnabled(
  db: Db,
  leadId: string,
  enabled: boolean,
  opts: { userId?: string | null; reason?: BotDisabledReason; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, botEnabled: true },
  });
  if (!lead || lead.botEnabled === enabled) return false;
  await db.lead.update({
    where: { id: leadId },
    data: enabled
      ? { botEnabled: true, botDisabledAt: null, botDisabledReason: null, botDisabledById: null }
      : {
          botEnabled: false,
          botDisabledAt: now,
          botDisabledReason: opts.reason ?? "MANUAL",
          botDisabledById: opts.userId ?? null,
        },
  });
  await enqueueBotEvent(db, enabled ? "chat.bot_enabled" : "chat.bot_disabled", leadId, {
    leadId,
    reason: enabled ? null : (opts.reason ?? "MANUAL"),
    at: now.toISOString(),
  });
  return true;
}
