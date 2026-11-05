import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, Field, Input, Textarea } from "@/components/ui";
import { isOperator } from "@/lib/auth/operator";
import type { CurrentUser } from "@/lib/auth/session";
import { issuerComplete, loadBillingConfig } from "@/lib/billing/billing";
import { prisma } from "@/lib/db";
import { updateBillingSettings } from "./actions";

const pct = (bps: number) => (bps / 100).toLocaleString("de-DE");

/** Commission, VAT and issuer details of the invoices – editable by the operator only. */
export async function BillingCard({ user }: { user: CurrentUser }) {
  const cfg = await loadBillingConfig(prisma);
  const operator = isOperator(user);
  const complete = issuerComplete(cfg);

  return (
    <Card id="rechnungsdaten">
      <CardTitle
        action={
          complete ? (
            <Badge tone="green">vollständig</Badge>
          ) : (
            <Badge tone="amber">unvollständig</Badge>
          )
        }
      >
        Rechnungsdaten
      </CardTitle>
      <p className="mb-4 text-sm text-ink-soft">
        Absender, Provision und Steuersatz der Provisionsrechnungen (Abrechnung).
        {!operator && " Nur der Betreiber von NEEDL kann sie ändern."}
      </p>
      {operator ? (
        <ActionForm action={updateBillingSettings} className="grid gap-3 space-y-0 sm:grid-cols-2">
          <Field label="Provision (%)" htmlFor="commission">
            <Input
              id="commission"
              name="commission"
              inputMode="decimal"
              defaultValue={pct(cfg.commissionBps)}
            />
          </Field>
          <Field label="Umsatzsteuer (%)" htmlFor="vat" hint="0 = Kleinunternehmer (§ 19 UStG)">
            <Input id="vat" name="vat" inputMode="decimal" defaultValue={pct(cfg.vatBps)} />
          </Field>
          <Field label="Zahlungsziel (Tage)" htmlFor="paymentDays">
            <Input
              id="paymentDays"
              name="paymentDays"
              inputMode="numeric"
              defaultValue={cfg.paymentDays}
            />
          </Field>
          <Field label="Name / Firma" htmlFor="issuerName">
            <Input id="issuerName" name="issuerName" defaultValue={cfg.issuer.name} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Anschrift" htmlFor="issuerAddress">
              <Textarea
                id="issuerAddress"
                name="issuerAddress"
                rows={2}
                defaultValue={cfg.issuer.address}
                placeholder={"Musterweg 1\n10115 Berlin"}
              />
            </Field>
          </div>
          <Field label="Steuernummer oder USt-IdNr." htmlFor="issuerTaxId">
            <Input id="issuerTaxId" name="issuerTaxId" defaultValue={cfg.issuer.taxId} />
          </Field>
          <Field label="IBAN" htmlFor="issuerIban">
            <Input
              id="issuerIban"
              name="issuerIban"
              defaultValue={cfg.issuer.iban}
              autoComplete="off"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="E-Mail für Rechnungen" htmlFor="issuerEmail">
              <Input
                id="issuerEmail"
                name="issuerEmail"
                type="email"
                defaultValue={cfg.issuer.email}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Speichern</Button>
          </div>
        </ActionForm>
      ) : (
        <dl className="space-y-1.5 text-sm">
          {[
            ["Provision", `${pct(cfg.commissionBps)} %`],
            ["Umsatzsteuer", `${pct(cfg.vatBps)} %`],
            ["Absender", cfg.issuer.name || "–"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-ink-soft">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
