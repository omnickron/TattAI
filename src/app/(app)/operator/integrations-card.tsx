import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Field, Input } from "@/components/ui";
import { appUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { GROUPS, SETTINGS, type IntegrationGroup } from "@/lib/integrations/registry";
import { setting, settingSource } from "@/lib/integrations/store";
import { ActionButton } from "../admin/billing/buttons";
import {
  clearIntegrationSetting,
  saveIntegration,
  registerMetaWebhook,
  registerWhatsAppWebhook,
  setIntegrationLive,
  subscribeMetaPage,
  subscribeWhatsAppAccount,
  testIntegration,
} from "./integration-actions";

const WEBHOOKS: Partial<Record<IntegrationGroup, string>> = {
  whatsapp: "/api/webhooks/whatsapp",
  meta: "/api/webhooks/meta",
};

/** Access data of TeamUp, WhatsApp and Meta – encrypted in the app, .env as fallback. */
export async function IntegrationsCard() {
  const [rows, log] = await Promise.all([
    prisma.integrationSetting.findMany(),
    prisma.integrationSettingLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const stored = new Map(rows.map((r) => [r.key, r]));
  const label = (key: string) =>
    SETTINGS.find((s) => s.key === key)?.label ??
    GROUPS.find((g) => g.modeKey === key)?.title + " Modus";

  return (
    <Card className="mb-4" id="zugaenge">
      <p className="mb-4 text-sm text-ink-soft">
        Schlüssel und Tokens werden verschlüsselt gespeichert und nach dem Speichern nie wieder
        angezeigt – nur die letzten Zeichen. Leere Felder bleiben unverändert. Was hier fehlt, kommt
        aus der .env auf dem Server. Änderungen gelten nach spätestens einer Minute.
      </p>
      <div className="space-y-4">
        {GROUPS.map((g) => {
          const live = setting(g.modeKey) !== "true";
          const defs = SETTINGS.filter((s) => s.group === g.id);
          return (
            <section key={g.id} className="rounded-lg border border-line p-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{g.title}</h3>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={live ? "green" : "gray"}>{live ? "live" : "Testmodus"}</Badge>
                  <ActionButton
                    action={setIntegrationLive.bind(null, g.id, !live)}
                    confirm={
                      live
                        ? `${g.title} in den Testmodus schalten? Es wird dann nichts Echtes mehr gesendet oder abgerufen.`
                        : `${g.title} live schalten? Ab dann laufen echte Daten.`
                    }
                  >
                    {live ? "Testmodus" : "Live schalten"}
                  </ActionButton>
                  <ActionButton action={testIntegration.bind(null, g.id)}>
                    Verbindung testen
                  </ActionButton>
                  {g.id === "whatsapp" && (
                    <>
                      <ActionButton action={registerWhatsAppWebhook}>
                        Webhook bei Meta eintragen
                      </ActionButton>
                      <ActionButton action={subscribeWhatsAppAccount}>
                        WhatsApp-Konto verbinden
                      </ActionButton>
                    </>
                  )}
                  {g.id === "meta" && (
                    <>
                      <ActionButton action={registerMetaWebhook}>
                        Webhook bei Meta eintragen
                      </ActionButton>
                      <ActionButton action={subscribeMetaPage}>
                        Seite für Leads abonnieren
                      </ActionButton>
                    </>
                  )}
                </span>
              </div>
              <p className="mb-3 text-sm text-ink-soft">{g.intro}</p>
              {WEBHOOKS[g.id] && (
                <p className="mb-3 text-xs text-ink-soft">
                  Webhook-Adresse für Meta:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-ink">
                    {appUrl(WEBHOOKS[g.id]!).toString()}
                  </code>
                </p>
              )}
              <ActionForm
                action={saveIntegration.bind(null, g.id)}
                className="grid gap-3 space-y-0 sm:grid-cols-2"
              >
                {defs.map((d) => {
                  const row = stored.get(d.key);
                  const source = settingSource(d.key);
                  const status =
                    source === "app"
                      ? d.secret
                        ? `in der App gesetzt${row?.hint ? ` · endet auf …${row.hint}` : ""}`
                        : `in der App: ${setting(d.key)}`
                      : source === "env"
                        ? d.secret
                          ? "aus der .env"
                          : `aus der .env: ${setting(d.key)}`
                        : "fehlt";
                  return (
                    <Field
                      key={d.key}
                      label={d.label}
                      htmlFor={`int-${d.key}`}
                      hint={`${status}${d.hint ? ` – ${d.hint}` : ""}`}
                    >
                      <span className="flex gap-2">
                        <Input
                          id={`int-${d.key}`}
                          name={d.key}
                          type={d.secret ? "password" : "text"}
                          autoComplete="off"
                          placeholder={source === "missing" ? "eintragen" : "unverändert lassen"}
                        />
                      </span>
                    </Field>
                  );
                })}
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                  <Button type="submit">Speichern</Button>
                  {defs
                    .filter((d) => stored.has(d.key))
                    .map((d) => (
                      <ActionButton
                        key={d.key}
                        variant="danger"
                        action={clearIntegrationSetting.bind(null, d.key)}
                        confirm={`„${d.label}“ aus der App entfernen? Dann gilt wieder die .env.`}
                      >
                        {d.label} entfernen
                      </ActionButton>
                    ))}
                </div>
              </ActionForm>
            </section>
          );
        })}
      </div>
      {log.length > 0 && (
        <div className="mt-4 text-xs text-ink-soft">
          <p className="mb-1 font-medium text-ink">Letzte Änderungen</p>
          <ul className="space-y-0.5">
            {log.map((l) => (
              <li key={l.id}>
                {formatDateTime(l.createdAt)} · {label(l.key)}{" "}
                {l.action === "cleared" ? "entfernt" : "geändert"} · {l.userName ?? "?"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
