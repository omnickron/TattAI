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
import {
  FIXED_RULES,
  knowledgePriceWarnings,
  LINK_FIELDS,
  SECTIONS,
  sectionDone,
  toKnowledge,
} from "@/lib/bot/knowledge";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { saveKnowledgeSection } from "./actions";
import { QAEditor } from "./qa-editor";

export const metadata: Metadata = { title: "Bot" };

const LIST_TEXT = {
  faq: {
    qLabel: "Frage",
    aLabel: "Eure Antwort",
    qPlaceholder: "Tut ein Tattoo am Handgelenk weh?",
    aPlaceholder:
      "Ehrlich gesagt ein bisschen – aber nur kurz. Wir machen Pausen, wann immer du willst.",
  },
  objections: {
    qLabel: "Einwand",
    aLabel: "So antwortet ihr",
    qPlaceholder: "Ich überleg’s mir noch",
    aPlaceholder:
      "Klar, kein Stress! Die Beratung ist unverbindlich – da klären wir alles in Ruhe.",
  },
} as const;

export default async function BotPage() {
  await requireAdmin();
  const row = await prisma.botKnowledge.findUnique({ where: { id: 1 } });
  const k = toKnowledge(row as Record<string, unknown> | null);
  const done = SECTIONS.filter((s) => sectionDone(s, k)).length;
  const priceWarnings = knowledgePriceWarnings(k);

  return (
    <>
      <PageHeader
        title="Bot"
        description="Das Wissen, aus dem der WhatsApp-Bot antwortet. Er sagt nur, was hier steht – was fehlt, erfindet er nicht."
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle
            action={
              <Badge tone={done === SECTIONS.length ? "green" : "amber"}>
                {done} von {SECTIONS.length}
              </Badge>
            }
          >
            Wissen
          </CardTitle>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-ink"
              style={{ width: `${(done / SECTIONS.length) * 100}%` }}
            />
          </div>
          <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <a href={`#${s.key}`} className="flex items-center gap-2 hover:underline">
                  <span className={sectionDone(s, k) ? "text-emerald-600" : "text-ink-soft"}>
                    {sectionDone(s, k) ? "✓" : "○"}
                  </span>
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
          {row?.updatedAt && (
            <p className="mt-3 text-xs text-ink-soft">
              Zuletzt geändert {formatDateTime(row.updatedAt)}
            </p>
          )}
          {priceWarnings.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-medium">
                Preisangaben gefunden – bitte entfernen, der Bot nennt nie Preise:
              </p>
              <ul className="mt-1 list-inside list-disc">
                {priceWarnings.slice(0, 5).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card>
          <CardTitle>Gilt immer</CardTitle>
          <ul className="space-y-2 text-sm text-ink-soft">
            {FIXED_RULES.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <Card key={s.key} id={s.key} className="scroll-mt-6">
            <CardTitle
              action={
                sectionDone(s, k) ? (
                  <Badge tone="green">fertig</Badge>
                ) : (
                  <Badge tone="gray">offen</Badge>
                )
              }
            >
              {s.title}
            </CardTitle>
            <p className="-mt-1 mb-4 text-sm text-ink-soft">{s.intro}</p>
            <ActionForm action={saveKnowledgeSection.bind(null, s.key)}>
              {s.fields?.map((f) => (
                <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`} hint={f.hint}>
                  {f.rows === 1 ? (
                    <Input
                      id={`f-${f.name}`}
                      name={f.name}
                      defaultValue={k[f.name] ?? ""}
                      placeholder={f.placeholder}
                      maxLength={f.max}
                    />
                  ) : (
                    <Textarea
                      id={`f-${f.name}`}
                      name={f.name}
                      defaultValue={k[f.name] ?? ""}
                      placeholder={f.placeholder}
                      rows={f.rows ?? 4}
                      maxLength={f.max}
                    />
                  )}
                </Field>
              ))}
              {s.links &&
                LINK_FIELDS.map((l) => (
                  <Field key={l.key} label={l.label} htmlFor={`l-${l.key}`}>
                    <Input
                      id={`l-${l.key}`}
                      name={l.key}
                      inputMode="url"
                      autoComplete="url"
                      defaultValue={k.links[l.key] ?? ""}
                      placeholder={l.placeholder}
                    />
                  </Field>
                ))}
              {s.list && <QAEditor initial={k[s.list]} {...LIST_TEXT[s.list]} />}
              <Button type="submit">Speichern</Button>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
