import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, cn, EmptyState, PageHeader, Select, Button } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";
import { CONSULTATION_MODE_LABELS } from "@/lib/scheduling/event-content";
import {
  addDays,
  isLocalDate,
  localDateOf,
  localMinuteOf,
  startOfLocalDay,
  startOfWeek,
  formatTimeOfDay,
} from "@/lib/time";

export const metadata: Metadata = { title: "Kalender" };

const TONES = [
  "border-l-blue-500 bg-blue-50 dark:bg-blue-950/60",
  "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
  "border-l-amber-500 bg-amber-50 dark:bg-amber-950/60",
  "border-l-violet-500 bg-violet-50 dark:bg-violet-950/60",
  "border-l-rose-500 bg-rose-50 dark:bg-rose-950/60",
  "border-l-cyan-500 bg-cyan-50 dark:bg-cyan-950/60",
  "border-l-lime-500 bg-lime-50 dark:bg-lime-950/60",
];

const dayHeader = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const longDay = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const rangeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const asUtcDate = (localDate: string) => new Date(`${localDate}T12:00:00Z`);

const PX_PER_MIN = 1.1;

type Item = {
  id: string;
  leadId: string;
  leadName: string;
  tattooerName: string;
  tone: string;
  status: string;
  mode: "ON_SITE" | "PHONE";
  day: string;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
};

/** Assigns side-by-side lanes to overlapping items of one day. */
function layoutLanes(items: Item[]) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let group: Item[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanesEnd: number[] = [];
    for (const it of group) {
      let lane = lanesEnd.findIndex((end) => end <= it.startMin);
      if (lane === -1) lane = lanesEnd.push(0) - 1;
      lanesEnd[lane] = it.endMin;
      it.lane = lane;
    }
    for (const it of group) it.lanes = lanesEnd.length;
    group = [];
  };
  for (const it of sorted) {
    if (it.startMin >= groupEnd && group.length) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.endMin);
  }
  if (group.length) flush();
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const params = await searchParams;
  const view = params.view === "day" ? "day" : "week";
  const today = localDateOf(new Date(), APP_TIMEZONE);
  const date = typeof params.date === "string" && isLocalDate(params.date) ? params.date : today;
  const first = view === "week" ? startOfWeek(date) : date;
  const dayCount = view === "week" ? 7 : 1;
  const days = Array.from({ length: dayCount }, (_, i) => addDays(first, i));

  const tattooers = isAdmin
    ? await prisma.tattooerProfile.findMany({
        where: { user: { active: true } },
        select: { id: true, user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const filter =
    isAdmin &&
    typeof params.tattooer === "string" &&
    tattooers.some((t) => t.id === params.tattooer)
      ? params.tattooer
      : null;
  const scopeTattooer = isAdmin ? filter : (user.tattooerProfile?.id ?? "__none__");

  const consultations = await prisma.consultation.findMany({
    where: {
      status: { not: "CANCELLED" },
      startsAt: {
        gte: startOfLocalDay(first, APP_TIMEZONE),
        lt: startOfLocalDay(addDays(first, dayCount), APP_TIMEZONE),
      },
      ...(scopeTattooer ? { tattooerId: scopeTattooer } : {}),
    },
    include: {
      lead: { select: { id: true, name: true } },
      tattooer: { select: { id: true, createdAt: true, user: { select: { name: true } } } },
    },
    orderBy: { startsAt: "asc" },
  });

  const toneIndex = new Map(tattooers.map((t, i) => [t.id, i]));
  const items: Item[] = consultations.map((c) => {
    const startMin = localMinuteOf(c.startsAt, APP_TIMEZONE);
    const day = localDateOf(c.startsAt, APP_TIMEZONE);
    const sameDayEnd = localDateOf(c.endsAt, APP_TIMEZONE) === day;
    return {
      id: c.id,
      leadId: c.lead.id,
      leadName: c.lead.name,
      tattooerName: c.tattooer.user.name,
      tone: TONES[(toneIndex.get(c.tattooer.id) ?? 0) % TONES.length],
      status: c.status,
      mode: c.mode,
      day,
      startMin,
      endMin: sameDayEnd ? Math.max(startMin + 15, localMinuteOf(c.endsAt, APP_TIMEZONE)) : 1440,
      lane: 0,
      lanes: 1,
    };
  });
  for (const d of days) layoutLanes(items.filter((i) => i.day === d));

  const startHour = Math.min(8, ...items.map((i) => Math.floor(i.startMin / 60)));
  const endHour = Math.max(20, ...items.map((i) => Math.ceil(i.endMin / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const href = (next: Partial<{ view: string; date: string; tattooer: string | null }>) => {
    const qs = new URLSearchParams();
    qs.set("view", next.view ?? view);
    qs.set("date", next.date ?? date);
    const t = next.tattooer === undefined ? filter : next.tattooer;
    if (t) qs.set("tattooer", t);
    return `/calendar?${qs}`;
  };
  const step = view === "week" ? 7 : 1;
  const title =
    view === "week"
      ? `${rangeFmt.format(asUtcDate(first)).replace(/ \d{4}$/, "")} – ${rangeFmt.format(asUtcDate(addDays(first, 6)))}`
      : longDay.format(asUtcDate(date));

  return (
    <>
      <PageHeader
        title="Kalender"
        description={isAdmin ? "Beratungstermine aller Tätowierer" : "Deine Beratungstermine"}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <ButtonLink
            href={href({ date: addDays(date, -step) })}
            variant="secondary"
            aria-label="Zurück"
          >
            ←
          </ButtonLink>
          <ButtonLink href={href({ date: today })} variant="secondary">
            Heute
          </ButtonLink>
          <ButtonLink
            href={href({ date: addDays(date, step) })}
            variant="secondary"
            aria-label="Weiter"
          >
            →
          </ButtonLink>
        </div>
        <h2 className="mr-auto text-base font-semibold">{title}</h2>
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          {(["day", "week"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1",
                view === v ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
              )}
            >
              {v === "day" ? "Tag" : "Woche"}
            </Link>
          ))}
        </div>
        {isAdmin && (
          <form className="flex gap-2">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="date" value={date} />
            <Select
              name="tattooer"
              defaultValue={filter ?? ""}
              aria-label="Tätowierer"
              className="w-44"
            >
              <option value="">Alle Tätowierer</option>
              {tattooers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.user.name}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              Anzeigen
            </Button>
          </form>
        )}
      </div>

      {/* Mobile: agenda */}
      <div className="space-y-4 md:hidden">
        {items.length === 0 && <EmptyState>Keine Beratungen in diesem Zeitraum.</EmptyState>}
        {days.map((d) => {
          const dayItems = items.filter((i) => i.day === d);
          if (!dayItems.length) return null;
          return (
            <section key={d}>
              <h3 className={cn("mb-2 text-sm font-semibold", d === today && "text-accent")}>
                {longDay.format(asUtcDate(d))}
              </h3>
              <ul className="space-y-2">
                {dayItems.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/leads/${i.leadId}`}
                      className={cn("block rounded-lg border-l-4 px-3 py-2", i.tone)}
                    >
                      <span className="block text-sm font-medium">{i.leadName}</span>
                      <span className="block text-xs text-ink-soft tabular-nums">
                        {formatTimeOfDay(i.startMin)}–{formatTimeOfDay(i.endMin % 1440)} ·{" "}
                        {CONSULTATION_MODE_LABELS[i.mode]}
                        {isAdmin && ` · ${i.tattooerName}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Desktop: time grid */}
      <div className="hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
        <div
          className="grid border-b border-line"
          style={{ gridTemplateColumns: `3.5rem repeat(${dayCount}, minmax(0, 1fr))` }}
        >
          <div />
          {days.map((d) => (
            <Link
              key={d}
              href={href({ view: "day", date: d })}
              className={cn(
                "border-l border-line px-2 py-2 text-center text-sm font-medium hover:bg-muted",
                d === today && "text-accent",
              )}
            >
              {view === "week" ? dayHeader.format(asUtcDate(d)) : longDay.format(asUtcDate(d))}
            </Link>
          ))}
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: `3.5rem repeat(${dayCount}, minmax(0, 1fr))` }}
        >
          <div className="relative">
            {hours.map((h) => (
              <div
                key={h}
                className="pr-2 text-right text-[11px] text-ink-soft"
                style={{ height: 60 * PX_PER_MIN }}
              >
                <span className="relative -top-2">
                  {h > startHour ? `${String(h).padStart(2, "0")}:00` : ""}
                </span>
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d}
              className={cn("relative border-l border-line", d === today && "bg-accent/[0.03]")}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-t border-line/60 first:border-t-0"
                  style={{ height: 60 * PX_PER_MIN }}
                />
              ))}
              {items
                .filter((i) => i.day === d)
                .map((i) => (
                  <Link
                    key={i.id}
                    href={`/leads/${i.leadId}`}
                    title={`${i.leadName} · ${i.tattooerName}`}
                    className={cn(
                      "absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-xs leading-tight shadow-sm hover:z-10 hover:shadow",
                      i.tone,
                    )}
                    style={{
                      top: (i.startMin - startHour * 60) * PX_PER_MIN,
                      height: Math.max(22, (i.endMin - i.startMin) * PX_PER_MIN - 2),
                      left: `calc(${(i.lane / i.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / i.lanes}% - 4px)`,
                    }}
                  >
                    <span className="block truncate font-medium">
                      {i.mode === "PHONE" && "☎ "}
                      {i.leadName}
                    </span>
                    <span className="block truncate text-ink-soft tabular-nums">
                      {formatTimeOfDay(i.startMin)}
                      {isAdmin && ` · ${i.tattooerName}`}
                    </span>
                  </Link>
                ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
