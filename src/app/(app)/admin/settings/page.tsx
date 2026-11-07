import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { loadConsultationOptions } from "@/lib/consultation-options";
import { LEAD_RETENTION_MONTHS } from "@/lib/leads/retention";
import { updateConsentSettings, updateConsultationSettings, updateStudioSettings } from "./actions";
import { TeamupCard } from "./teamup-card";
import { setting } from "@/lib/integrations/store";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, failedEvents] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.webhookEvent.findMany({
      where: { status: { in: ["FAILED", "DEAD"] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);
  const mockMode = setting("META_GRAPH_MOCK") === "true";
  const consultation = await loadConsultationOptions(prisma);

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>WhatsApp-Einwilligung (Meta-Formular)</CardTitle>
          <p className="mb-4 text-sm text-ink-soft">
            Das Häkchen im Instant-Formular wird über seinen Schlüssel erkannt. Der Wortlaut wird
            bei jedem neuen Lead zusammen mit dem Zeitpunkt gespeichert. Er muss exakt dem Text im
            Formular entsprechen.
          </p>
          <ActionForm action={updateConsentSettings}>
            <Field
              label="Schlüssel des Häkchens"
              htmlFor="consentCheckboxKey"
              hint="Im Meta-Formular unter „Eigener Haftungsausschluss“ → Kontrollkästchen. Ohne Schlüssel wird keine Einwilligung gespeichert."
            >
              <Input
                id="consentCheckboxKey"
                name="consentCheckboxKey"
                defaultValue={settings?.consentCheckboxKey ?? ""}
                placeholder="z. B. whatsapp_consent"
              />
            </Field>
            <Field label="Wortlaut der Einwilligung" htmlFor="consentText">
              <Textarea
                id="consentText"
                name="consentText"
                defaultValue={settings?.consentText ?? ""}
                placeholder="Ich bin damit einverstanden, dass mich … per WhatsApp kontaktiert …"
                rows={5}
              />
            </Field>
            <Button type="submit">Speichern</Button>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Studio</CardTitle>
          <ActionForm action={updateStudioSettings}>
            <Field
              label="Name des Studios"
              htmlFor="studioName"
              hint="Platzhalter {{Studio}} in WhatsApp-Texten."
            >
              <Input id="studioName" name="studioName" defaultValue={settings?.studioName ?? ""} />
            </Field>
            <Field
              label="Adresse für Beratungen vor Ort"
              htmlFor="studioAddress"
              hint="Wird als Ort in die Kalendereinträge geschrieben. Telefonberatungen bekommen keinen Ort."
            >
              <Input
                id="studioAddress"
                name="studioAddress"
                defaultValue={settings?.studioAddress ?? ""}
                placeholder="Straße Nr., PLZ Ort"
              />
            </Field>
            <Button type="submit">Speichern</Button>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Beratung</CardTitle>
          <p className="mb-4 text-sm text-ink-soft">
            Welche Beratungsformen ihr anbietet. Nur diese stehen beim Buchen zur Auswahl, und nur
            diese bietet der Bot an.
          </p>
          <ActionForm action={updateConsultationSettings}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="onSite"
                defaultChecked={consultation.modes.includes("ON_SITE")}
              />
              Vor Ort im Studio
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="phone"
                defaultChecked={consultation.modes.includes("PHONE")}
              />
              Telefonisch (für Kunden, die nicht anreisen können)
            </label>
            <label className="flex items-center gap-2 border-t border-line pt-3 text-sm">
              <input type="checkbox" name="free" defaultChecked={consultation.free} />
              Die Beratung ist kostenlos (der Bot darf das sagen)
            </label>
            <Button type="submit">Speichern</Button>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Datenschutz</CardTitle>
          <p className="text-sm text-ink-soft">
            Leads ohne Beratung oder Termin werden {LEAD_RETENTION_MONTHS} Monate nach der letzten
            Aktivität (Anlage, Nachricht, Statusänderung) automatisch mit Chat, Notizen und Bildern
            gelöscht. Kunden mit Termin bleiben erhalten. Einzelne Leads löscht ihr auf der
            Lead-Seite.
          </p>
        </Card>

        <TeamupCard />

        <Card>
          <CardTitle>Meta-Anbindung</CardTitle>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Modus</dt>
              <dd>
                {mockMode ? (
                  <Badge tone="amber">Beispieldaten</Badge>
                ) : (
                  <Badge tone="green">Live</Badge>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Webhook-URL</dt>
              <dd className="font-mono text-xs">
                {(process.env.APP_URL ?? "") + "/api/webhooks/meta"}
              </dd>
            </div>
          </dl>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Fehlgeschlagene Lead-Abrufe</h3>
          {failedEvents.length === 0 ? (
            <p className="text-sm text-ink-soft">Keine.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {failedEvents.map((e) => (
                <li key={e.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{e.externalId}</span>
                    <Badge tone={e.status === "DEAD" ? "red" : "amber"}>
                      {e.status === "DEAD" ? "aufgegeben" : `Versuch ${e.attempts}`}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {e.lastError} · {formatDateTime(e.updatedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
