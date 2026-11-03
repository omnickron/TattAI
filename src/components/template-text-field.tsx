"use client";

import { useRef, useState } from "react";
import { Select, Textarea } from "./ui";

export type VariableInfo = { name: string; description: string };

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

function preview(text: string, examples: Record<string, string>) {
  return text.replace(PLACEHOLDER, (m, name: string) => examples[name] ?? m);
}

/**
 * Template text editor: variables as buttons (inserted at the cursor) and a
 * live preview with sample values.
 */
export function TemplateTextField({
  id,
  name = "bodyText",
  defaultValue = "",
  variables,
  examples,
  disabled,
  placeholder,
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  variables: VariableInfo[];
  examples: Record<string, string>;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(defaultValue);
  const ref = useRef<HTMLTextAreaElement>(null);
  const allowed = new Set(variables.map((v) => v.name));
  const unknown = [...text.matchAll(PLACEHOLDER)]
    .map((m) => m[1].trim())
    .filter((n) => !allowed.has(n));

  function insert(variable: string) {
    const el = ref.current;
    const token = `{{${variable}}}`;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        Text
      </label>
      <Textarea
        ref={ref}
        id={id}
        name={name}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={1024}
        required
        disabled={disabled}
        placeholder={placeholder}
      />
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Variablen einfügen">
        <span className="text-xs text-ink-soft">Einfügen:</span>
        {variables.map((v) => (
          <button
            key={v.name}
            type="button"
            disabled={disabled}
            onClick={() => insert(v.name)}
            title={v.description}
            className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-xs hover:bg-muted disabled:opacity-50"
          >
            {`{{${v.name}}}`}
          </button>
        ))}
      </div>
      {unknown.length > 0 && (
        <p className="text-xs text-red-600">
          Hier nicht verfügbar: {unknown.map((u) => `{{${u}}}`).join(", ")}
        </p>
      )}
      {text.trim() && (
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p className="mb-1 text-xs text-ink-soft">Vorschau mit Beispieldaten</p>
          <p className="whitespace-pre-wrap">{preview(text, examples)}</p>
        </div>
      )}
      <p className="text-xs text-ink-soft">
        {text.length}/1024 Zeichen · Der Text darf nicht mit einer Variablen beginnen oder enden.
      </p>
    </div>
  );
}

/** Purpose select + editor for new templates (available variables follow the purpose). */
export function NewTemplateFields({
  purposes,
  variablesByPurpose,
  examples,
}: {
  purposes: Array<{ value: string; label: string }>;
  variablesByPurpose: Record<string, VariableInfo[]>;
  examples: Record<string, string>;
}) {
  const [purpose, setPurpose] = useState(purposes[0]?.value ?? "");
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="purpose" className="block text-sm font-medium">
          Verwendung
        </label>
        <Select
          id="purpose"
          name="purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        >
          {purposes.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <TemplateTextField
        key={purpose}
        id="bodyText"
        variables={variablesByPurpose[purpose] ?? []}
        examples={examples}
        placeholder="Hallo {{Vorname}}, …"
      />
    </>
  );
}
