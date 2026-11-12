import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { isWhatsAppMock } from "@/lib/whatsapp/client";
import { PURPOSE_LABELS, TEMPLATE_STATUS_LABELS } from "@/lib/whatsapp/labels";
import {
  ALLOWED_VARIABLES,
  exampleValues,
  renderTemplate,
  TEMPLATE_VARIABLES,
} from "@/lib/whatsapp/template-text";
import { NewTemplateFields, TemplateTextField } from "@/components/template-text-field";
import { createTemplate, deleteTemplate, submitTemplate, updateTemplateText } from "./actions";
import { WhatsAppTabs } from "../tabs";

export const metadata: Metadata = { title: "WhatsApp-Texte" };

const variablesFor = (purpose: keyof typeof ALLOWED_VARIABLES) =>
  ALLOWED_VARIABLES[purpose].map((name) => ({
    name,
    description: TEMPLATE_VARIABLES[name].description,
  }));

export default async function TemplatesPage({
  searchParams,
}: PageProps<"/admin/whatsapp/templates">) {
  await requireAdmin();
  const params = await searchParams;
  const created = typeof params.created === "string" ? params.created : null;
  const templates = await prisma.whatsAppTemplate.findMany({
    orderBy: [{ purpose: "asc" }, { name: "asc" }],
  });
  const examples = exampleValues();

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Automatische Nachrichten dürfen nur mit Texten verschickt werden, die Meta vorab genehmigt hat. Geänderte Texte werden als neue Version eingereicht; bis zur Genehmigung wird die bisherige Fassung verwendet."
      />
      <WhatsAppTabs active="texts" />
      {isWhatsAppMock() && (
        <p className="mb-4 rounded-lg border border-amber-600/30 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          WhatsApp läuft im Testmodus (Betreiber → Zugänge): Templates werden nicht wirklich bei
          Meta eingereicht, sondern gelten sofort als genehmigt. Echte Prüfungen durch Meta dauern
          Minuten bis Stunden.
        </p>
      )}
      {created && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Template angelegt (grün markiert). Als Nächstes bei Meta zur Prüfung einreichen.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {templates.map((t) => {
            const status = TEMPLATE_STATUS_LABELS[t.status];
            const changed = t.approvedText !== null && t.approvedText !== t.bodyText;
            const canSubmit =
              t.status !== "PENDING" && (t.approvedText !== t.bodyText || t.status !== "APPROVED");
            return (
              <Card
                key={t.id}
                id={`template-${t.id}`}
                className={created === t.id ? "ring-2 ring-emerald-500/60" : undefined}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{t.name}</h2>
                  <Badge tone="violet">{PURPOSE_LABELS[t.purpose]}</Badge>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {t.category === "MARKETING" && <Badge>Marketing</Badge>}
                  {t.metaTemplateId?.startsWith("mock-") && (
                    <Badge tone="amber">nur Test-Genehmigung</Badge>
                  )}
                  {changed && t.status !== "PENDING" && (
                    <Badge tone="amber">Änderung nicht eingereicht</Badge>
                  )}
                </div>
                {t.rejectedReason && (
                  <p className="mb-2 text-sm text-red-600">Meta: {t.rejectedReason}</p>
                )}
                {t.approvedText && (
                  <div className="mb-3 rounded-lg bg-muted/60 p-3 text-sm">
                    <p className="mb-1 text-xs text-ink-soft">
                      Aktive Fassung ({t.approvedName}, genehmigt {formatDateTime(t.approvedAt)}) –
                      Vorschau:
                    </p>
                    <p className="whitespace-pre-wrap">
                      {renderTemplate(t.approvedText, examples)}
                    </p>
                  </div>
                )}
                <ActionForm action={updateTemplateText.bind(null, t.id)}>
                  <TemplateTextField
                    id={`text-${t.id}`}
                    defaultValue={t.bodyText}
                    variables={variablesFor(t.purpose)}
                    examples={examples}
                    disabled={t.status === "PENDING"}
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <Select
                      name="category"
                      defaultValue={t.category}
                      aria-label="Kategorie"
                      className="w-44"
                      disabled={t.status === "PENDING"}
                    >
                      <option value="UTILITY">Service (Utility)</option>
                      <option value="MARKETING">Marketing</option>
                    </Select>
                    <Button type="submit" variant="secondary" disabled={t.status === "PENDING"}>
                      Speichern
                    </Button>
                  </div>
                </ActionForm>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  <ActionForm
                    action={submitTemplate.bind(null, t.id)}
                    confirm="Diesen Text bei Meta zur Prüfung einreichen?"
                  >
                    <Button type="submit" disabled={!canSubmit}>
                      {t.submissionCount ? "Änderung einreichen" : "Bei Meta einreichen"}
                    </Button>
                  </ActionForm>
                  <ActionForm
                    action={deleteTemplate.bind(null, t.id)}
                    confirm={
                      t.submissionCount
                        ? `Template „${t.name}“ löschen? Es wird auch bei Meta gelöscht; bereits verschickte Nachrichten bleiben im Chatverlauf.`
                        : `Template „${t.name}“ löschen?`
                    }
                  >
                    <Button type="submit" variant="ghost">
                      Löschen
                    </Button>
                  </ActionForm>
                </div>
                {t.status !== "PENDING" && !canSubmit && (
                  <p className="mt-2 text-xs text-ink-soft">
                    Ändern: Text oben anpassen, „Speichern“ und dann „Änderung einreichen“. Bis Meta
                    die neue Fassung genehmigt, wird die bisherige verwendet.
                  </p>
                )}
                {t.status === "PENDING" && (
                  <p className="mt-2 text-xs text-ink-soft">
                    Eingereicht als {t.submittedName} am {formatDateTime(t.submittedAt)}.
                  </p>
                )}
              </Card>
            );
          })}
        </div>

        <Card className="h-fit">
          <CardTitle>Neuer Text</CardTitle>
          <ActionForm action={createTemplate}>
            <NewTemplateFields
              purposes={Object.entries(PURPOSE_LABELS).map(([value, label]) => ({ value, label }))}
              variablesByPurpose={Object.fromEntries(
                Object.keys(PURPOSE_LABELS).map((p) => [
                  p,
                  variablesFor(p as keyof typeof ALLOWED_VARIABLES),
                ]),
              )}
              examples={examples}
            />
            <Field
              label="Name bei Meta"
              htmlFor="name"
              hint="Kleinbuchstaben, Ziffern, Unterstrich."
            >
              <Input id="name" name="name" required placeholder="z. B. erstkontakt" />
            </Field>
            <Field
              label="Kategorie"
              htmlFor="category"
              hint="Service für Erinnerungen; Erstkontakt je nach Inhalt."
            >
              <Select id="category" name="category" defaultValue="UTILITY">
                <option value="UTILITY">Service (Utility)</option>
                <option value="MARKETING">Marketing</option>
              </Select>
            </Field>
            <Button type="submit">Anlegen</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
