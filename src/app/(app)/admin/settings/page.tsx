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
import { updateConsentSettings, updateStudioSettings } from "./actions";
import { BillingCard } from "./billing-card";
import { TeamupCard } from "./teamup-card";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const user = await requireAdmin();
  const [settings, failedEvents] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.webhookEvent.findMany({
      where: { status: { in: ["FAILED", "DEAD"] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);
  const mockMode = process.env.META_GRAPH_MOCK === "true";

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

        <TeamupCard />

        <BillingCard user={user} />

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
