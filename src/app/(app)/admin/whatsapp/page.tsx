import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE, formatDateTime } from "@/lib/format";
import { WEEKDAY_LABELS } from "@/lib/labels-time";
import { localDateOf, startOfLocalDay } from "@/lib/time";
import { isWhatsAppMock } from "@/lib/whatsapp/client";
import { OUTBOUND_KIND_LABELS, OUTBOUND_STATUS_LABELS } from "@/lib/whatsapp/labels";
import { loadMessagingSettings, throttleConfig } from "@/lib/whatsapp/messaging";
import { activeBatch, dailyLimit, nextSendTime, parseSendTimes } from "@/lib/whatsapp/throttle";
import {
  addFollowUpStep,
  addReminderRule,
  cancelOutbound,
  deleteFollowUpStep,
  deleteReminderRule,
  pauseSendingAction,
  resumeSending,
  setBotGloballyEnabled,
  setSendingEnabled,
  updateMessagingSettings,
} from "./actions";

export const metadata: Metadata = { title: "WhatsApp" };

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export default async function WhatsAppPage() {
  await requireAdmin();
  const settings = await loadMessagingSettings(prisma);
  const now = new Date();
  const cfg = throttleConfig(settings, APP_TIMEZONE);
  const sendTimes = parseSendTimes(settings.sendTimes);
  const today = localDateOf(now, APP_TIMEZONE);

  const [
    templates,
    steps,
    reminders,
    sentToday,
    queuedByKind,
    queue,
    failures,
    botStats,
    takenOver,
  ] = await Promise.all([
    prisma.whatsAppTemplate.findMany({ orderBy: [{ purpose: "asc" }, { name: "asc" }] }),
    prisma.followUpStep.findMany({ orderBy: { position: "asc" }, include: { template: true } }),
    prisma.reminderRule.findMany({
      orderBy: { hoursBefore: "desc" },
      include: { template: true },
    }),
    prisma.outboundMessage.count({
      where: { status: "SENT", sentAt: { gte: startOfLocalDay(today, APP_TIMEZONE) } },
    }),
    prisma.outboundMessage.groupBy({
      by: ["kind"],
      where: { status: "QUEUED" },
      _count: { _all: true },
    }),
    prisma.outboundMessage.findMany({
      where: { status: "QUEUED" },
      orderBy: [{ notBefore: "asc" }],
      take: 15,
      include: {
        lead: { select: { id: true, name: true } },
        template: { select: { approvedName: true, name: true } },
      },
    }),
    prisma.outboundMessage.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: { lead: { select: { id: true, name: true } } },
    }),
    prisma.botDelivery.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.lead.count({ where: { botEnabled: false } }),
  ]);
  const byPurpose = (p: string) => templates.filter((t) => t.purpose === p);
  const batch = activeBatch(now, cfg);
  const next = nextSendTime(now, cfg);
  const limit = dailyLimit(today, cfg);
  const queued = Object.fromEntries(queuedByKind.map((q) => [q.kind, q._count._all]));
  const workerStale =
    !settings.lastWorkerRunAt || now.getTime() - settings.lastWorkerRunAt.getTime() > 5 * 60_000;
  const botCount = Object.fromEntries(botStats.map((b) => [b.status, b._count._all]));
  const botConfigured = Boolean(
    process.env.BOT_WEBHOOK_URL && process.env.BOT_WEBHOOK_SECRET && process.env.BOT_API_KEY,
  );
  const firstTemplate = templates.find((t) => t.id === settings.firstContactTemplateId);

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Automatische Erstansprache, Nachfassen und Erinnerungen – gestaffelt, damit die Nummer nicht als Spam auffällt."
        actions={
          <ButtonLink href="/admin/whatsapp/templates" variant="secondary">
            Texte (Templates)
          </ButtonLink>
        }
      />

      {isWhatsAppMock() && (
        <p className="mb-4 rounded-lg border border-dashed border-line p-3 text-sm text-ink-soft">
          Beispiel-Modus: Es werden keine echten WhatsApp-Nachrichten verschickt.
        </p>
      )}
      {settings.pausedAt && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <div>
            <p className="font-semibold">
              Versand pausiert seit {formatDateTime(settings.pausedAt)}
            </p>
            <p>{settings.pausedReason}</p>
          </div>
          <ActionForm
            action={resumeSending}
            confirm="Ursache geprüft? Versand wirklich fortsetzen?"
          >
            <Button type="submit">Versand fortsetzen</Button>
          </ActionForm>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle
            action={
              settings.sendingEnabled ? (
                settings.pausedAt ? (
                  <Badge tone="red">pausiert</Badge>
                ) : (
                  <Badge tone="green">aktiv</Badge>
                )
              ) : (
                <Badge>aus</Badge>
              )
            }
          >
            Status
          </CardTitle>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat
              label="Heute gesendet"
              value={`${sentToday} / ${limit}`}
              hint={settings.warmupStartDate ? "Aufwärmphase aktiv" : undefined}
            />
            <Stat
              label="Sendezeit"
              value={
                batch
                  ? "läuft"
                  : next
                    ? new Intl.DateTimeFormat("de-DE", {
                        timeZone: APP_TIMEZONE,
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(next)
                    : "–"
              }
              hint={
                batch
                  ? `bis ${new Intl.DateTimeFormat("de-DE", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(batch.end)}`
                  : "nächste"
              }
            />
            <Stat
              label="In der Warteschlange"
              value={(queued.FIRST_CONTACT ?? 0) + (queued.FOLLOW_UP ?? 0) + (queued.REMINDER ?? 0)}
              hint={`${queued.FIRST_CONTACT ?? 0} Erstk. · ${queued.FOLLOW_UP ?? 0} Nachf. · ${queued.REMINDER ?? 0} Erinn.`}
            />
          </div>
          {workerStale && (
            <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
              Der Hintergrund-Dienst lief zuletzt{" "}
              {settings.lastWorkerRunAt ? formatDateTime(settings.lastWorkerRunAt) : "noch nie"}.
              Ohne ihn wird nichts verschickt (<code>npm run worker</code>).
            </p>
          )}
          {!firstTemplate?.approvedText && (
            <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
              Für den Erstkontakt ist noch kein genehmigtes Template ausgewählt.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <ActionForm
              action={setSendingEnabled.bind(null, !settings.sendingEnabled)}
              confirm={
                settings.sendingEnabled ? undefined : "Automatischen Versand wirklich einschalten?"
              }
            >
              <Button type="submit" variant={settings.sendingEnabled ? "secondary" : "primary"}>
                {settings.sendingEnabled ? "Versand ausschalten" : "Versand einschalten"}
              </Button>
            </ActionForm>
            {settings.sendingEnabled && !settings.pausedAt && (
              <ActionForm action={pauseSendingAction}>
                <Button type="submit" variant="danger">
                  Sofort pausieren
                </Button>
              </ActionForm>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Warteschlange</CardTitle>
          {queue.length === 0 ? (
            <p className="text-sm text-ink-soft">Nichts geplant.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {queue.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <Link href={`/leads/${q.lead.id}`} className="font-medium hover:underline">
                      {q.lead.name}
                    </Link>
                    <span className="block text-xs text-ink-soft">
                      {OUTBOUND_KIND_LABELS[q.kind]}
                      {q.kind === "FOLLOW_UP" && ` ${q.step}`}
                      {q.kind === "REMINDER" && ` ${q.step} h vorher`} · ab{" "}
                      {formatDateTime(q.notBefore)}
                      {q.lastError && ` · ${q.lastError}`}
                    </span>
                  </span>
                  <ActionForm action={cancelOutbound.bind(null, q.id)}>
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                      Entfernen
                    </Button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          {failures.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold">Zuletzt fehlgeschlagen</h3>
              <ul className="divide-y divide-line text-xs">
                {failures.map((f) => (
                  <li key={f.id} className="py-1.5">
                    <Link href={`/leads/${f.lead.id}`} className="font-medium hover:underline">
                      {f.lead.name}
                    </Link>{" "}
                    <Badge tone={OUTBOUND_STATUS_LABELS.FAILED.tone}>
                      {OUTBOUND_KIND_LABELS[f.kind]}
                    </Badge>{" "}
                    <span className="text-ink-soft">{f.lastError}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Sendezeiten und Staffelung</CardTitle>
          <ActionForm action={updateMessagingSettings}>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm text-ink-soft">
                  Erstansprache und Nachfassen werden nur ab diesen Uhrzeiten verschickt (mehrere
                  mit Komma trennen, leer = an diesem Tag nicht).
                </p>
                {Object.entries(WEEKDAY_LABELS).map(([n, label]) => (
                  <div key={n} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
                    <label htmlFor={`times_${n}`} className="text-sm">
                      {label}
                    </label>
                    <Input
                      id={`times_${n}`}
                      name={`times_${n}`}
                      placeholder="z. B. 10:00, 13:00, 17:00"
                      defaultValue={sendTimes
                        .filter((s) => s.weekday === Number(n))
                        .map((s) => s.time)
                        .join(", ")}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 self-start">
                <Field
                  label="Dauer einer Sendezeit (Min.)"
                  htmlFor="batchWindowMinutes"
                  hint="Danach wartet der Rest bis zur nächsten."
                >
                  <Input
                    id="batchWindowMinutes"
                    name="batchWindowMinutes"
                    type="number"
                    min={5}
                    defaultValue={settings.batchWindowMinutes}
                  />
                </Field>
                <Field label="Max. pro Sendezeit" htmlFor="maxPerBatch">
                  <Input
                    id="maxPerBatch"
                    name="maxPerBatch"
                    type="number"
                    min={1}
                    defaultValue={settings.maxPerBatch}
                  />
                </Field>
                <Field
                  label="Abstand min. (Sek.)"
                  htmlFor="minGapSeconds"
                  hint="Zufälliger Abstand zwischen zwei Nachrichten."
                >
                  <Input
                    id="minGapSeconds"
                    name="minGapSeconds"
                    type="number"
                    min={5}
                    defaultValue={settings.minGapSeconds}
                  />
                </Field>
                <Field label="Abstand max. (Sek.)" htmlFor="maxGapSeconds">
                  <Input
                    id="maxGapSeconds"
                    name="maxGapSeconds"
                    type="number"
                    min={5}
                    defaultValue={settings.maxGapSeconds}
                  />
                </Field>
                <Field
                  label="Max. pro Tag"
                  htmlFor="maxPerDay"
                  hint="Alle Nachrichten inkl. Erinnerungen."
                >
                  <Input
                    id="maxPerDay"
                    name="maxPerDay"
                    type="number"
                    min={1}
                    defaultValue={settings.maxPerDay}
                  />
                </Field>
                <Field
                  label="„Keine Antwort“ nach (Std.)"
                  htmlFor="noResponseAfterHours"
                  hint="Nach dem letzten Nachfassen."
                >
                  <Input
                    id="noResponseAfterHours"
                    name="noResponseAfterHours"
                    type="number"
                    min={1}
                    defaultValue={settings.noResponseAfterHours}
                  />
                </Field>
                <div className="col-span-2 rounded-lg bg-muted/60 p-3">
                  <p className="mb-2 text-sm font-medium">Aufwärmphase für eine neue Nummer</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Start" htmlFor="warmupStartDate" hint="leer = aus">
                      <Input
                        id="warmupStartDate"
                        name="warmupStartDate"
                        type="date"
                        defaultValue={settings.warmupStartDate?.toISOString().slice(0, 10) ?? ""}
                      />
                    </Field>
                    <Field label="Pro Tag anfangs" htmlFor="warmupStartPerDay">
                      <Input
                        id="warmupStartPerDay"
                        name="warmupStartPerDay"
                        type="number"
                        min={1}
                        defaultValue={settings.warmupStartPerDay}
                      />
                    </Field>
                    <Field label="+ pro Tag" htmlFor="warmupIncreasePerDay">
                      <Input
                        id="warmupIncreasePerDay"
                        name="warmupIncreasePerDay"
                        type="number"
                        min={0}
                        defaultValue={settings.warmupIncreasePerDay}
                      />
                    </Field>
                  </div>
                </div>
                <div className="col-span-2">
                  <Field label="Template für den Erstkontakt" htmlFor="firstContactTemplateId">
                    <Select
                      id="firstContactTemplateId"
                      name="firstContactTemplateId"
                      defaultValue={settings.firstContactTemplateId ?? ""}
                    >
                      <option value="">– keins (kein automatischer Erstkontakt) –</option>
                      {byPurpose("FIRST_CONTACT").map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.approvedText ? "" : "(noch nicht genehmigt)"}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            </div>
            <Button type="submit">Speichern</Button>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Nachfassen ohne Antwort</CardTitle>
          {steps.length === 0 ? (
            <p className="mb-3 text-sm text-ink-soft">Kein Nachfassen eingerichtet.</p>
          ) : (
            <ol className="mb-3 divide-y divide-line text-sm">
              {steps.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{s.position}.</span> {s.delayHours} Std. nach der{" "}
                    {s.position === 1 ? "Erstansprache" : "vorigen Nachricht"} ·{" "}
                    <span className="text-ink-soft">{s.template.name}</span>
                  </span>
                  <ActionForm action={deleteFollowUpStep.bind(null, s.id)}>
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                      Entfernen
                    </Button>
                  </ActionForm>
                </li>
              ))}
            </ol>
          )}
          <p className="mb-3 text-xs text-ink-soft">
            Antwortet der Kunde, entfallen alle weiteren Schritte. Nachfass-Nachrichten gehen
            ebenfalls nur zu den Sendezeiten raus.
          </p>
          <ActionForm
            action={addFollowUpStep}
            className="grid grid-cols-[7rem_1fr] items-end gap-2 space-y-0"
          >
            <Field label="Nach (Std.)" htmlFor="delayHours">
              <Input id="delayHours" name="delayHours" type="number" min={1} defaultValue={24} />
            </Field>
            <Field label="Template" htmlFor="follow-template">
              <Select id="follow-template" name="templateId">
                {byPurpose("FOLLOW_UP").map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="col-span-2">
              <Button type="submit" variant="secondary">
                Schritt hinzufügen
              </Button>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Erinnerungen vor dem Termin</CardTitle>
          {reminders.length === 0 ? (
            <p className="mb-3 text-sm text-ink-soft">Keine Erinnerungen eingerichtet.</p>
          ) : (
            <ul className="mb-3 divide-y divide-line text-sm">
              {reminders.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {r.hoursBefore} Std. vorher ·{" "}
                    <span className="text-ink-soft">{r.template.name}</span>
                  </span>
                  <ActionForm action={deleteReminderRule.bind(null, r.id)}>
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                      Entfernen
                    </Button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <p className="mb-3 text-xs text-ink-soft">
            Erinnerungen gehen pünktlich raus (auch außerhalb der Sendezeiten), halten aber den
            Abstand ein.
          </p>
          <ActionForm
            action={addReminderRule}
            className="grid grid-cols-[7rem_1fr] items-end gap-2 space-y-0"
          >
            <Field label="Std. vorher" htmlFor="hoursBefore">
              <Input id="hoursBefore" name="hoursBefore" type="number" min={1} defaultValue={24} />
            </Field>
            <Field label="Template" htmlFor="reminder-template">
              <Select id="reminder-template" name="templateId">
                {byPurpose("REMINDER").map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="col-span-2">
              <Button type="submit" variant="secondary">
                Erinnerung hinzufügen
              </Button>
            </div>
          </ActionForm>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle
            action={
              settings.botGloballyEnabled ? <Badge tone="green">aktiv</Badge> : <Badge>aus</Badge>
            }
          >
            Chatbot
          </CardTitle>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <div className="space-y-1 text-sm text-ink-soft">
              <p>
                Der Bot beantwortet Kundennachrichten über die Bot-Schnittstelle. Sobald jemand im
                Chat selbst antwortet, schaltet er sich dort ab; pro Chat lässt er sich auf der
                Lead-Seite ein- und ausschalten.
              </p>
              <p>
                Anbindung:{" "}
                {botConfigured
                  ? "eingerichtet"
                  : "noch nicht eingerichtet (BOT_API_KEY, BOT_WEBHOOK_URL, BOT_WEBHOOK_SECRET)"}{" "}
                · Chats ohne Bot: {takenOver} · Ereignisse: {botCount.PROCESSED ?? 0} zugestellt,{" "}
                {botCount.PENDING ?? 0} offen, {botCount.FAILED ?? 0} mit Fehler,{" "}
                {botCount.DEAD ?? 0} verworfen
              </p>
            </div>
            <ActionForm
              action={setBotGloballyEnabled.bind(null, !settings.botGloballyEnabled)}
              confirm={
                settings.botGloballyEnabled ? "Bot wirklich für alle Chats ausschalten?" : undefined
              }
            >
              <Button type="submit" variant={settings.botGloballyEnabled ? "danger" : "primary"}>
                {settings.botGloballyEnabled ? "Bot überall ausschalten" : "Bot wieder einschalten"}
              </Button>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
