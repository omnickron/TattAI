import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { requireTattooer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime, formatRange } from "@/lib/format";
import { isCalendarMock } from "@/lib/google/mock-calendar";
import { WEEKDAY_LABELS } from "@/lib/labels-time";
import { formatTimeOfDay } from "@/lib/time";
import {
  addAvailabilityException,
  addAvailabilityRule,
  deleteAvailabilityException,
  deleteAvailabilityRule,
  disconnectGoogleCalendar,
  updateConsultationSettings,
} from "./actions";

export const metadata: Metadata = { title: "Verfügbarkeit" };

const GOOGLE_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google-Kalender verbunden." },
  denied: { ok: false, text: "Verbindung abgebrochen. Ohne Kalender bekommst du keine Termine." },
  scopes: {
    ok: false,
    text: "Es wurden nicht alle Berechtigungen erteilt. Bitte erneut verbinden und alle Häkchen setzen.",
  },
  account: {
    ok: false,
    text: "Bitte mit demselben Google-Konto verbinden, mit dem du dich anmeldest.",
  },
  error: {
    ok: false,
    text: "Die Verbindung mit Google ist fehlgeschlagen. Bitte erneut versuchen.",
  },
};

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120];
const BUFFERS = [0, 5, 10, 15, 20, 30, 45, 60];

export default async function AvailabilityPage({ searchParams }: PageProps<"/availability">) {
  const user = await requireTattooer();
  const params = await searchParams;
  const googleMessage = typeof params.google === "string" ? GOOGLE_MESSAGES[params.google] : null;

  const profile = await prisma.tattooerProfile.findUniqueOrThrow({
    where: { id: user.tattooerProfile.id },
    include: {
      availabilityRules: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      availabilityExceptions: {
        where: { endsAt: { gt: new Date() } },
        orderBy: { startsAt: "asc" },
      },
    },
  });
  const connected = Boolean(profile.googleConnectedAt);
  const mock = isCalendarMock();

  return (
    <>
      <PageHeader
        title="Meine Verfügbarkeit"
        description="In diesen Zeiten können Beratungen für dich gebucht werden – abzüglich belegter Zeiten in deinem Google-Kalender."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle
            action={
              connected ? (
                <Badge tone="green">verbunden</Badge>
              ) : (
                <Badge tone="amber">nicht verbunden</Badge>
              )
            }
          >
            Google-Kalender
          </CardTitle>
          {googleMessage && (
            <p
              role="status"
              className={
                googleMessage.ok
                  ? "mb-3 text-sm text-emerald-700 dark:text-emerald-400"
                  : "mb-3 text-sm text-red-600"
              }
            >
              {googleMessage.text}
            </p>
          )}
          {connected ? (
            <div className="space-y-3 text-sm">
              <p className="text-ink-soft">
                Verbunden
                {profile.googleAccountEmail && (
                  <>
                    {" "}
                    als <span className="text-ink">{profile.googleAccountEmail}</span>
                  </>
                )}{" "}
                seit {formatDateTime(profile.googleConnectedAt)}. Belegte Zeiten aus allen deinen
                Kalendern werden berücksichtigt, Beratungen landen im Kalender „Beratungen“.
              </p>
              <ActionForm
                action={disconnectGoogleCalendar}
                confirm="Kalender wirklich trennen? Du bekommst dann keine neuen Termine."
              >
                <Button type="submit" variant="secondary">
                  Verbindung trennen
                </Button>
              </ActionForm>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-ink-soft">
                Ohne verbundenen Kalender werden dir keine Termine zugeteilt. Die App sieht nur,
                wann du belegt bist – nicht, was in deinen Terminen steht.
              </p>
              <ButtonLink href="/api/google/connect" prefetch={false}>
                Google-Kalender verbinden
              </ButtonLink>
            </div>
          )}
          {mock && (
            <p className="mt-3 text-xs text-ink-soft">
              Beispiel-Modus: Es wird kein echter Google-Kalender verwendet (Mittagspause und
              einzelne private Termine werden simuliert).
            </p>
          )}
        </Card>

        <Card>
          <CardTitle>Beratung</CardTitle>
          <ActionForm
            action={updateConsultationSettings}
            className="grid gap-3 space-y-0 sm:grid-cols-2"
          >
            <Field label="Dauer einer Beratung" htmlFor="consultationMinutes">
              <Select
                id="consultationMinutes"
                name="consultationMinutes"
                defaultValue={profile.consultationMinutes}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} Minuten
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Puffer zwischen Terminen" htmlFor="bufferMinutes">
              <Select id="bufferMinutes" name="bufferMinutes" defaultValue={profile.bufferMinutes}>
                {BUFFERS.map((b) => (
                  <option key={b} value={b}>
                    {b === 0 ? "kein Puffer" : `${b} Minuten`}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <Button type="submit">Speichern</Button>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Wöchentliche Zeiten</CardTitle>
          {profile.availabilityRules.length === 0 ? (
            <p className="mb-4 text-sm text-ink-soft">Noch keine Zeiten freigegeben.</p>
          ) : (
            <ul className="mb-4 divide-y divide-line text-sm">
              {profile.availabilityRules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="inline-block w-24 font-medium">
                      {WEEKDAY_LABELS[r.weekday]}
                    </span>
                    <span className="tabular-nums">
                      {formatTimeOfDay(r.startMinute)}–{formatTimeOfDay(r.endMinute)} Uhr
                    </span>
                  </span>
                  <ActionForm action={deleteAvailabilityRule.bind(null, r.id)}>
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                      Entfernen
                    </Button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <ActionForm
            action={addAvailabilityRule}
            className="grid grid-cols-2 items-end gap-2 space-y-0 sm:grid-cols-3"
          >
            <div className="col-span-2 sm:col-span-1">
              <Field label="Wochentag" htmlFor="weekday">
                <Select id="weekday" name="weekday" defaultValue="1">
                  {Object.entries(WEEKDAY_LABELS).map(([n, label]) => (
                    <option key={n} value={n}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Von" htmlFor="from">
              <Input id="from" name="from" type="time" defaultValue="10:00" step={900} required />
            </Field>
            <Field label="Bis" htmlFor="to">
              <Input id="to" name="to" type="time" defaultValue="18:00" step={900} required />
            </Field>
            <div className="col-span-2 sm:col-span-3">
              <Button type="submit" variant="secondary">
                Zeitfenster hinzufügen
              </Button>
            </div>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Ausnahmen</CardTitle>
          {profile.availabilityExceptions.length === 0 ? (
            <p className="mb-4 text-sm text-ink-soft">Keine anstehenden Ausnahmen.</p>
          ) : (
            <ul className="mb-4 divide-y divide-line text-sm">
              {profile.availabilityExceptions.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="space-y-0.5">
                    {e.kind === "UNAVAILABLE" ? (
                      <Badge tone="red">abwesend</Badge>
                    ) : (
                      <Badge tone="green">zusätzlich</Badge>
                    )}{" "}
                    <span className="tabular-nums">{formatRange(e.startsAt, e.endsAt)}</span>
                    {e.note && <span className="block text-xs text-ink-soft">{e.note}</span>}
                  </span>
                  <ActionForm action={deleteAvailabilityException.bind(null, e.id)}>
                    <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                      Entfernen
                    </Button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <ActionForm
            action={addAvailabilityException}
            className="grid grid-cols-2 items-end gap-2 space-y-0"
          >
            <div className="col-span-2">
              <Field label="Art" htmlFor="kind">
                <Select id="kind" name="kind" defaultValue="UNAVAILABLE">
                  <option value="UNAVAILABLE">Abwesend (z. B. Urlaub)</option>
                  <option value="AVAILABLE">Zusätzlich verfügbar</option>
                </Select>
              </Field>
            </div>
            <Field label="Von (Datum)" htmlFor="fromDate">
              <Input id="fromDate" name="fromDate" type="date" required />
            </Field>
            <Field label="Bis (Datum)" htmlFor="toDate">
              <Input id="toDate" name="toDate" type="date" />
            </Field>
            <Field label="Ab Uhrzeit" htmlFor="fromTime" hint="leer = ganztägig">
              <Input id="fromTime" name="fromTime" type="time" step={900} />
            </Field>
            <Field label="Bis Uhrzeit" htmlFor="toTime">
              <Input id="toTime" name="toTime" type="time" step={900} />
            </Field>
            <div className="col-span-2">
              <Field label="Notiz (optional)" htmlFor="note">
                <Input
                  id="note"
                  name="note"
                  maxLength={200}
                  placeholder="z. B. Urlaub, Convention"
                />
              </Field>
            </div>
            <div className="col-span-2">
              <Button type="submit" variant="secondary">
                Ausnahme eintragen
              </Button>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
