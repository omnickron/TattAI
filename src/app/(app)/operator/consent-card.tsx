import { ActionForm } from "@/components/action-form";
import { Button, Card, CardTitle, Field, Input, Textarea } from "@/components/ui";
import { prisma } from "@/lib/db";
import { updateConsentSettings } from "../admin/settings/actions";

/** Operator: key and wording of the WhatsApp consent checkbox in the Meta lead form. */
export async function ConsentCard() {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  return (
    <Card className="mb-4">
      <CardTitle>WhatsApp-Einwilligung (Meta-Formular)</CardTitle>
      <p className="mb-4 text-sm text-ink-soft">
        Das Häkchen im Instant-Formular wird über seinen Schlüssel erkannt. Der Wortlaut wird bei
        jedem neuen Lead zusammen mit dem Zeitpunkt gespeichert und muss exakt dem Text im Formular
        entsprechen. Das Studio sieht den Wortlaut in seinen Einstellungen, ändern kannst nur du.
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
  );
}
