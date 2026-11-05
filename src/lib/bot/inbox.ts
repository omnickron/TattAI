/**
 * Worker step for the built-in bot: picks up queued customer messages
 * ("message.received" bot events), waits briefly so that several messages typed in a
 * row get one answer, and runs one bot turn per chat. Failed runs are retried with
 * backoff; after too many failures the chat goes to a person.
 */
import { MAX_DELIVERY_ATTEMPTS } from "./deliveries";
import { runBotTurn, type BrainDeps } from "./brain";
import { setBotEnabled } from "./state";

export const BOT_EVENT = "message.received";
/** Wait this long after the newest message before answering. */
export const DEBOUNCE_MS = 20_000;
const MIN = 60_000;

export async function processBotInbox(deps: BrainDeps, limit = 10) {
  const { prisma } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const result = { answered: 0, handedOver: 0, failed: 0, skipped: 0 };

  const due = await prisma.botDelivery.findMany({
    where: { event: BOT_EVENT, status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      leadId: true,
      attempts: true,
      createdAt: true,
      lead: { select: { lastInboundAt: true } },
    },
  });
  const byLead = new Map<string, typeof due>();
  for (const d of due) if (d.leadId) byLead.set(d.leadId, [...(byLead.get(d.leadId) ?? []), d]);

  let runs = 0;
  for (const [leadId, list] of byLead) {
    if (runs >= limit) break;
    const newest = list[0].lead?.lastInboundAt?.getTime() ?? 0;
    if (now.getTime() - newest < DEBOUNCE_MS) continue;
    runs++;
    const ids = list.map((d) => d.id);
    try {
      const r = await runBotTurn(deps, leadId);
      await prisma.botDelivery.updateMany({
        where: { id: { in: ids } },
        data: {
          status: "PROCESSED",
          deliveredAt: now,
          lastError: r.outcome === "skipped" ? "Bot in diesem Chat ausgeschaltet" : null,
        },
      });
      if (r.outcome === "skipped") result.skipped++;
      else if (r.outcome === "handover") result.handedOver++;
      else result.answered++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[bot] turn for lead ${leadId} failed:`, message);
      const attempts = Math.max(...list.map((d) => d.attempts)) + 1;
      const dead = attempts >= Math.min(MAX_DELIVERY_ATTEMPTS, 5);
      await prisma.botDelivery.updateMany({
        where: { id: { in: ids } },
        data: {
          status: dead ? "DEAD" : "FAILED",
          attempts,
          lastError: message.slice(0, 500),
          nextAttemptAt: new Date(now.getTime() + Math.min(MIN * 2 ** (attempts - 1), 15 * MIN)),
        },
      });
      if (dead) {
        await setBotEnabled(prisma, leadId, false, { reason: "BOT_HANDOVER", now });
        await prisma.lead.update({
          where: { id: leadId },
          data: { botHandoverNote: `Bot-Fehler: ${message.slice(0, 300)}` },
        });
        await prisma.botTurn.create({
          data: { leadId, outcome: "error", error: message.slice(0, 500) },
        });
      }
      result.failed++;
    }
  }
  return result;
}
