import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AttachmentThumbs, type ThumbAttachment } from "@/components/attachment-thumbs";
import {
  loadConsultationOptions,
  MODE_OPTION_LABELS,
  selectableModes,
} from "@/lib/consultation-options";
import { OutcomePanel, type OutcomeConsultation } from "@/components/outcome-panel";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  Input,
  PencilIcon,
  Select,
  TimeSelect,
} from "@/components/ui";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";
import { CALENDAR_CONNECTED_WHERE, getAvailableSlots } from "@/lib/scheduling/booking";
import { schedulingDeps } from "@/lib/scheduling/deps";
import { CONSULTATION_MODE_LABELS } from "@/lib/scheduling/event-content";
import {
  addDays,
  formatTimeOfDay,
  isLocalDate,
  localDateOf,
  localMinuteOf,
  startOfLocalDay,
} from "@/lib/time";
import {
  bookConsultationAction,
  cancelConsultationAction,
  changeConsultationModeAction,
  moveConsultationAction,
  reassignConsultationAction,
} from "./actions";

const dayOnly = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dayTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABELS = {
  SCHEDULED: { label: "geplant", tone: "blue" },
  HELD: { label: "stattgefunden", tone: "green" },
  NO_SHOW: { label: "No-Show", tone: "red" },
  CANCELLED: { label: "abgesagt", tone: "gray" },
} as const;

type Consultation = OutcomeConsultation & {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: keyof typeof STATUS_LABELS;
  mode: "ON_SITE" | "PHONE";
  tattooerId: string;
  calendarEventId: string | null;
  tattooer: { user: { name: string } };
  attachments: ThumbAttachment[];
};

const nextDayLabel = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

export async function ConsultationsSection({
  user,
  leadId,
  consultations,
  bookDate,
  bookedId,
  savedId,
}: {
  user: CurrentUser;
  leadId: string;
  consultations: Consultation[];
  bookDate: string | undefined;
  bookedId?: string;
  savedId?: string;
}) {
  const isAdmin = user.role === "ADMIN";
  const now = new Date();
  const modeOptions = await loadConsultationOptions(prisma);
  const hasUpcoming = consultations.some((c) => c.status === "SCHEDULED" && c.endsAt > now);
  const tattooers = isAdmin
    ? await prisma.tattooerProfile.findMany({
        where: { user: { active: true }, ...CALENDAR_CONNECTED_WHERE },
        select: { id: true, user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <Card>
      <CardTitle>Beratungstermine</CardTitle>
      {savedId && consultations.some((c) => c.id === savedId) && (
        <p role="status" className="mb-2 text-sm text-emerald-700 dark:text-emerald-400">
          Ergebnis gespeichert.
        </p>
      )}
      {bookedId && consultations.some((c) => c.id === bookedId) && (
        <p role="status" className="mb-2 text-sm text-emerald-700 dark:text-emerald-400">
          Beratung gebucht bei {consultations.find((c) => c.id === bookedId)!.tattooer.user.name}.
        </p>
      )}
      {consultations.length === 0 ? (
        <p className="text-sm text-ink-soft">Noch kein Termin.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {consultations.map((c) => {
            const status = STATUS_LABELS[c.status];
            const canManage =
              c.status === "SCHEDULED" && (isAdmin || c.tattooerId === user.tattooerProfile?.id);
            const editable = canManage && c.startsAt > now;
            return (
              <li key={c.id} className="space-y-2 py-3">
                <details className="group">
                  <summary className="flex cursor-default list-none flex-wrap items-center gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
                    {editable && (
                      <span
                        role="button"
                        aria-label={`Beratungstermin vom ${dayTime.format(c.startsAt)} bearbeiten`}
                        title="Bearbeiten"
                        className="-ml-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-ink-soft hover:bg-muted hover:text-ink group-open:bg-muted group-open:text-ink"
                      >
                        <PencilIcon />
                      </span>
                    )}
                    <span className="font-semibold">Beratungstermin</span>
                    <span className="tabular-nums">
                      {dayOnly.format(c.startsAt)} ·{" "}
                      {formatTimeOfDay(localMinuteOf(c.startsAt, APP_TIMEZONE))} Uhr
                    </span>
                    <span className="text-ink-soft">{c.tattooer.user.name}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <Badge tone={c.mode === "PHONE" ? "violet" : "gray"}>
                        {CONSULTATION_MODE_LABELS[c.mode]}
                      </Badge>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                  </summary>
                  {editable && (
                    <div className="mt-3 space-y-3 rounded-lg border border-line bg-surface p-3">
                      <ActionForm
                        action={moveConsultationAction.bind(null, c.id)}
                        className="grid grid-cols-2 items-end gap-2 space-y-0 sm:grid-cols-[10.5rem_7.5rem_auto]"
                      >
                        <Field label="Datum" htmlFor={`move-date-${c.id}`}>
                          <Input
                            id={`move-date-${c.id}`}
                            type="date"
                            name="date"
                            defaultValue={localDateOf(c.startsAt, APP_TIMEZONE)}
                            min={localDateOf(now, APP_TIMEZONE)}
                            required
                          />
                        </Field>
                        <Field label="Beginn" htmlFor={`move-time-${c.id}`}>
                          <TimeSelect
                            id={`move-time-${c.id}`}
                            name="time"
                            defaultValue={formatTimeOfDay(localMinuteOf(c.startsAt, APP_TIMEZONE))}
                            required
                          />
                        </Field>
                        <Button
                          type="submit"
                          variant="secondary"
                          className="col-span-2 justify-self-start sm:col-span-1"
                        >
                          Verschieben
                        </Button>
                      </ActionForm>
                      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
                        <ActionForm
                          action={changeConsultationModeAction.bind(null, c.id)}
                          className="flex items-end gap-2 space-y-0"
                        >
                          <Select
                            name="mode"
                            defaultValue={c.mode}
                            aria-label="Beratungsform"
                            className="w-44"
                          >
                            {selectableModes(modeOptions, c.mode).map((m) => (
                              <option key={m} value={m}>
                                {MODE_OPTION_LABELS[m]}
                              </option>
                            ))}
                          </Select>
                          <Button type="submit" variant="secondary">
                            Ändern
                          </Button>
                        </ActionForm>
                        {isAdmin && (
                          <ActionForm
                            action={reassignConsultationAction.bind(null, c.id)}
                            className="flex items-end gap-2 space-y-0"
                          >
                            <Select
                              name="tattooerId"
                              defaultValue=""
                              aria-label="Umverteilen an"
                              className="w-44"
                            >
                              <option value="" disabled>
                                Umverteilen an …
                              </option>
                              {tattooers
                                .filter((t) => t.id !== c.tattooerId)
                                .map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.user.name}
                                  </option>
                                ))}
                            </Select>
                            <Button type="submit" variant="secondary">
                              Umverteilen
                            </Button>
                          </ActionForm>
                        )}
                        <ActionForm
                          action={cancelConsultationAction.bind(null, c.id)}
                          confirm="Termin wirklich absagen?"
                        >
                          <Button type="submit" variant="ghost" className="text-red-600">
                            Termin absagen
                          </Button>
                        </ActionForm>
                      </div>
                    </div>
                  )}
                </details>
                {c.attachments.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-ink-soft">
                      Referenzbilder ({c.attachments.length})
                    </p>
                    <AttachmentThumbs attachments={c.attachments} size="sm" className="max-w-md" />
                  </div>
                )}
                {c.status === "SCHEDULED" && !c.calendarEventId && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Kein Kalendereintrag vorhanden.
                  </p>
                )}
                <OutcomePanel
                  c={c}
                  now={now}
                  returnTo={`/leads/${leadId}`}
                  sessionsInline={false}
                />
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin && !hasUpcoming && (
        <BookingForm leadId={leadId} bookDate={bookDate} tattooers={tattooers} />
      )}
    </Card>
  );
}

async function BookingForm({
  leadId,
  bookDate,
  tattooers,
}: {
  leadId: string;
  bookDate: string | undefined;
  tattooers: Array<{ id: string; user: { name: string } }>;
}) {
  const modeOptions = await loadConsultationOptions(prisma);
  const today = localDateOf(new Date(), APP_TIMEZONE);
  const day = bookDate && isLocalDate(bookDate) && bookDate >= today ? bookDate : today;
  const slots = await getAvailableSlots(schedulingDeps(), {
    from: startOfLocalDay(day, APP_TIMEZONE),
    to: startOfLocalDay(addDays(day, 1), APP_TIMEZONE),
  });
  const names = new Map(tattooers.map((t) => [t.id, t.user.name]));
  // Nothing free that day: offer the next days that have free times
  const nextDays =
    slots.length === 0
      ? [
          ...new Map(
            (
              await getAvailableSlots(schedulingDeps(), {
                from: startOfLocalDay(addDays(day, 1), APP_TIMEZONE),
                to: startOfLocalDay(addDays(day, 22), APP_TIMEZONE),
              })
            ).map((s) => [localDateOf(s.start, APP_TIMEZONE), s.start]),
          ).keys(),
        ].slice(0, 6)
      : [];
  const dayLink = (d: string) => `/leads/${leadId}?bookDate=${d}`;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="mb-1 text-sm font-semibold">Termin buchen</h3>
      <p className="mb-3 text-xs text-ink-soft">
        Normalerweise bucht der Bot im WhatsApp-Chat. Bei „Automatisch“ bekommt den Termin, wer zu
        der Zeit frei ist und gemessen an seinem Anteil bisher am wenigsten Beratungen hatte.
      </p>
      <form className="mb-3 flex items-end gap-2">
        <Input
          type="date"
          name="bookDate"
          defaultValue={day}
          min={today}
          aria-label="Tag"
          className="w-44"
        />
        <Button type="submit" variant="secondary">
          Freie Zeiten anzeigen
        </Button>
      </form>
      {slots.length === 0 ? (
        <div className="text-sm text-ink-soft">
          <p>An diesem Tag ist niemand verfügbar.</p>
          {nextDays.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>Nächste freie Tage:</span>
              {nextDays.map((d) => (
                <Link
                  key={d}
                  href={dayLink(d)}
                  scroll={false}
                  className="rounded-lg border border-line px-2.5 py-1 text-ink hover:bg-muted"
                >
                  {nextDayLabel.format(new Date(`${d}T12:00:00Z`))}
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-1">
              Auch in den nächsten drei Wochen ist nichts frei – Verfügbarkeiten der Tätowierer
              prüfen.
            </p>
          )}
        </div>
      ) : (
        <ActionForm action={bookConsultationAction.bind(null, leadId)}>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              Freie Zeiten{" "}
              <span className="font-normal text-ink-soft">(in Klammern: so viele sind frei)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {slots.map((s, i) => (
                <label
                  key={s.start.toISOString()}
                  title={s.tattooers.map((t) => names.get(t.tattooerId)).join(", ")}
                  className="cursor-pointer rounded-lg border border-line px-2.5 py-1.5 text-sm tabular-nums has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper"
                >
                  <input
                    type="radio"
                    name="slot"
                    value={s.start.toISOString()}
                    defaultChecked={i === 0}
                    className="sr-only"
                  />
                  {formatTimeOfDay(localMinuteOf(s.start, APP_TIMEZONE))}
                  <span className="ml-1 text-xs opacity-60">({s.tattooers.length})</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Beratungsform" htmlFor="book-mode">
              <Select id="book-mode" name="mode" defaultValue={modeOptions.modes[0]}>
                {modeOptions.modes.map((m) => (
                  <option key={m} value={m}>
                    {MODE_OPTION_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tätowierer" htmlFor="book-tattooer">
              <Select id="book-tattooer" name="tattooerId" defaultValue="">
                <option value="">Automatisch (fair)</option>
                {tattooers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.user.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit">Termin buchen</Button>
        </ActionForm>
      )}
    </div>
  );
}
