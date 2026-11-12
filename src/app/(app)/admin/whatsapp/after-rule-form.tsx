"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, cn, Field, Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { AFTER_CONDITION_LABELS, SESSION_CONDITIONS } from "@/lib/whatsapp/labels";

type Basis = "CONSULTATION" | "SESSION";
type Condition = keyof typeof AFTER_CONDITION_LABELS;

const isSession = (c: string) => (SESSION_CONDITIONS as readonly string[]).includes(c);

/** New message after an appointment: first choose the basis, then the occasion. */
export function AfterRuleForm({
  action,
  templates,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  templates: Array<{ id: string; name: string }>;
}) {
  const [basis, setBasis] = useState<Basis>("CONSULTATION");
  const conditions = (Object.keys(AFTER_CONDITION_LABELS) as Condition[]).filter(
    (c) => isSession(c) === (basis === "SESSION"),
  );
  return (
    <ActionForm action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Bezug">
        {(
          [
            ["CONSULTATION", "Nach dem Beratungstermin"],
            ["SESSION", "Nach dem Tattoo-Termin"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={basis === value}
            onClick={() => setBasis(value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm",
              basis === value
                ? "border-ink bg-ink text-paper"
                : "border-line bg-surface hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid items-end gap-2 space-y-0 sm:grid-cols-[7rem_1fr_1fr_auto]">
        <Field label="Std. danach" htmlFor="hoursAfter">
          <Input id="hoursAfter" name="hoursAfter" type="number" min={0} defaultValue={2} />
        </Field>
        <Field label="Wann" htmlFor="condition">
          {/* key: reset the choice when the basis changes */}
          <Select key={basis} id="condition" name="condition" defaultValue={conditions[0]}>
            {conditions.map((c) => (
              <option key={c} value={c}>
                {AFTER_CONDITION_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Template" htmlFor="after-template">
          <Select id="after-template" name="templateId">
            {templates.length === 0 && (
              <option value="">– erst unter „Texte“ ein Template anlegen –</option>
            )}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">
          Hinzufügen
        </Button>
      </div>
      <p className="text-xs text-ink-soft">
        {basis === "SESSION"
          ? "Gezählt ab dem Ende des Tattoo-Termins (ohne Uhrzeit: ab dem Eintrag „erschienen / nicht erschienen“). Gesendet wird erst, wenn das Erscheinen eingetragen ist."
          : "Gezählt ab dem Ende der Beratung. Gesendet wird erst, wenn das Ergebnis der Beratung eingetragen ist."}
      </p>
    </ActionForm>
  );
}
