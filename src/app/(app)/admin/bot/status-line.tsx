import { Badge } from "@/components/ui";
import { botSpend, loadBotSettings } from "@/lib/bot/guard";
import { microsToCents } from "@/lib/bot/costs";
import { isBotGloballyEnabled } from "@/lib/bot/state";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";

/** Bot status for the studio – without costs (those are on the operator page). */
export async function BotStatusLine() {
  const [settings, spend, globally] = await Promise.all([
    loadBotSettings(prisma),
    botSpend(prisma, new Date(), APP_TIMEZONE),
    isBotGloballyEnabled(prisma),
  ]);
  const limitReached =
    microsToCents(spend.dayMicros) >= settings.dailyBudgetCents ||
    microsToCents(spend.monthMicros) >= settings.monthlyBudgetCents;
  const status = !process.env.ANTHROPIC_API_KEY
    ? {
        tone: "gray" as const,
        label: "noch nicht verbunden",
        text: "Der Bot ist noch nicht angebunden.",
      }
    : !globally
      ? {
          tone: "gray" as const,
          label: "ausgeschaltet",
          text: "Der Bot ist für alle Chats ausgeschaltet (WhatsApp-Einstellungen).",
        }
      : settings.pausedAt || limitReached
        ? {
            tone: "amber" as const,
            label: "pausiert",
            text: "Der Bot pausiert gerade – neue Nachrichten landen bei euch unter „Braucht euch“.",
          }
        : {
            tone: "green" as const,
            label: "aktiv",
            text: "Der Bot beantwortet neue Nachrichten. Übergaben findet ihr unter „Braucht euch“.",
          };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <Badge tone={status.tone}>Bot {status.label}</Badge>
      <span className="text-ink-soft">{status.text}</span>
    </div>
  );
}
