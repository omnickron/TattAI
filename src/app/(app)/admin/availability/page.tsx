import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";
import { dayAvailability, toWeeklyRule } from "@/lib/scheduling/availability-overview";
import { isCalendarConnected } from "@/lib/scheduling/booking";
import { tattooerColor } from "@/lib/tattooer-colors";
import {
  addDays,
  formatTimeOfDay,
  isLocalDate,
  localDateOf,
  startOfLocalDay,
  weekdayOf,
} from "@/lib/time";

export const metadata: Metadata = { title: "Verfügbarkeiten" };

const dayHead = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const asUtc = (day: string) => new Date(`${day}T12:00:00Z`);
const range = (start: number, end: number) =>
  `${formatTimeOfDay(start)}–${end >= 1440 ? "24:00" : formatTimeOfDay(end)}`;

/** Admin: bookable times of all tattooers in one week, with absences and bookings. */
export default async function AvailabilityOverviewPage({
  searchParams,
}: PageProps<"/admin/availability">) {
  await requireAdmin();
  const params = await searchParams;
  const today = localDateOf(new Date(), APP_TIMEZONE);
  const requested =
    typeof params.woche === "string" && isLocalDate(params.woche) ? params.woche : today;
  const monday = addDays(requested, 1 - weekdayOf(requested));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekStart = startOfLocalDay(monday, APP_TIMEZONE);
  const weekEnd = startOfLocalDay(addDays(monday, 7), APP_TIMEZONE);

  const [tattooers, consultations] = await Promise.all([
    prisma.tattooerProfile.findMany({
      where: { user: { active: true } },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { name: true } },
        availabilityRules: true,
        availabilityExceptions: { where: { startsAt: { lt: weekEnd }, endsAt: { gt: weekStart } } },
      },
    }),
    prisma.consultation.findMany({
      where: {
        status: { not: "CANCELLED" },
        walkIn: false,
        startsAt: { gte: weekStart, lt: weekEnd },
      },
      select: { tattooerId: true, startsAt: true },
    }),
  ]);
  const allProfiles = await prisma.tattooerProfile.findMany({
    select: { id: true, calendarColor: true },
    orderBy: { createdAt: "asc" },
  });
  const color = new Map(allProfiles.map((p, i) => [p.id, tattooerColor(p.calendarColor, i)]));
  const booked = (tattooerId: string, day: string) =>
    consultations.filter(
      (c) => c.tattooerId === tattooerId && localDateOf(c.startsAt, APP_TIMEZONE) === day,
    ).length;

  const rows = tattooers.map((t) => {
    const input = {
      rules: t.availabilityRules.map(toWeeklyRule),
      exceptions: t.availabilityExceptions.map((e) => ({
        kind: e.kind,
        start: e.startsAt,
        end: e.endsAt,
        note: e.note,
      })),
    };
    const perDay = days.map((d) => ({
      day: d,
      ...dayAvailability(input, d, APP_TIMEZONE),
      booked: booked(t.id, d),
    }));
    const minutes = perDay.reduce(
      (sum, d) => sum + d.windows.reduce((s, w) => s + w.end - w.start, 0),
      0,
    );
    return {
      t,
      perDay,
      hours: Math.round((minutes / 60) * 10) / 10,
      bookable: isCalendarConnected(t),
      hasRules: t.availabilityRules.length > 0,
    };
  });

  const nav = (offset: number) => `/admin/availability?woche=${addDays(monday, offset)}`;

  return (
    <>
      <PageHeader
        title="Verfügbarkeiten"
        description="Wann Beratungen bei wem gebucht werden können: wiederkehrende Zeiten, Abwesenheiten und Zusatzzeiten der Tätowierer. Termine aus Google bzw. TeamUp ziehen beim Buchen zusätzlich ab."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={nav(-7)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Vorherige
        </Link>
        <Link
          href="/admin/availability"
          className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-muted"
        >
          Diese Woche
        </Link>
        <Link
          href={nav(7)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-muted"
        >
          Nächste →
        </Link>
        <span className="text-sm text-ink-soft">
          {dayHead.format(asUtc(days[0]))} – {dayHead.format(asUtc(days[6]))}
        </span>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="sticky left-0 bg-surface p-3 font-medium">Tätowierer</th>
              {days.map((d) => (
                <th
                  key={d}
                  className={`p-3 font-medium ${d === today ? "text-ink" : "text-ink-soft"}`}
                >
                  {dayHead.format(asUtc(d))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, perDay, hours, bookable, hasRules }) => (
              <tr key={t.id} className="border-b border-line align-top last:border-0">
                <th scope="row" className="sticky left-0 bg-surface p-3 text-left font-normal">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: color.get(t.id) }}
                    />
                    {t.user.name}
                  </span>
                  <span className="mt-1 block text-xs text-ink-soft">{hours} Std. buchbar</span>
                  {!bookable && (
                    <span className="mt-1 block">
                      <Badge tone="red">kein Kalender – nicht buchbar</Badge>
                    </span>
                  )}
                  {bookable && !hasRules && (
                    <span className="mt-1 block">
                      <Badge tone="amber">keine Zeiten hinterlegt</Badge>
                    </span>
                  )}
                </th>
                {perDay.map((d) => (
                  <td key={d.day} className="space-y-1 p-3">
                    {d.windows.length === 0 && d.absences.length === 0 && (
                      <span className="text-ink-soft">–</span>
                    )}
                    {d.windows.map((w) => (
                      <span
                        key={w.start}
                        className="block rounded-md bg-emerald-50 px-1.5 py-0.5 tabular-nums text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      >
                        {range(w.start, w.end)}
                      </span>
                    ))}
                    {d.absences.map((a, i) => (
                      <span
                        key={i}
                        className="block rounded-md bg-muted px-1.5 py-0.5 text-xs text-ink-soft"
                      >
                        {a.allDay ? "abwesend" : `geblockt ${range(a.start, a.end)}`}
                        {a.note ? ` · ${a.note}` : ""}
                      </span>
                    ))}
                    {d.booked > 0 && (
                      <span className="block text-xs text-ink-soft">
                        {d.booked === 1 ? "1 Beratung" : `${d.booked} Beratungen`}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-ink-soft">
                  Noch keine aktiven Tätowierer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-ink-soft">
        Grün: buchbare Zeiten. Grau: Abwesenheiten und Blocker. Jeder Tätowierer pflegt seine Zeiten
        selbst unter „Verfügbarkeit“.
      </p>
    </>
  );
}
