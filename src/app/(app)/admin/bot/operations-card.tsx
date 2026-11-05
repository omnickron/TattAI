import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, Field, Input } from "@/components/ui";
import { formatEuro, microsToCents } from "@/lib/bot/costs";
import { botSpend, ERROR_PAUSE_COUNT, loadBotSettings } from "@/lib/bot/guard";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE, formatDateTime } from "@/lib/format";
import { setBotPaused, updateBotSettings } from "./actions";

function Meter({ label, cents, limit }: { label: string; cents: number; limit: number }) {
  const share = limit > 0 ? Math.min(1, cents / limit) : 1;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-ink-soft">{label}</span>
        <span className="tabular-nums">
          {formatEuro(cents)} von {formatEuro(limit)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={
            share >= 1
              ? "h-full bg-red-600"
              : share >= 0.8
                ? "h-full bg-amber-500"
                : "h-full bg-ink"
          }
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Status, costs and safety limits of the built-in bot. */
export async function OperationsCard() {
  const now = new Date();
  const [settings, spend] = await Promise.all([
    loadBotSettings(prisma),
    botSpend(prisma, now, APP_TIMEZONE),
  ]);
  const since = spend.dayStart;
  const [replies, handovers, errors, recentErrors] = await Promise.all([
    prisma.message.count({ where: { sentByBot: true, sentAt: { gte: since } } }),
    prisma.botTurn.count({ where: { outcome: "handover", createdAt: { gte: since } } }),
    prisma.botTurn.count({ where: { outcome: "error", createdAt: { gte: since } } }),
    prisma.botTurn.findMany({
      where: { outcome: "error" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, createdAt: true, error: true },
    }),
  ]);
  const connected = Boolean(process.env.ANTHROPIC_API_KEY);
  const dayCents = microsToCents(spend.dayMicros);
  const monthCents = microsToCents(spend.monthMicros);
  const status = !connected
    ? { tone: "gray" as const, label: "nicht verbunden" }
    : settings.pausedAt
      ? { tone: "red" as const, label: "pausiert" }
      : dayCents >= settings.dailyBudgetCents || monthCents >= settings.monthlyBudgetCents
        ? { tone: "red" as const, label: "Kostenlimit erreicht" }
        : { tone: "green" as const, label: "aktiv" };

  return (
    <Card className="mb-4">
      <CardTitle action={<Badge tone={status.tone}>{status.label}</Badge>}>Betrieb</CardTitle>

      {!connected && (
        <p className="mb-4 rounded-lg bg-muted p-3 text-sm text-ink-soft">
          Der Bot antwortet erst, wenn auf dem Server ein Anthropic-API-Key hinterlegt ist
          (ANTHROPIC_API_KEY in der .env).
        </p>
      )}
      {settings.pausedAt && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          <span>
            Pausiert seit {formatDateTime(settings.pausedAt)}: {settings.pausedReason}. Neue
            Nachrichten gehen an euch.
          </span>
          <form action={setBotPaused.bind(null, false)}>
            <Button type="submit">Wieder starten</Button>
          </form>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Meter label="Kosten heute" cents={dayCents} limit={settings.dailyBudgetCents} />
          <Meter
            label="Kosten diesen Monat"
            cents={monthCents}
            limit={settings.monthlyBudgetCents}
          />
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Antworten heute", replies],
              ["Übergaben heute", handovers],
              ["Fehler heute", errors],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/60 p-2">
                <dt className="text-xs text-ink-soft">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {recentErrors.length > 0 && (
            <div className="text-xs text-ink-soft">
              <p className="mb-1 font-medium text-ink">Letzte Fehler</p>
              <ul className="space-y-1">
                {recentErrors.map((e) => (
                  <li key={e.id} className="truncate">
                    {formatDateTime(e.createdAt)} – {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-ink-soft">
            Kosten nach Listenpreis von Anthropic, 1 $ als 1 € gerechnet (vorsichtig). Ist ein Limit
            erreicht, übernimmt der Bot keine neuen Nachrichten – sie landen bei euch unter „Braucht
            euch“. Tipp: Zusätzlich ein Ausgabenlimit in der Anthropic Console setzen.
          </p>
          {!settings.pausedAt && connected && (
            <form action={setBotPaused.bind(null, true)}>
              <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                Bot für alle Chats pausieren
              </Button>
            </form>
          )}
        </div>

        <ActionForm action={updateBotSettings}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kostenlimit pro Tag (€)" htmlFor="dailyBudget">
              <Input
                id="dailyBudget"
                name="dailyBudget"
                inputMode="decimal"
                defaultValue={String(settings.dailyBudgetCents / 100).replace(".", ",")}
              />
            </Field>
            <Field label="Kostenlimit pro Monat (€)" htmlFor="monthlyBudget">
              <Input
                id="monthlyBudget"
                name="monthlyBudget"
                inputMode="decimal"
                defaultValue={String(settings.monthlyBudgetCents / 100).replace(".", ",")}
              />
            </Field>
            <Field
              label="Antworten pro Kunde / Stunde"
              htmlFor="maxPerHourPerLead"
              hint="Darüber übergibt der Bot den Chat."
            >
              <Input
                id="maxPerHourPerLead"
                name="maxPerHourPerLead"
                type="number"
                min={1}
                defaultValue={settings.maxPerHourPerLead}
              />
            </Field>
            <Field label="Antworten pro Kunde / Tag" htmlFor="maxPerDayPerLead">
              <Input
                id="maxPerDayPerLead"
                name="maxPerDayPerLead"
                type="number"
                min={1}
                defaultValue={settings.maxPerDayPerLead}
              />
            </Field>
            <Field
              label="Antworten pro Tag (alle Chats)"
              htmlFor="maxPerDayTotal"
              hint="Schutz vor Ausreißern."
            >
              <Input
                id="maxPerDayTotal"
                name="maxPerDayTotal"
                type="number"
                min={1}
                defaultValue={settings.maxPerDayTotal}
              />
            </Field>
          </div>
          <p className="text-xs text-ink-soft">
            Nach {ERROR_PAUSE_COUNT} Fehlern in 30 Minuten pausiert der Bot von selbst; der Admin
            bekommt eine Push-Nachricht.
          </p>
          <Button type="submit">Grenzen speichern</Button>
        </ActionForm>
      </div>
    </Card>
  );
}
