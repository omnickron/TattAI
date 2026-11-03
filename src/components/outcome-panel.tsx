import { ActionForm } from "@/components/action-form";
import { OutcomeForm } from "@/components/outcome-form";
import { Badge, Button, Input } from "@/components/ui";
import {
  addSessionAction,
  recordOutcomeAction,
  setSessionCancelledAction,
  updateSessionAction,
} from "@/app/(app)/consultations/actions";
import { APP_TIMEZONE, formatDate } from "@/lib/format";
import { centsToInput, formatEuro } from "@/lib/outcomes/money";
import { formatTimeOfDay, localDateOf, localMinuteOf } from "@/lib/time";

export type OutcomeConsultation = {
  id: string;
  startsAt: Date;
  status: "SCHEDULED" | "HELD" | "NO_SHOW" | "CANCELLED";
  tattooBooked: boolean | null;
  sessionPlan: "SINGLE" | "MULTIPLE" | null;
  furtherSessionsScheduled: boolean | null;
  outcomeNote: string | null;
  outcomeRecordedAt: Date | null;
  tattooBookings: Array<{
    id: string;
    sessionNumber: number;
    date: Date;
    amountCents: number | null;
    cancelled: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  }>;
};

const localDate = (d: Date) => localDateOf(d, APP_TIMEZONE);
const localTime = (d: Date | null) => (d ? formatTimeOfDay(localMinuteOf(d, APP_TIMEZONE)) : "");

function TimeInputs({ start, end }: { start?: Date | null; end?: Date | null }) {
  return (
    <>
      <Input
        type="time"
        step={900}
        name="start"
        defaultValue={localTime(start ?? null)}
        className="w-32"
        aria-label="Beginn"
        title="Beginn (optional)"
      />
      <Input
        type="time"
        step={900}
        name="end"
        defaultValue={localTime(end ?? null)}
        className="w-32"
        aria-label="Ende"
        title="Ende (optional)"
      />
    </>
  );
}

export function outcomeSummary(c: OutcomeConsultation): string {
  if (c.status === "NO_SHOW") return "No-Show";
  if (c.status === "CANCELLED") return "Abgesagt";
  if (c.status !== "HELD") return "";
  if (c.tattooBooked === false) return "Stattgefunden · kein Tattoo";
  if (c.tattooBooked === null) return "Stattgefunden · Kunde überlegt noch";
  if (c.sessionPlan === "SINGLE") return "Stattgefunden · Tattoo gebucht (ein Termin)";
  return c.furtherSessionsScheduled
    ? "Stattgefunden · Tattoo gebucht (mehrere Termine, weitere vergeben)"
    : "Stattgefunden · Tattoo gebucht (mehrere Termine, erst der erste vergeben)";
}

/** Outcome entry/correction and tattoo sessions of one consultation. */
export function OutcomePanel({
  c,
  now,
  returnTo,
}: {
  c: OutcomeConsultation;
  now: Date;
  returnTo: string;
}) {
  const started = c.startsAt <= now;
  const needsOutcome = c.status === "SCHEDULED" && started;
  // Cancellations before the appointment (button "Absagen") have no outcome to show here.
  const hasOutcome =
    c.status === "HELD" ||
    c.status === "NO_SHOW" ||
    (c.status === "CANCELLED" && Boolean(c.outcomeRecordedAt));
  const sessions = [...c.tattooBookings].sort((a, b) => a.sessionNumber - b.sessionNumber);
  const total = sessions
    .filter((s) => !s.cancelled)
    .reduce((sum, s) => sum + (s.amountCents ?? 0), 0);
  const missingAmounts = sessions.some((s) => !s.cancelled && s.amountCents === null);
  const defaults = {
    outcome: c.status === "SCHEDULED" ? null : c.status,
    tattoo:
      c.status === "HELD"
        ? c.tattooBooked === true
          ? "YES"
          : c.tattooBooked === false
            ? "NO"
            : "OPEN"
        : null,
    sessionPlan: c.sessionPlan,
    furtherScheduled: c.furtherSessionsScheduled,
    sessions: sessions
      .filter((s) => !s.cancelled)
      .map((s) => ({
        date: localDate(s.date),
        amount: centsToInput(s.amountCents),
        start: localTime(s.startsAt),
        end: localTime(s.endsAt),
      })),
    note: c.outcomeNote,
  } as const;

  if (!needsOutcome && !hasOutcome) return null;

  return (
    <div className="space-y-3 rounded-lg bg-muted/50 p-3">
      {needsOutcome ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Badge tone="amber">Ergebnis fehlt</Badge> Bitte nach der Beratung eintragen.
          </p>
          <OutcomeForm action={recordOutcomeAction.bind(null, c.id)} returnTo={returnTo} />
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{outcomeSummary(c)}</p>
          {c.outcomeNote && (
            <p className="whitespace-pre-wrap text-sm text-ink-soft">{c.outcomeNote}</p>
          )}

          {c.status === "HELD" && c.tattooBooked && (
            <div className="space-y-2">
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
                {sessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="w-20 font-medium">Termin {s.sessionNumber}</span>
                    {s.cancelled ? (
                      <>
                        <span className="text-ink-soft line-through">
                          {formatDate(s.date)}
                          {s.startsAt && ` ${localTime(s.startsAt)}–${localTime(s.endsAt)}`} ·{" "}
                          {formatEuro(s.amountCents)}
                        </span>
                        <Badge>abgesagt</Badge>
                        <ActionForm
                          action={setSessionCancelledAction.bind(null, s.id, false)}
                          className="ml-auto"
                        >
                          <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                            Wiederherstellen
                          </Button>
                        </ActionForm>
                      </>
                    ) : (
                      <>
                        <ActionForm
                          action={updateSessionAction.bind(null, s.id)}
                          className="flex flex-1 flex-wrap items-center gap-2 space-y-0"
                        >
                          <Input
                            type="date"
                            name="date"
                            defaultValue={localDate(s.date)}
                            className="w-40"
                            required
                            aria-label="Datum"
                          />
                          <TimeInputs start={s.startsAt} end={s.endsAt} />
                          <Input
                            name="amount"
                            defaultValue={centsToInput(s.amountCents)}
                            placeholder="Betrag €"
                            inputMode="decimal"
                            className="w-32"
                            aria-label="Betrag"
                          />
                          <Button type="submit" variant="secondary" className="px-2 py-1 text-xs">
                            Speichern
                          </Button>
                        </ActionForm>
                        <ActionForm
                          action={setSessionCancelledAction.bind(null, s.id, true)}
                          confirm={`Termin ${s.sessionNumber} als abgesagt markieren?`}
                        >
                          <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                            Absagen
                          </Button>
                        </ActionForm>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-sm">
                Umsatz: <span className="font-semibold tabular-nums">{formatEuro(total)}</span>
                {missingAmounts && (
                  <span className="text-amber-700 dark:text-amber-400">
                    {" "}
                    · Betrag fehlt noch bei einem Termin
                  </span>
                )}
              </p>
              <details>
                <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
                  + Weiteren Tattoo-Termin eintragen
                </summary>
                <ActionForm
                  action={addSessionAction.bind(null, c.id)}
                  className="mt-2 flex flex-wrap items-center gap-2 space-y-0"
                >
                  <Input type="date" name="date" className="w-40" required aria-label="Datum" />
                  <TimeInputs />
                  <Input
                    name="amount"
                    placeholder="Betrag € (optional)"
                    inputMode="decimal"
                    className="w-40"
                    aria-label="Betrag"
                  />
                  <Button type="submit" variant="secondary">
                    Hinzufügen
                  </Button>
                </ActionForm>
              </details>
            </div>
          )}

          <details>
            <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
              Ergebnis ändern
            </summary>
            <div className="mt-3">
              <OutcomeForm
                action={recordOutcomeAction.bind(null, c.id)}
                defaults={defaults}
                returnTo={returnTo}
              />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
