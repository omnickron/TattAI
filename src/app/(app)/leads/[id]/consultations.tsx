import { ActionForm } from "@/components/action-form";
import { OutcomePanel, type OutcomeConsultation } from "@/components/outcome-panel";
import { Badge, Button, Card, CardTitle, Input, Select } from "@/components/ui";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE, formatDateTime } from "@/lib/format";
import { getAvailableSlots } from "@/lib/scheduling/booking";
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
  reassignConsultationAction,
} from "./actions";

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
};

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
  const hasUpcoming = consultations.some((c) => c.status === "SCHEDULED" && c.endsAt > now);
  const tattooers = isAdmin
    ? await prisma.tattooerProfile.findMany({
        where: { user: { active: true }, googleConnectedAt: { not: null } },
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
            return (
              <li key={c.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">{formatDateTime(c.startsAt)}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <Badge tone={c.mode === "PHONE" ? "violet" : "gray"}>
                    {CONSULTATION_MODE_LABELS[c.mode]}
                  </Badge>
                  <span className="ml-auto text-ink-soft">{c.tattooer.user.name}</span>
                </div>
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
                {canManage && c.startsAt > now && (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
                      Termin verwalten
                    </summary>
                    <div className="mt-2 flex flex-wrap items-end gap-3">
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
                          <option value="ON_SITE">Vor Ort</option>
                          <option value="PHONE">Telefon (kann nicht anreisen)</option>
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
                        <Button type="submit" variant="danger">
                          Absagen
                        </Button>
                      </ActionForm>
                    </div>
                  </details>
                )}
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
  const today = localDateOf(new Date(), APP_TIMEZONE);
  const day = bookDate && isLocalDate(bookDate) && bookDate >= today ? bookDate : today;
  const slots = await getAvailableSlots(schedulingDeps(), {
    from: startOfLocalDay(day, APP_TIMEZONE),
    to: startOfLocalDay(addDays(day, 1), APP_TIMEZONE),
  });
  const names = new Map(tattooers.map((t) => [t.id, t.user.name]));

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="mb-1 text-sm font-semibold">Termin buchen</h3>
      <p className="mb-3 text-xs text-ink-soft">
        Später bucht der Chatbot. Bei „automatisch“ bekommt den Termin, wer frei ist und den größten
        Rückstand hat.
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
        <p className="text-sm text-ink-soft">An diesem Tag ist niemand verfügbar.</p>
      ) : (
        <ActionForm action={bookConsultationAction.bind(null, leadId)}>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Freie Zeiten</legend>
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
            <Select name="mode" defaultValue="ON_SITE" aria-label="Beratungsform">
              <option value="ON_SITE">Vor Ort</option>
              <option value="PHONE">Telefon (kann nicht anreisen)</option>
            </Select>
            <Select name="tattooerId" defaultValue="" aria-label="Tätowierer">
              <option value="">Automatisch (fair)</option>
              {tattooers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.user.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">Termin buchen</Button>
        </ActionForm>
      )}
    </div>
  );
}
