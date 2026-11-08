import { OutcomeForm } from "@/components/outcome-form";
import { TattooSessions, type TattooSession } from "@/components/tattoo-sessions";
import { Badge } from "@/components/ui";
import { recordOutcomeAction } from "@/app/(app)/consultations/actions";
import { APP_TIMEZONE } from "@/lib/format";
import { centsToInput } from "@/lib/outcomes/money";
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
  followUpAt?: Date | null;
  followUpDoneAt?: Date | null;
  tattooBookings: TattooSession[];
};

const localDate = (d: Date) => localDateOf(d, APP_TIMEZONE);
const followUpLabel = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const localTime = (d: Date | null) => (d ? formatTimeOfDay(localMinuteOf(d, APP_TIMEZONE)) : "");

export function outcomeSummary(c: OutcomeConsultation): string {
  if (c.status === "NO_SHOW") return "No-Show";
  if (c.status === "CANCELLED") return "Abgesagt";
  if (c.status !== "HELD") return "";
  if (c.tattooBooked === false) return "Stattgefunden · kein Tattoo";
  if (c.tattooBooked === null)
    return c.followUpAt
      ? `Stattgefunden · Follow-up am ${followUpLabel.format(c.followUpAt)}${c.followUpDoneAt ? " (erledigt)" : ""}`
      : "Stattgefunden · Kunde überlegt noch";
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
  sessionsInline = true,
}: {
  c: OutcomeConsultation;
  now: Date;
  returnTo: string;
  /** false: sessions are shown in a separate card (lead page) */
  sessionsInline?: boolean;
}) {
  const started = c.startsAt <= now;
  const needsOutcome = c.status === "SCHEDULED" && started;
  // Cancellations before the appointment (button "Absagen") have no outcome to show here.
  const hasOutcome =
    c.status === "HELD" ||
    c.status === "NO_SHOW" ||
    (c.status === "CANCELLED" && Boolean(c.outcomeRecordedAt));
  const sessions = [...c.tattooBookings].sort((a, b) => a.sessionNumber - b.sessionNumber);
  const activeSessions = sessions.filter((x) => !x.cancelled).length;
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
    followUpDate: c.followUpAt ? localDate(c.followUpAt) : null,
    sessions: sessions
      .filter((s) => !s.cancelled)
      .map((s) => ({
        date: localDate(s.date),
        amount: centsToInput(s.amountCents),
        deposit: centsToInput(s.depositCents),
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

          {c.status === "HELD" &&
            c.tattooBooked &&
            (sessionsInline ? (
              <TattooSessions consultationId={c.id} sessions={sessions} now={now} canEdit />
            ) : (
              <p className="text-sm text-ink-soft">
                {activeSessions === 1 ? "1 Tattoo-Termin" : `${activeSessions} Tattoo-Termine`} –
                siehe „Tattoo-Termine“.
              </p>
            ))}

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
