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

/** Tattoo sessions get a diagonal texture so they differ from consultations without relying on color. */
const TATTOO_TEXTURE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, currentColor 8%, transparent) 6px 12px)",
};

function TattooTag({ n }: { n?: number }) {
  return (
    <span className="mr-1 rounded bg-ink/80 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-paper">
      Tattoo{n ? ` ${n}` : ""}
    </span>
  );
}

type Item = {
  id: string;
  kind: "CONSULTATION" | "TATTOO";
  sessionNumber?: number;
  leadId: string;
  leadName: string;
  tattooerName: string;
  tone: string;
  status: string;
  mode: "ON_SITE" | "PHONE" | null;
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

  // Tattoo sessions: with time in the grid, without time as all-day entries
  const rangeStart = startOfLocalDay(first, APP_TIMEZONE);
  const rangeEnd = startOfLocalDay(addDays(first, dayCount), APP_TIMEZONE);
  const sessions = await prisma.tattooBooking.findMany({
    where: {
      cancelled: false,
      consultation: {
        status: "HELD",
        tattooBooked: true,
        ...(scopeTattooer ? { tattooerId: scopeTattooer } : {}),
      },
      OR: [
        { startsAt: { gte: rangeStart, lt: rangeEnd } },
        { startsAt: null, date: { gte: rangeStart, lt: rangeEnd } },
      ],
    },
    include: {
      consultation: {
        select: {
          lead: { select: { id: true, name: true } },
          tattooer: { select: { id: true, user: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ startsAt: "asc" }, { date: "asc" }],
  });

  const toneIndex = new Map(tattooers.map((t, i) => [t.id, i]));
  const items: Item[] = consultations.map((c) => {
    const startMin = localMinuteOf(c.startsAt, APP_TIMEZONE);
    const day = localDateOf(c.startsAt, APP_TIMEZONE);
    const sameDayEnd = localDateOf(c.endsAt, APP_TIMEZONE) === day;
    return {
      id: c.id,
      kind: "CONSULTATION" as const,
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
  const allDay: Item[] = [];
  for (const sn of sessions) {
    const t = sn.consultation.tattooer;
    const base = {
      id: `tattoo-${sn.id}`,
      kind: "TATTOO" as const,
      sessionNumber: sn.sessionNumber,
      leadId: sn.consultation.lead.id,
      leadName: sn.consultation.lead.name,
      tattooerName: t.user.name,
      tone: TONES[(toneIndex.get(t.id) ?? 0) % TONES.length],
      status: "TATTOO",
      mode: null,
      lane: 0,
      lanes: 1,
    };
    if (sn.startsAt && sn.endsAt) {
      const day = localDateOf(sn.startsAt, APP_TIMEZONE);
      const startMin = localMinuteOf(sn.startsAt, APP_TIMEZONE);
      const sameDay = localDateOf(sn.endsAt, APP_TIMEZONE) === day;
      items.push({
        ...base,
        day,
        startMin,
        endMin: sameDay ? Math.max(startMin + 15, localMinuteOf(sn.endsAt, APP_TIMEZONE)) : 1440,
      });
    } else {
      allDay.push({ ...base, day: localDateOf(sn.date, APP_TIMEZONE), startMin: 0, endMin: 0 });
    }
  }
  items.sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin);
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
        description={
          isAdmin
            ? "Beratungen und Tattoo-Termine aller Tätowierer"
            : "Deine Beratungen und Tattoo-Termine"
        }
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
        {items.length + allDay.length === 0 && (
          <EmptyState>Keine Termine in diesem Zeitraum.</EmptyState>
        )}
        {days.map((d) => {
          const dayItems = [
            ...allDay.filter((i) => i.day === d),
            ...items.filter((i) => i.day === d),
          ];
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
                      style={i.kind === "TATTOO" ? TATTOO_TEXTURE : undefined}
                    >
                      <span className="block text-sm font-medium">
                        {i.kind === "TATTOO" && <TattooTag n={i.sessionNumber} />}
                        {i.leadName}
                      </span>
                      <span className="block text-xs text-ink-soft tabular-nums">
                        {i.kind === "TATTOO" && i.endMin === 0
                          ? "ganztägig / ohne Uhrzeit"
                          : `${formatTimeOfDay(i.startMin)}–${formatTimeOfDay(i.endMin % 1440)}`}
                        {i.mode && ` · ${CONSULTATION_MODE_LABELS[i.mode]}`}
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
        {allDay.length > 0 && (
          <div
            className="grid border-b border-line"
            style={{ gridTemplateColumns: `3.5rem repeat(${dayCount}, minmax(0, 1fr))` }}
          >
            <div className="pr-2 pt-1.5 text-right text-[11px] text-ink-soft">ganztägig</div>
            {days.map((d) => (
              <div key={d} className="space-y-1 border-l border-line p-1">
                {allDay
                  .filter((i) => i.day === d)
                  .map((i) => (
                    <Link
                      key={i.id}
                      href={`/leads/${i.leadId}`}
                      title={`Tattoo-Termin ${i.sessionNumber} · ${i.leadName} · ${i.tattooerName} (ohne Uhrzeit)`}
                      className={cn(
                        "block truncate rounded-md border-l-4 px-1.5 py-0.5 text-xs",
                        i.tone,
                      )}
                      style={TATTOO_TEXTURE}
                    >
                      <TattooTag n={i.sessionNumber} />
                      {i.leadName}
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        )}
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
                    title={`${i.kind === "TATTOO" ? `Tattoo-Termin ${i.sessionNumber}` : "Beratung"} · ${i.leadName} · ${i.tattooerName}`}
                    className={cn(
                      "absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-xs leading-tight shadow-sm hover:z-10 hover:shadow",
                      i.tone,
                    )}
                    style={{
                      ...(i.kind === "TATTOO" ? TATTOO_TEXTURE : {}),
                      top: (i.startMin - startHour * 60) * PX_PER_MIN,
                      height: Math.max(22, (i.endMin - i.startMin) * PX_PER_MIN - 2),
                      left: `calc(${(i.lane / i.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / i.lanes}% - 4px)`,
                    }}
                  >
                    <span className="block truncate font-medium">
                      {i.kind === "TATTOO" && <TattooTag n={i.sessionNumber} />}
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
