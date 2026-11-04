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
  Select,
  TimeSelect,
} from "@/components/ui";
import { requireTattooer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatRange } from "@/lib/format";
import { WEEKDAY_LABELS } from "@/lib/labels-time";
import { formatTimeOfDay } from "@/lib/time";
import {
  addAvailabilityException,
  addAvailabilityRule,
  deleteAvailabilityException,
  deleteAvailabilityRule,
  updateConsultationSettings,
} from "./actions";
import { CalendarCard } from "./calendar-card";

export const metadata: Metadata = { title: "Verfügbarkeit" };

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120];
const BUFFERS = [0, 5, 10, 15, 20, 30, 45, 60];

export default async function AvailabilityPage({ searchParams }: PageProps<"/availability">) {
  const user = await requireTattooer();
  const params = await searchParams;

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

  return (
    <>
      <PageHeader
        title="Meine Verfügbarkeit"
        description="In diesen Zeiten können Beratungen für dich gebucht werden – abzüglich belegter Zeiten in deinem Kalender (Google oder TeamUp)."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <CalendarCard
          profile={profile}
          userName={user.name}
          isAdmin={user.role === "ADMIN"}
          tab={typeof params.kalender === "string" ? params.kalender : undefined}
          googleResult={typeof params.google === "string" ? params.google : undefined}
        />

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
              <TimeSelect id="from" name="from" defaultValue="10:00" required />
            </Field>
            <Field label="Bis" htmlFor="to">
              <TimeSelect id="to" name="to" defaultValue="18:00" endOfDay required />
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
              <TimeSelect id="fromTime" name="fromTime" defaultValue="" emptyLabel="–" />
            </Field>
            <Field label="Bis Uhrzeit" htmlFor="toTime">
              <TimeSelect id="toTime" name="toTime" defaultValue="" endOfDay emptyLabel="–" />
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
