import { ActionForm } from "@/components/action-form";
import { Badge, Button, cn, Input, PencilIcon, TimeSelect } from "@/components/ui";
import {
  addSessionAction,
  retrySessionSyncAction,
  setSessionCancelledAction,
  updateSessionAction,
} from "@/app/(app)/consultations/actions";
import { SyncRetry } from "@/components/sync-retry";
import { describeCalendarError } from "@/lib/scheduling/session-calendar";
import { APP_TIMEZONE } from "@/lib/format";
import { centsToInput, formatEuro } from "@/lib/outcomes/money";
import { formatTimeOfDay, localDateOf, localMinuteOf } from "@/lib/time";

export type TattooSession = {
  id: string;
  sessionNumber: number;
  date: Date;
  amountCents: number | null;
  cancelled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  calendarEventId: string | null;
  calendarSyncPending: boolean;
  calendarSyncError: string | null;
};

const localDate = (d: Date) => localDateOf(d, APP_TIMEZONE);
const localTime = (d: Date | null) => (d ? formatTimeOfDay(localMinuteOf(d, APP_TIMEZONE)) : "");
const dayLabel = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Wraps instead of fixed columns: hour/minute pickers need more room than a single field
const FORM_GRID = "flex flex-wrap items-center gap-x-3 gap-y-2 space-y-0";

function TimeInputs({ start, end }: { start?: Date | null; end?: Date | null }) {
  return (
    <>
      <span className="flex items-center gap-2 text-sm">
        <span className="text-ink-soft">von</span>
        <TimeSelect
          name="start"
          defaultValue={localTime(start ?? null)}
          aria-label="Beginn"
          emptyLabel="–"
        />
      </span>
      <span className="flex items-center gap-2 text-sm">
        <span className="text-ink-soft">bis</span>
        <TimeSelect
          name="end"
          defaultValue={localTime(end ?? null)}
          aria-label="Ende"
          emptyLabel="–"
          endOfDay
        />
      </span>
    </>
  );
}

function sessionState(s: TattooSession, now: Date) {
  if (s.cancelled) return { label: "abgesagt", tone: "gray" as const };
  const end = s.endsAt ?? new Date(s.date.getTime() + 24 * 3600_000);
  return end <= now
    ? { label: "stattgefunden", tone: "green" as const }
    : { label: "anstehend", tone: "blue" as const };
}

/**
 * Tattoo sessions of one consultation: read-only rows; the edit form opens
 * only after clicking "Bearbeiten".
 */
export function TattooSessions({
  consultationId,
  sessions: unsorted,
  now,
  canEdit,
  calendarName,
}: {
  consultationId: string;
  sessions: TattooSession[];
  now: Date;
  canEdit: boolean;
  /** "Google" or "TeamUp" (calendar of the responsible tattooer). */
  calendarName?: string;
}) {
  const sessions = [...unsorted].sort((a, b) => a.sessionNumber - b.sessionNumber);
  const active = sessions.filter((s) => !s.cancelled);
  const total = active.reduce((sum, s) => sum + (s.amountCents ?? 0), 0);
  const missingAmounts = active.filter((s) => s.amountCents === null).length;

  return (
    <div className="space-y-2">
      {sessions.length === 0 ? (
        <p className="text-sm text-ink-soft">Noch kein Tattoo-Termin eingetragen.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface text-sm">
          {sessions.map((s) => {
            const state = sessionState(s, now);
            return (
              <li key={s.id} className="px-3 py-2">
                <details className="group">
                  <summary className="flex cursor-default list-none flex-wrap items-center gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
                    {canEdit && (
                      <span
                        role="button"
                        aria-label={`Tattoo-Termin vom ${dayLabel.format(s.date)} bearbeiten`}
                        title="Bearbeiten"
                        className="-ml-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-ink-soft hover:bg-muted hover:text-ink group-open:bg-muted group-open:text-ink"
                      >
                        <PencilIcon />
                      </span>
                    )}
                    <span className="font-semibold">Tattoo-Termin</span>
                    <span
                      className={cn("tabular-nums", s.cancelled && "text-ink-soft line-through")}
                    >
                      {dayLabel.format(s.date)}
                      {s.startsAt
                        ? ` · ${localTime(s.startsAt)}–${localTime(s.endsAt)} Uhr`
                        : " · Uhrzeit offen"}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums",
                        s.amountCents === null && "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {s.amountCents === null ? "Betrag fehlt" : formatEuro(s.amountCents)}
                    </span>

                    <span className="ml-auto">
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </span>
                  </summary>
                  {canEdit && (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      {s.cancelled ? (
                        <ActionForm action={setSessionCancelledAction.bind(null, s.id, false)}>
                          <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
                            Termin wiederherstellen
                          </Button>
                        </ActionForm>
                      ) : (
                        <>
                          <ActionForm
                            action={updateSessionAction.bind(null, s.id)}
                            className={FORM_GRID}
                          >
                            <Input
                              type="date"
                              name="date"
                              defaultValue={localDate(s.date)}
                              className="col-span-2 sm:col-span-1"
                              required
                              aria-label="Datum"
                            />
                            <TimeInputs start={s.startsAt} end={s.endsAt} />
                            <Input
                              name="amount"
                              defaultValue={centsToInput(s.amountCents)}
                              placeholder="Betrag €"
                              inputMode="decimal"
                              aria-label="Betrag"
                            />
                            <Button
                              type="submit"
                              className="col-span-2 justify-self-start px-3 py-1.5 text-xs sm:col-span-1"
                            >
                              Speichern
                            </Button>
                          </ActionForm>
                          <ActionForm
                            action={setSessionCancelledAction.bind(null, s.id, true)}
                            confirm={`Termin ${s.sessionNumber} als abgesagt markieren?`}
                          >
                            <Button
                              type="submit"
                              variant="ghost"
                              className="px-2 py-1 text-xs text-red-600"
                            >
                              Termin absagen
                            </Button>
                          </ActionForm>
                        </>
                      )}
                    </div>
                  )}
                </details>
                {!s.cancelled && (s.calendarSyncPending || s.calendarSyncError) && (
                  <SyncRetry
                    action={retrySessionSyncAction.bind(null, s.id)}
                    reason={s.calendarSyncError ? describeCalendarError(s.calendarSyncError) : null}
                    canRetry={canEdit}
                    target={
                      calendarName ??
                      (s.calendarSyncError?.toLowerCase().includes("teamup") ? "TeamUp" : "Google")
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-sm">
        Umsatz: <span className="font-semibold tabular-nums">{formatEuro(total)}</span>
        {missingAmounts > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            {" "}
            · Betrag fehlt noch bei{" "}
            {missingAmounts === 1 ? "einem Termin" : `${missingAmounts} Terminen`}
          </span>
        )}
      </p>
      {canEdit && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
            + Weiteren Tattoo-Termin eintragen
          </summary>
          <ActionForm
            action={addSessionAction.bind(null, consultationId)}
            className={cn("mt-2", FORM_GRID)}
          >
            <Input
              type="date"
              name="date"
              required
              aria-label="Datum"
              className="col-span-2 sm:col-span-1"
            />
            <TimeInputs />
            <Input
              name="amount"
              placeholder="Betrag € (optional)"
              inputMode="decimal"
              aria-label="Betrag"
            />
            <Button
              type="submit"
              variant="secondary"
              className="col-span-2 justify-self-start sm:col-span-1"
            >
              Hinzufügen
            </Button>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
