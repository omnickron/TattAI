"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { Button, Input, Textarea, cn } from "./ui";

type Outcome = "HELD" | "NO_SHOW" | "CANCELLED";
type Tattoo = "YES" | "NO" | "OPEN";
type Plan = "SINGLE" | "MULTIPLE";

export interface OutcomeDefaults {
  outcome?: Outcome | null;
  tattoo?: Tattoo | null;
  sessionPlan?: Plan | null;
  furtherScheduled?: boolean | null;
  sessions?: Array<{ date: string; amount: string; start?: string; end?: string }>;
  note?: string | null;
}

function Choice<T extends string>({
  name,
  value,
  current,
  onChange,
  children,
}: {
  name: string;
  value: T;
  current: T | null | undefined;
  onChange: (v: T) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        current === value
          ? "border-ink bg-ink text-paper"
          : "border-line bg-surface hover:bg-muted",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      {children}
    </label>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/** Outcome of a consultation with the follow-up questions shown step by step. */
export function OutcomeForm({
  action,
  defaults = {},
  returnTo,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: OutcomeDefaults;
  /** Page to return to with a confirmation after saving */
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [outcome, setOutcome] = useState<Outcome | null>(defaults.outcome ?? null);
  const [tattoo, setTattoo] = useState<Tattoo | null>(defaults.tattoo ?? null);
  const [plan, setPlan] = useState<Plan | null>(defaults.sessionPlan ?? null);
  const [further, setFurther] = useState<"yes" | "no" | null>(
    defaults.furtherScheduled === true ? "yes" : defaults.furtherScheduled === false ? "no" : null,
  );
  const [sessions, setSessions] = useState(
    defaults.sessions?.length ? defaults.sessions : [{ date: "", amount: "", start: "", end: "" }],
  );

  const showSessions =
    outcome === "HELD" &&
    tattoo === "YES" &&
    (plan === "SINGLE" || (plan === "MULTIPLE" && further));
  const multipleRows = plan === "MULTIPLE" && further === "yes";
  const rows = multipleRows
    ? sessions.length < 2
      ? [...sessions, { date: "", amount: "", start: "", end: "" }]
      : sessions
    : sessions.slice(0, 1);

  const update = (i: number, key: "date" | "amount" | "start" | "end", value: string) =>
    setSessions(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  return (
    <form action={formAction} className="space-y-4">
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <Question title="Wie lief die Beratung?">
        <Choice name="outcome" value="HELD" current={outcome} onChange={setOutcome}>
          Hat stattgefunden
        </Choice>
        <Choice name="outcome" value="NO_SHOW" current={outcome} onChange={setOutcome}>
          No-Show
        </Choice>
        <Choice name="outcome" value="CANCELLED" current={outcome} onChange={setOutcome}>
          Abgesagt
        </Choice>
      </Question>

      {outcome === "HELD" && (
        <Question title="Wurde ein Tattoo-Termin vereinbart?">
          <Choice name="tattoo" value="YES" current={tattoo} onChange={setTattoo}>
            Ja
          </Choice>
          <Choice name="tattoo" value="NO" current={tattoo} onChange={setTattoo}>
            Nein
          </Choice>
          <Choice name="tattoo" value="OPEN" current={tattoo} onChange={setTattoo}>
            Noch offen (Kunde überlegt)
          </Choice>
        </Question>
      )}

      {outcome === "HELD" && tattoo === "YES" && (
        <Question title="Wie viele Termine braucht das Tattoo?">
          <Choice name="sessionPlan" value="SINGLE" current={plan} onChange={setPlan}>
            Ein Termin
          </Choice>
          <Choice name="sessionPlan" value="MULTIPLE" current={plan} onChange={setPlan}>
            Mehrere Termine
          </Choice>
        </Question>
      )}

      {outcome === "HELD" && tattoo === "YES" && plan === "MULTIPLE" && (
        <Question title="Welche Termine sind schon vergeben?">
          <Choice name="furtherScheduled" value="no" current={further} onChange={setFurther}>
            Nur der erste Termin
          </Choice>
          <Choice name="furtherScheduled" value="yes" current={further} onChange={setFurther}>
            Auch weitere Termine
          </Choice>
        </Question>
      )}

      {showSessions && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {multipleRows
              ? "Vergebene Termine"
              : plan === "MULTIPLE"
                ? "Erster Termin"
                : "Tattoo-Termin"}
          </p>
          <div
            className="hidden grid-cols-[1.5rem_1fr_auto] gap-2 text-xs text-ink-soft sm:grid"
            aria-hidden
          >
            <span />
            <div className="grid grid-cols-[1fr_8.5rem_8.5rem_1fr] gap-2">
              <span>Datum</span>
              <span>von (optional)</span>
              <span>bis (optional)</span>
              <span>Betrag</span>
            </div>
            <span className="w-9" />
          </div>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[1.5rem_1fr_auto] items-start gap-2">
              <span className="pt-2 text-sm text-ink-soft">{i + 1}.</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_8.5rem_8.5rem_1fr]">
                <Input
                  type="date"
                  name={`session_date_${i}`}
                  value={row.date}
                  onChange={(e) => update(i, "date", e.target.value)}
                  aria-label={`Datum Termin ${i + 1}`}
                  required
                  className="col-span-2 sm:col-span-1"
                />
                <Input
                  type="time"
                  step={900}
                  name={`session_start_${i}`}
                  value={row.start ?? ""}
                  onChange={(e) => update(i, "start", e.target.value)}
                  aria-label={`Beginn Termin ${i + 1}`}
                  title="Beginn (optional)"
                />
                <Input
                  type="time"
                  step={900}
                  name={`session_end_${i}`}
                  value={row.end ?? ""}
                  onChange={(e) => update(i, "end", e.target.value)}
                  aria-label={`Ende Termin ${i + 1}`}
                  title="Ende (optional)"
                />
                <Input
                  name={`session_amount_${i}`}
                  value={row.amount}
                  onChange={(e) => update(i, "amount", e.target.value)}
                  placeholder="Betrag in € (optional)"
                  inputMode="decimal"
                  aria-label={`Betrag Termin ${i + 1}`}
                  className="col-span-2 sm:col-span-1"
                />
              </div>
              {multipleRows && rows.length > 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="px-2"
                  onClick={() => setSessions(rows.filter((_, j) => j !== i))}
                  aria-label={`Termin ${i + 1} entfernen`}
                >
                  ✕
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
          {multipleRows && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSessions([...rows, { date: "", amount: "", start: "", end: "" }])}
            >
              + Weiterer Termin
            </Button>
          )}
          <p className="text-xs text-ink-soft">
            Uhrzeit (von–bis) und Betrag sind optional und können später ergänzt werden. Mit Uhrzeit
            erscheint der Termin im Kalender und blockiert Beratungen.
            {plan === "MULTIPLE" &&
              further === "no" &&
              " Weitere Termine lassen sich später ergänzen."}
          </p>
        </div>
      )}

      {outcome && (
        <Textarea
          name="note"
          defaultValue={defaults.note ?? ""}
          rows={2}
          placeholder="Notiz (optional)"
          maxLength={2000}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!outcome || pending}>
          {pending ? "Speichert …" : "Ergebnis speichern"}
        </Button>
        {state && (
          <p
            role="status"
            className={cn(
              "text-sm",
              state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600",
            )}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
