/**
 * Template texts: the admin writes named placeholders like {{Vorname}};
 * Meta requires positional ones ({{1}}, {{2}}, …) plus example values.
 */

export const TEMPLATE_VARIABLES = {
  Vorname: { description: "Vorname des Kunden", example: "Lena" },
  Name: { description: "Vollständiger Name", example: "Lena Müller" },
  Datum: { description: "Datum der Beratung", example: "Mittwoch, 4. November" },
  Uhrzeit: { description: "Uhrzeit der Beratung", example: "14:30" },
  Ort: { description: "Studioadresse bzw. „telefonisch“", example: "Musterstraße 1, Musterstadt" },
  Tätowierer: { description: "Vorname der Person, die berät", example: "Alex" },
  Studio: { description: "Name des Studios", example: "Studio" },
  TattooDatum: {
    description: "Datum des nächsten Tattoo-Termins",
    example: "Donnerstag, 26. November",
  },
  TattooUhrzeit: { description: "Uhrzeit des nächsten Tattoo-Termins", example: "14:00" },
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;

const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;
const MAX_BODY_LENGTH = 1024;

export interface CompiledTemplate {
  /** Text with positional placeholders for Meta */
  metaText: string;
  /** Variable per position (index 0 = {{1}}) */
  variables: TemplateVariable[];
}

export type CompileResult = { ok: true; value: CompiledTemplate } | { ok: false; error: string };

export function compileTemplate(text: string, allowed: readonly TemplateVariable[]): CompileResult {
  const body = text.trim();
  if (!body) return { ok: false, error: "Der Text ist leer." };
  if (body.length > MAX_BODY_LENGTH)
    return { ok: false, error: `Maximal ${MAX_BODY_LENGTH} Zeichen.` };
  if (/^\{\{/.test(body) || /\}\}$/.test(body)) {
    return {
      ok: false,
      error: "Der Text darf nicht mit einem Platzhalter beginnen oder enden (Meta-Regel).",
    };
  }
  if (/\n{3,}/.test(body)) return { ok: false, error: "Höchstens eine Leerzeile hintereinander." };

  const variables: TemplateVariable[] = [];
  let error: string | null = null;
  const metaText = body.replace(PLACEHOLDER, (_m, rawName: string) => {
    const name = rawName as TemplateVariable;
    if (!(name in TEMPLATE_VARIABLES)) {
      error = `Unbekannter Platzhalter {{${rawName}}}.`;
      return "";
    }
    if (!allowed.includes(name)) {
      error = `{{${rawName}}} ist in diesem Text nicht verfügbar.`;
      return "";
    }
    let index = variables.indexOf(name);
    if (index === -1) index = variables.push(name) - 1;
    return `{{${index + 1}}}`;
  });
  if (error) return { ok: false, error };
  if (/\{\{|\}\}/.test(metaText.replace(/\{\{\d+\}\}/g, ""))) {
    return { ok: false, error: "Ungültige geschweifte Klammern im Text." };
  }
  return { ok: true, value: { metaText, variables } };
}

/** Replaces named placeholders with values (for previews and the chat history). */
export function renderTemplate(
  text: string,
  values: Partial<Record<TemplateVariable, string>>,
): string {
  return text.replace(PLACEHOLDER, (m, name: string) => values[name as TemplateVariable] ?? m);
}

export function exampleValues(): Record<TemplateVariable, string> {
  return Object.fromEntries(
    Object.entries(TEMPLATE_VARIABLES).map(([k, v]) => [k, v.example]),
  ) as Record<TemplateVariable, string>;
}

/** Variables available per purpose (appointment data only exists for reminders). */
export const ALLOWED_VARIABLES: Record<
  "FIRST_CONTACT" | "FOLLOW_UP" | "REMINDER" | "AFTER_CONSULTATION",
  TemplateVariable[]
> = {
  FIRST_CONTACT: ["Vorname", "Name", "Studio"],
  FOLLOW_UP: ["Vorname", "Name", "Studio"],
  REMINDER: ["Vorname", "Name", "Studio", "Datum", "Uhrzeit", "Ort", "Tätowierer"],
  AFTER_CONSULTATION: [
    "Vorname",
    "Name",
    "Studio",
    "Datum",
    "Uhrzeit",
    "Ort",
    "Tätowierer",
    "TattooDatum",
    "TattooUhrzeit",
  ],
};

export function isValidTemplateName(name: string): boolean {
  return /^[a-z0-9_]{1,512}$/.test(name);
}
