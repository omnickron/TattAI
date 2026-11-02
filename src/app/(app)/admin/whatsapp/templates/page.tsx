import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { PURPOSE_LABELS, TEMPLATE_STATUS_LABELS } from "@/lib/whatsapp/labels";
import {
  ALLOWED_VARIABLES,
  exampleValues,
  renderTemplate,
  TEMPLATE_VARIABLES,
} from "@/lib/whatsapp/template-text";
import { createTemplate, deleteTemplate, submitTemplate, updateTemplateText } from "./actions";

export const metadata: Metadata = { title: "WhatsApp-Texte" };

function Variables({ purpose }: { purpose: keyof typeof ALLOWED_VARIABLES }) {
  return (
    <p className="text-xs text-ink-soft">
      Platzhalter:{" "}
      {ALLOWED_VARIABLES[purpose].map((v, i) => (
        <span key={v}>
          {i > 0 && ", "}
          <code className="rounded bg-muted px-1">{`{{${v}}}`}</code>
        </span>
      ))}
    </p>
  );
}

export default async function TemplatesPage() {
  await requireAdmin();
  const templates = await prisma.whatsAppTemplate.findMany({
    orderBy: [{ purpose: "asc" }, { name: "asc" }],
  });
  const examples = exampleValues();

  return (
    <>
      <Link href="/admin/whatsapp" className="text-sm text-ink-soft hover:text-ink">
        ← WhatsApp
      </Link>
      <PageHeader
        title="WhatsApp-Texte"
        description="Automatische Nachrichten dürfen nur mit Texten verschickt werden, die Meta vorab genehmigt hat. Geänderte Texte werden als neue Version eingereicht; bis zur Genehmigung wird die bisherige Fassung verwendet."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {templates.map((t) => {
            const status = TEMPLATE_STATUS_LABELS[t.status];
            const changed = t.approvedText !== null && t.approvedText !== t.bodyText;
            const canSubmit =
              t.status !== "PENDING" && (t.approvedText !== t.bodyText || t.status !== "APPROVED");
            return (
              <Card key={t.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{t.name}</h2>
                  <Badge tone="violet">{PURPOSE_LABELS[t.purpose]}</Badge>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {t.category === "MARKETING" && <Badge>Marketing</Badge>}
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
                  <Field label="Text" htmlFor={`text-${t.id}`}>
                    <Textarea
                      id={`text-${t.id}`}
                      name="bodyText"
                      defaultValue={t.bodyText}
                      rows={4}
                      maxLength={1024}
                      disabled={t.status === "PENDING"}
                    />
                  </Field>
                  <Variables purpose={t.purpose} />
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
                  {!t.approvedText && (
                    <ActionForm
                      action={deleteTemplate.bind(null, t.id)}
                      confirm={`Template „${t.name}“ löschen?`}
                    >
                      <Button type="submit" variant="ghost">
                        Löschen
                      </Button>
                    </ActionForm>
                  )}
                </div>
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
            <Field label="Verwendung" htmlFor="purpose">
              <Select id="purpose" name="purpose" defaultValue="FIRST_CONTACT">
                {Object.entries(PURPOSE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
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
            <Field label="Text" htmlFor="bodyText">
              <Textarea
                id="bodyText"
                name="bodyText"
                rows={5}
                required
                maxLength={1024}
                placeholder="Hallo {{Vorname}}, danke für deine Anfrage …"
              />
            </Field>
            <div className="space-y-1 text-xs text-ink-soft">
              {Object.entries(TEMPLATE_VARIABLES).map(([k, v]) => (
                <p key={k}>
                  <code className="rounded bg-muted px-1">{`{{${k}}}`}</code> {v.description}
                </p>
              ))}
              <p>Datum, Uhrzeit, Ort und Tätowierer gibt es nur in Erinnerungen.</p>
            </div>
            <Button type="submit">Anlegen</Button>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
