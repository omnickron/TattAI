import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, cn, PageHeader, Select, Button } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";
import { formatEuro } from "@/lib/outcomes/money";
import { CONSULTATION_MODE_LABELS, summaryLines } from "@/lib/scheduling/event-content";
import { EntryChip, type EntryDetail } from "./entry-detail";
import { tattooerColor, textColorOn } from "@/lib/tattooer-colors";
import { loadConsultationOptions } from "@/lib/consultation-options";
import { AddEntryButton, BlockerChip, ClickLayer, NewEntryProvider } from "./new-entry";
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


const dayHeader = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
const weekdayShort = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short" });
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

/** ISO 8601 calendar week of a local date (YYYY-MM-DD). */
function isoWeek(localDate: string): number {
  const d = asUtcDate(localDate);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7);
}

/** Lets long names wrap even inside very narrow columns (mobile week view). */
const WRAP = "break-words [overflow-wrap:anywhere] hyphens-auto";

/** Tattoo sessions get a diagonal texture so they differ from consultations without relying on color. */
const TATTOO_TEXTURE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, currentColor 8%, transparent) 6px 12px)",
};

const BLOCK_TONE =
  "border-l-zinc-400 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
const BLOCK_TEXTURE = {
  backgroundImage:
    "repeating-linear-gradient(45deg, transparent 0 5px, color-mix(in srgb, currentColor 10%, transparent) 5px 10px)",
};

type Item = {
  id: string;
  kind: "CONSULTATION" | "TATTOO" | "BLOCKER";
  blockId?: string;
  note?: string | null;
  tattooerId?: string;
  sessionNumber?: number;
  leadId: string;
  leadName: string;
  tattooerName: string;
  tone: string;
  /** Background of consultations and tattoo sessions (tattooer's calendar color). */
  color?: string;
  status: string;
  mode: "ON_SITE" | "PHONE" | null;
  day: string;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
  detail?: EntryDetail;
};

const whenFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});
function whenLabel(start: Date, end: Date | null) {
  return end
    ? `${whenFmt.format(start)} · ${timeFmt.format(start)}–${timeFmt.format(end)} Uhr`
    : `${whenFmt.format(start)} · ganztägig (ohne Uhrzeit)`;
}
function motifOf(summary: unknown): string | null {
  const m = (summary as { motif?: unknown } | null)?.motif;
  return typeof m === "string" && m.trim() ? m.trim() : null;
}

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
  const now = new Date();
  const today = localDateOf(now, APP_TIMEZONE);
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
      walkIn: false,
      lead: { isTest: false },
      startsAt: {
        gte: startOfLocalDay(first, APP_TIMEZONE),
        lt: startOfLocalDay(addDays(first, dayCount), APP_TIMEZONE),
      },
      ...(scopeTattooer ? { tattooerId: scopeTattooer } : {}),
    },
    include: {
      lead: { select: { id: true, name: true, phoneE164: true, tattooSummary: true } },
      tattooer: { select: { id: true, createdAt: true, user: { select: { name: true } } } },
      attachments: {
        where: { status: { in: ["STORED", "PENDING"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, mimeType: true, caption: true },
      },
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
          lead: { select: { id: true, name: true, phoneE164: true, tattooSummary: true } },
          tattooer: { select: { id: true, user: { select: { name: true } } } },
          tattooBookings: { where: { cancelled: false }, select: { amountCents: true } },
          attachments: {
            where: { status: { in: ["STORED", "PENDING"] } },
            orderBy: { createdAt: "asc" },
            select: { id: true, status: true, mimeType: true, caption: true },
          },
        },
      },
    },
    orderBy: [{ startsAt: "asc" }, { date: "asc" }],
  });

  // Calendar colors per tattooer (set by the admin, otherwise by order of creation)
  const colorProfiles = await prisma.tattooerProfile.findMany({
    select: { id: true, calendarColor: true },
    orderBy: { createdAt: "asc" },
  });
  const colors = new Map(colorProfiles.map((p, i) => [p.id, tattooerColor(p.calendarColor, i)]));
  const colorFor = (tattooerId: string) => colors.get(tattooerId) ?? tattooerColor(null, 0);
  const colorStyle = (i: Item) =>
    i.color ? { backgroundColor: i.color, color: textColorOn(i.color) } : {};
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
      tone: "",
      color: colorFor(c.tattooer.id),
      status: c.status,
      mode: c.mode,
      detail: {
        kind: "CONSULTATION",
        title: "Beratung",
        leadId: c.lead.id,
        leadName: c.lead.name,
        phone: c.lead.phoneE164,
        when: whenLabel(c.startsAt, c.endsAt),
        tattooerName: c.tattooer.user.name,
        mode: CONSULTATION_MODE_LABELS[c.mode],
        status:
          c.status === "HELD"
            ? { label: "stattgefunden", tone: "green" }
            : c.status === "NO_SHOW"
              ? { label: "No-Show", tone: "red" }
              : c.endsAt <= now
                ? { label: "Ergebnis fehlt", tone: "amber" }
                : { label: "geplant", tone: "blue" },
        motif: motifOf(c.lead.tattooSummary),
        summary: summaryLines(c.lead.tattooSummary).filter(
          (l) => !l.startsWith("Motiv:") && !l.startsWith("Referenzbilder"),
        ),
        images: c.attachments,
        amount: null,
        total: null,
        note: null,
      },
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
      tone: "",
      color: colorFor(t.id),
      status: "TATTOO",
      mode: null,
      lane: 0,
      lanes: 1,
      detail: {
        kind: "TATTOO" as const,
        title: `Tattoo-Termin${sn.consultation.tattooBookings.length > 1 ? ` ${sn.sessionNumber}` : ""}`,
        leadId: sn.consultation.lead.id,
        leadName: sn.consultation.lead.name,
        phone: sn.consultation.lead.phoneE164,
        when:
          sn.startsAt && sn.endsAt ? whenLabel(sn.startsAt, sn.endsAt) : whenLabel(sn.date, null),
        tattooerName: t.user.name,
        mode: null,
        status: null,
        motif: motifOf(sn.consultation.lead.tattooSummary),
        summary: summaryLines(sn.consultation.lead.tattooSummary).filter(
          (l) => !l.startsWith("Motiv:") && !l.startsWith("Referenzbilder"),
        ),
        images: sn.consultation.attachments,
        amount: sn.amountCents != null ? formatEuro(sn.amountCents) : null,
        total:
          sn.consultation.tattooBookings.length > 1
            ? formatEuro(
                sn.consultation.tattooBookings.reduce((sum, b) => sum + (b.amountCents ?? 0), 0),
              )
            : null,
        note: sn.note,
      },
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
  // Blockers and absences (unavailability), clipped to the visible days
  const blocks = await prisma.availabilityException.findMany({
    where: {
      kind: "UNAVAILABLE",
      startsAt: { lt: rangeEnd },
      endsAt: { gt: rangeStart },
      ...(scopeTattooer ? { tattooerId: scopeTattooer } : {}),
    },
    include: { tattooer: { select: { id: true, user: { select: { name: true } } } } },
  });
  for (const b of blocks) {
    for (const d of days) {
      const dayStart = startOfLocalDay(d, APP_TIMEZONE);
      const dayEnd = startOfLocalDay(addDays(d, 1), APP_TIMEZONE);
      if (b.startsAt >= dayEnd || b.endsAt <= dayStart) continue;
      const base = {
        id: `block-${b.id}-${d}`,
        kind: "BLOCKER" as const,
        blockId: b.id,
        note: b.note,
        tattooerId: b.tattooerId,
        leadId: "",
        leadName: b.note || "Blocker",
        tattooerName: b.tattooer.user.name,
        tone: BLOCK_TONE,
        status: "BLOCKER",
        mode: null,
        day: d,
        lane: 0,
        lanes: 1,
      };
      if (b.startsAt <= dayStart && b.endsAt >= dayEnd) {
        allDay.push({ ...base, startMin: 0, endMin: 0 });
      } else {
        const from = b.startsAt > dayStart ? localMinuteOf(b.startsAt, APP_TIMEZONE) : 0;
        const to = b.endsAt < dayEnd ? localMinuteOf(b.endsAt, APP_TIMEZONE) : 1440;
        items.push({ ...base, startMin: from, endMin: Math.max(from + 15, to) });
      }
    }
  }

  // People the "new appointment" dialog offers (admin: all active, tattooer: self)
  const dialogTattooers = (
    await prisma.tattooerProfile.findMany({
      where: isAdmin ? { user: { active: true } } : { id: user.tattooerProfile?.id ?? "__none__" },
      select: { id: true, consultationMinutes: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    })
  ).map((t) => ({ id: t.id, name: t.user.name, consultationMinutes: t.consultationMinutes }));
  const canCreate = dialogTattooers.length > 0;
  const canDeleteBlock = (tattooerId?: string) =>
    isAdmin || tattooerId === user.tattooerProfile?.id;

  items.sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin);
  for (const d of days) layoutLanes(items.filter((i) => i.day === d));

  const startHour = Math.min(8, ...items.map((i) => Math.floor(i.startMin / 60)));
  const endHour = Math.max(20, ...items.map((i) => Math.ceil(i.endMin / 60)));
  const nowMin = localMinuteOf(now, APP_TIMEZONE);
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
    <NewEntryProvider
      isAdmin={isAdmin}
      tattooers={dialogTattooers}
      defaultTattooerId={isAdmin ? filter : (user.tattooerProfile?.id ?? null)}
      modes={(await loadConsultationOptions(prisma)).modes}
    >
      <PageHeader
        title="Kalender"
        description={
          isAdmin
            ? "Beratungen, Tattoo-Termine und Blocker aller Tätowierer – mit „+ Termin“ oder einem Klick auf eine freie Stelle trägst du etwas ein."
            : "Deine Beratungen, Tattoo-Termine und Blocker – mit „+ Termin“ oder einem Klick auf eine freie Stelle trägst du etwas ein."
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canCreate && (
          <span className="hidden md:block">
            <AddEntryButton date={date < today ? today : date} />
          </span>
        )}
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

      {/* Time grid (TeamUp-like): also used on mobile with narrow day columns */}
      <div
        className="-mx-4 overflow-hidden border-y border-line bg-surface [--tc:2.6rem] sm:mx-0 sm:rounded-xl sm:border md:[--tc:3.5rem]"
      >
        <div
          className="grid border-b border-line"
          style={{ gridTemplateColumns: `var(--tc) repeat(${dayCount}, minmax(0, 1fr))` }}
        >
          <div className="flex items-center justify-center text-[11px] font-medium text-ink-soft">
            KW{isoWeek(first)}
          </div>
          {days.map((d) => (
            <Link
              key={d}
              href={href({ view: "day", date: d })}
              aria-current={d === today ? "date" : undefined}
              className={cn(
                "flex flex-col items-center border-l border-line px-0.5 py-1.5 leading-tight hover:bg-muted",
                d === today ? "bg-muted/60 text-accent" : "text-ink",
              )}
            >
              <span className="text-lg font-semibold tabular-nums md:text-xl">
                {Number(d.slice(8))}
              </span>
              <span className={cn("text-[11px]", d === today ? "text-accent" : "text-ink-soft")}>
                {view === "week"
                  ? weekdayShort.format(asUtcDate(d)).replace(".", "")
                  : longDay.format(asUtcDate(d))}
              </span>
            </Link>
          ))}
        </div>
        {allDay.length > 0 && (
          <div
            className="grid border-b border-line"
            style={{ gridTemplateColumns: `var(--tc) repeat(${dayCount}, minmax(0, 1fr))` }}
          >
            <div />
            {days.map((d) => (
              <div
                key={d}
                className={cn("space-y-1 border-l border-line p-0.5", d === today && "bg-muted/60")}
              >
                {allDay
                  .filter((i) => i.day === d)
                  .map((i) =>
                    i.kind === "BLOCKER" ? (
                      <BlockerChip
                        key={i.id}
                        id={i.blockId!}
                        canDelete={canDeleteBlock(i.tattooerId)}
                        className={cn(
                          "block w-full truncate rounded-md border-l-4 px-1 py-1 text-xs font-medium",
                          i.tone,
                        )}
                        style={BLOCK_TEXTURE}
                      >
                        {i.note || "Blocker"}
                        {isAdmin && (
                          <span className="hidden md:inline">{` · ${i.tattooerName}`}</span>
                        )}
                      </BlockerChip>
                    ) : (
                      <EntryChip
                        key={i.id}
                        detail={i.detail!}
                        title={`Tattoo-Termin ${i.sessionNumber} · ${i.leadName} · ${i.tattooerName} (ohne Uhrzeit)`}
                        className={cn(
                          "block w-full truncate rounded-md px-1 py-1 text-xs font-medium",
                          i.tone,
                        )}
                        style={{ ...TATTOO_TEXTURE, ...colorStyle(i) }}
                      >
                        {i.leadName}
                      </EntryChip>
                    ),
                  )}
              </div>
            ))}
          </div>
        )}
        <div
          className="grid"
          style={{ gridTemplateColumns: `var(--tc) repeat(${dayCount}, minmax(0, 1fr))` }}
        >
          <div className="relative">
            {hours.map((h) => (
              <div
                key={h}
                className="pr-1 text-right text-[11px] text-ink-soft tabular-nums md:pr-2"
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
              className={cn("relative border-l border-line", d === today && "bg-muted/60")}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  className="border-t border-line/60 first:border-t-0"
                  style={{ height: 60 * PX_PER_MIN }}
                />
              ))}
              {canCreate && <ClickLayer day={d} startHour={startHour} pxPerMin={PX_PER_MIN} />}
              {items
                .filter((i) => i.day === d)
                .map((i) => {
                  const box = {
                    top: (i.startMin - startHour * 60) * PX_PER_MIN,
                    height: Math.max(22, (i.endMin - i.startMin) * PX_PER_MIN - 2),
                    left: `calc(${(i.lane / i.lanes) * 100}% + 2px)`,
                    width: `calc(${100 / i.lanes}% - 4px)`,
                  };
                  if (i.kind === "BLOCKER") {
                    return (
                      <BlockerChip
                        key={i.id}
                        id={i.blockId!}
                        canDelete={canDeleteBlock(i.tattooerId)}
                        className={cn(
                          "absolute z-[1] overflow-hidden rounded-md border-l-4 px-1 py-1 text-xs leading-tight",
                          WRAP,
                          i.tone,
                        )}
                        style={{ ...BLOCK_TEXTURE, ...box }}
                      >
                        <span className="block font-medium">{i.note || "Blocker"}</span>
                        <span className="hidden opacity-80 tabular-nums md:block">
                          {formatTimeOfDay(i.startMin)}–{formatTimeOfDay(i.endMin % 1440)}
                          {isAdmin && ` · ${i.tattooerName}`}
                        </span>
                      </BlockerChip>
                    );
                  }
                  return (
                    <EntryChip
                      key={i.id}
                      detail={i.detail!}
                      title={`${i.kind === "TATTOO" ? `Tattoo-Termin ${i.sessionNumber}` : "Beratung"} · ${i.leadName} · ${i.tattooerName}`}
                      className={cn(
                        "absolute z-[1] overflow-hidden rounded-md px-1 py-1 text-left text-xs leading-tight shadow-sm hover:z-10 hover:shadow md:text-[13px]",
                        WRAP,
                        i.tone,
                      )}
                      style={{ ...(i.kind === "TATTOO" ? TATTOO_TEXTURE : {}), ...colorStyle(i), ...box }}
                    >
                      <span className="block font-medium">
                        {i.kind === "TATTOO" ? "Tattoo: " : "Beratung: "}
                        {i.mode === "PHONE" && "☎ "}
                        {i.leadName}
                        {isAdmin && !filter && ` (${i.tattooerName})`}
                      </span>
                      <span className="hidden opacity-80 tabular-nums md:block">
                        {formatTimeOfDay(i.startMin)}–{formatTimeOfDay(i.endMin % 1440)}
                      </span>
                    </EntryChip>
                  );
                })}
              {d === today && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-[5] h-0.5 bg-accent"
                  style={{ top: (nowMin - startHour * 60) * PX_PER_MIN }}
                >
                  <span className="absolute -top-[5px] -left-[6px] size-3 rounded-full bg-accent" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {canCreate && <AddEntryButton variant="fab" date={date < today ? today : date} className="md:hidden" />}
    </NewEntryProvider>
  );
}
