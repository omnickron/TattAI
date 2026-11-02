import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import { LeadStatusBadge } from "@/components/lead-status-badge";
import { Badge, Button, Card, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, formatPhone } from "@/lib/format";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, PLATFORM_LABELS } from "@/lib/labels";
import { getLeadForUser } from "@/lib/leads/queries";
import { addLeadNote, deleteLead, updateLead } from "./actions";

export const metadata: Metadata = { title: "Lead" };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const lead = await getLeadForUser(user, id);
  if (!lead) notFound();
  const isAdmin = user.role === "ADMIN";

  return (
    <>
      <Link href="/leads" className="text-sm text-ink-soft hover:text-ink">
        ← Alle Leads
      </Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{lead.name}</h1>
        <LeadStatusBadge status={lead.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card>
            <CardTitle>Kontakt</CardTitle>
            <dl>
              <Row label="Telefon">
                <span className="inline-flex flex-wrap items-center gap-2">
                  {lead.phoneE164 ? (
                    <a
                      className="underline-offset-2 hover:underline"
                      href={`tel:${lead.phoneE164}`}
                    >
                      {lead.phoneE164}
                    </a>
                  ) : (
                    formatPhone(lead.phoneE164, lead.phoneRaw)
                  )}
                  {!lead.phoneValid && <Badge tone="red">ungültig</Badge>}
                </span>
              </Row>
              <Row label="E-Mail">
                {lead.email ? (
                  <a className="underline-offset-2 hover:underline" href={`mailto:${lead.email}`}>
                    {lead.email}
                  </a>
                ) : (
                  "–"
                )}
              </Row>
              <Row label="WhatsApp-Einwilligung">
                {lead.whatsappConsent ? (
                  <span className="space-y-1">
                    <Badge tone="green">erteilt</Badge>{" "}
                    <span className="text-ink-soft">
                      am {formatDateTime(lead.whatsappConsentAt)}
                    </span>
                    {lead.whatsappConsentText && (
                      <span className="mt-1 block rounded-lg bg-muted p-2 text-xs text-ink-soft">
                        „{lead.whatsappConsentText}“
                      </span>
                    )}
                  </span>
                ) : (
                  <Badge tone="amber">nicht erteilt</Badge>
                )}
              </Row>
              <Row label="Eingang">{formatDateTime(lead.createdAt)}</Row>
              <Row label="Status seit">{formatDateTime(lead.statusChangedAt)}</Row>
            </dl>
          </Card>

          <Card>
            <CardTitle>Tattoo-Idee</CardTitle>
            <p className="text-sm text-ink-soft">
              Die Zusammenfassung erscheint hier, sobald der Chatbot sie übermittelt (Phase 3).
            </p>
          </Card>

          <Card>
            <CardTitle>Beratungstermine</CardTitle>
            {lead.consultations.length === 0 ? (
              <p className="text-sm text-ink-soft">Noch kein Termin.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {lead.consultations.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>{formatDateTime(c.startsAt)}</span>
                    <span className="text-ink-soft">{c.tattooer.user.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Chatverlauf</CardTitle>
            {lead.messages.length === 0 ? (
              <p className="text-sm text-ink-soft">
                Noch keine Nachrichten (WhatsApp folgt in Phase 3).
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {lead.messages.map((m) => (
                  <li
                    key={m.id}
                    className={
                      m.direction === "INBOUND"
                        ? "mr-10 rounded-lg bg-muted p-2"
                        : "ml-10 rounded-lg bg-ink p-2 text-paper"
                    }
                  >
                    {m.body ?? `[${m.templateName ?? "Nachricht"}]`}
                    <span className="mt-1 block text-[11px] opacity-70">
                      {formatDateTime(m.sentAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Notizen</CardTitle>
            <ActionForm action={addLeadNote.bind(null, lead.id)}>
              <Textarea name="body" placeholder="Notiz hinzufügen …" required maxLength={5000} />
              <Button type="submit" variant="secondary">
                Notiz speichern
              </Button>
            </ActionForm>
            {lead.notes.length > 0 && (
              <ul className="mt-4 divide-y divide-line">
                {lead.notes.map((n) => (
                  <li key={n.id} className="py-3 text-sm">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {n.author?.name ?? "Unbekannt"} · {formatDateTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Herkunft</CardTitle>
            <dl>
              <Row label="Quelle">
                {lead.source === "META_LEAD_AD" ? "Meta Lead-Formular" : "Manuell"}
              </Row>
              {lead.metaPlatform && (
                <Row label="Plattform">
                  {PLATFORM_LABELS[lead.metaPlatform] ?? lead.metaPlatform}
                </Row>
              )}
              <Row label="Kampagne">{lead.metaCampaignName ?? lead.metaCampaignId ?? "–"}</Row>
              <Row label="Anzeigengruppe">{lead.metaAdsetName ?? lead.metaAdsetId ?? "–"}</Row>
              <Row label="Anzeige">{lead.metaAdName ?? lead.metaAdId ?? "–"}</Row>
              {lead.metaLeadId && (
                <Row label="Meta-Lead-ID">
                  <span className="font-mono text-xs">{lead.metaLeadId}</span>
                </Row>
              )}
            </dl>
          </Card>

          {isAdmin && (
            <Card>
              <CardTitle>Bearbeiten</CardTitle>
              <ActionForm action={updateLead.bind(null, lead.id)}>
                <Field label="Name" htmlFor="name">
                  <Input id="name" name="name" defaultValue={lead.name} required maxLength={200} />
                </Field>
                <Field
                  label="Telefon"
                  htmlFor="phone"
                  hint="Wird ins internationale Format umgewandelt."
                >
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={lead.phoneE164 ?? lead.phoneRaw ?? ""}
                  />
                </Field>
                <Field label="E-Mail" htmlFor="email">
                  <Input id="email" name="email" type="email" defaultValue={lead.email ?? ""} />
                </Field>
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue={lead.status}>
                    {LEAD_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit">Speichern</Button>
              </ActionForm>
            </Card>
          )}

          {isAdmin && (
            <Card className="border-red-200 dark:border-red-900">
              <CardTitle>Lead löschen</CardTitle>
              <p className="mb-3 text-sm text-ink-soft">
                Löscht den Lead endgültig mit allen Notizen, Nachrichten und Terminen (DSGVO).
              </p>
              <ActionForm
                action={deleteLead.bind(null, lead.id)}
                confirm={`Lead „${lead.name}“ wirklich endgültig löschen?`}
              >
                <Button type="submit" variant="danger">
                  Endgültig löschen
                </Button>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
