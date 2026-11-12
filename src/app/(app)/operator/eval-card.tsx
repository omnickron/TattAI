import { Badge, Card, CardTitle } from "@/components/ui";
import { formatEuro, microsToCents } from "@/lib/bot/costs";
import type { PersonaResult } from "@/lib/bot/eval/run";
import { PERSONAS } from "@/lib/bot/eval/personas";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { ActionButton } from "../admin/billing/buttons";
import { startBotEval } from "./actions";
import { AutoRefresh } from "./auto-refresh";

const gradeTone = (g: number | null) =>
  g === null ? "gray" : g <= 2 ? "green" : g <= 3 ? "amber" : "red";
const fmtGrade = (x100: number | null) =>
  x100 === null ? "–" : (x100 / 100).toLocaleString("de-DE", { maximumFractionDigits: 1 });

const STATUS = {
  PENDING: { tone: "blue", label: "wartet" },
  RUNNING: { tone: "blue", label: "läuft" },
  DONE: { tone: "green", label: "fertig" },
  FAILED: { tone: "red", label: "abgebrochen" },
} as const;

/** Bot test with AI test customers: start, progress and graded results. */
export async function EvalCard() {
  const runs = await prisma.botEvalRun.findMany({ orderBy: { createdAt: "desc" }, take: 6 });
  const latest = runs[0];
  const results = (latest?.results ?? []) as unknown as PersonaResult[];
  const active = latest && (latest.status === "PENDING" || latest.status === "RUNNING");
  const st = latest ? STATUS[latest.status as keyof typeof STATUS] : null;

  return (
    <Card className="mb-4">
      {active && <AutoRefresh />}
      <CardTitle
        action={
          active ? (
            <Badge tone="blue">
              {latest.status === "PENDING"
                ? "wartet auf den Start"
                : `läuft · ${results.length} von ${PERSONAS.length}`}
            </Badge>
          ) : (
            <ActionButton
              variant="primary"
              action={startBotEval}
              confirm={`Test mit ${PERSONAS.length} KI-Testkunden starten? Dauer etwa 5–10 Minuten, Kosten grob 2–4 €.`}
            >
              Test starten
            </ActionButton>
          )
        }
      >
        Bot-Test
      </CardTitle>
      <p className="mb-4 text-sm text-ink-soft">
        {PERSONAS.length} KI-Testkunden schreiben mit dem echten Bot (WhatsApp und Kalender nur
        simuliert, Testdaten werden danach gelöscht). Eine zweite KI vergibt pro Chat eine Note von
        1 bis 6; NEEDL prüft zusätzlich Preise, Alters- und Gesundheitsfragen und den KI-Hinweis.
        Jeder Chat beginnt wie im echten Ablauf mit euren Erstnachrichten (Erstkontakt und weitere
        Erstnachrichten aus den WhatsApp-Einstellungen, mit dem Vornamen des Testkunden).
      </p>

      {latest && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {st && <Badge tone={st.tone}>{st.label}</Badge>}
          <span className="text-ink-soft">
            {formatDateTime(latest.createdAt)}
            {latest.requestedBy ? ` · ${latest.requestedBy}` : ""}
            {latest.model ? ` · ${latest.model}` : ""}
          </span>
          {latest.status === "DONE" && (
            <span>
              Durchschnitt <span className="font-semibold">{fmtGrade(latest.avgGrade)}</span>
            </span>
          )}
          {latest.costMicros > 0 && (
            <span className="text-ink-soft">
              Kosten {formatEuro(microsToCents(latest.costMicros))}
            </span>
          )}
          {latest.error && <span className="text-red-700">{latest.error}</span>}
        </div>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {results.map((r) => (
            <li key={r.key}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 hover:bg-muted/60">
                  <Badge tone={gradeTone(r.grade)}>{r.grade ?? "–"}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.label}</span>
                    <span className="block truncate text-xs text-ink-soft">
                      {r.error
                        ? `Fehler: ${r.error}`
                        : [
                            r.booked ? "Termin gebucht" : null,
                            r.handedOver ? "übergeben" : null,
                            r.rulesKept === false ? "Regel verletzt" : null,
                            r.problems[0] ?? null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "ohne Auffälligkeiten"}
                    </span>
                  </span>
                  <span aria-hidden className="text-ink-soft transition group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <div className="space-y-3 px-3 pb-4 text-sm">
                  {r.hardFindings.length > 0 && (
                    <p className="rounded-lg bg-red-50 p-2 text-red-800 dark:bg-red-950 dark:text-red-200">
                      Automatische Prüfung: {r.hardFindings.join(" ")}
                    </p>
                  )}
                  {r.problems.length > 0 && (
                    <div>
                      <p className="font-medium">Probleme</p>
                      <ul className="list-inside list-disc text-ink-soft">
                        {r.problems.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.suggestion && (
                    <p>
                      <span className="font-medium">Vorschlag: </span>
                      <span className="text-ink-soft">{r.suggestion}</span>
                    </p>
                  )}
                  <div className="space-y-1.5 rounded-lg bg-muted/50 p-3">
                    {r.transcript.map((l, i) => (
                      <p
                        key={i}
                        className={
                          l.from === "kunde"
                            ? "mr-8 rounded-lg bg-surface px-2.5 py-1.5"
                            : "ml-8 rounded-lg bg-emerald-50 px-2.5 py-1.5 dark:bg-emerald-950/40"
                        }
                      >
                        <span className="block text-[11px] text-ink-soft">
                          {l.from === "kunde"
                            ? "Testkunde"
                            : l.from === "bot"
                              ? "Bot"
                              : "Erstansprache"}
                        </span>
                        {l.text}
                      </p>
                    ))}
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {runs.length > 1 && (
        <div className="mt-4 text-xs text-ink-soft">
          <p className="mb-1 font-medium text-ink">Frühere Tests</p>
          <ul className="space-y-0.5">
            {runs.slice(1).map((r) => (
              <li key={r.id}>
                {formatDateTime(r.createdAt)} · {STATUS[r.status as keyof typeof STATUS]?.label}
                {r.avgGrade !== null ? ` · Durchschnitt ${fmtGrade(r.avgGrade)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
