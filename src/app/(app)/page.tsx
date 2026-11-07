import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LeadStatusBadge } from "@/components/lead-status-badge";
import { OutcomePanel } from "@/components/outcome-panel";
import { Badge, Card, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { ActionButton } from "./admin/billing/buttons";
import { resolveHandover } from "./handover-actions";
import { loadDashboard } from "@/lib/dashboard";
import { APP_TIMEZONE, formatRelative } from "@/lib/format";
import { CONSULTATION_MODE_LABELS } from "@/lib/scheduling/event-content";
import { formatTimeOfDay, localMinuteOf } from "@/lib/time";

export const metadata: Metadata = { title: "Übersicht" };

const longDate = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const shortDay = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short" });
const dayNum = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
});
const consultationDate = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const time = (d: Date) => formatTimeOfDay(localMinuteOf(d, APP_TIMEZONE));

function greeting(now: Date) {
  const hour = Math.floor(localMinuteOf(now, APP_TIMEZONE) / 60);
  return hour < 11 ? "Guten Morgen" : hour < 17 ? "Hallo" : "Guten Abend";
}

function SectionTitle({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {children}
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-ink-soft tabular-nums">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

/** Count of one kind of appointment in the week strip: coloured when there is something. */
function CountPill({
  count,
  tone,
  dim,
}: {
  count: number;
  tone: "consultation" | "tattoo";
  dim: boolean;
}) {
  if (!count) return <span className="text-sm leading-6 text-ink-soft/50 tabular-nums">0</span>;
  return (
    <span
      className={cn(
        "min-w-7 rounded-full px-2 text-sm leading-6 font-semibold tabular-nums",
        tone === "consultation"
          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
          : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
        dim && "opacity-70",
      )}
    >
      {count}
    </span>
  );
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-ink-soft hover:text-ink">
      {children} →
    </Link>
  );
}

function Initials({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-ink-soft"
    >
      {letters || "?"}
    </span>
  );
}

function senderLabel(m: { direction: string; sentByBot: boolean; sentById: string | null }) {
  if (m.direction === "INBOUND") return "Kunde";
  if (m.sentByBot) return "Bot";
  if (m.sentById) return "Studio";
  return "Automatisch";
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const saved = typeof (await searchParams).saved === "string";
  const now = new Date();
  const data = await loadDashboard(user, now);
  const firstName = user.name.split(/\s+/)[0];
  const { items, currentId, nextId } = data.today;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm text-ink-soft">{longDate.format(now)}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting(now)}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {items.length === 0
            ? "Heute stehen keine Termine an."
            : `Heute ${items.length === 1 ? "steht 1 Termin" : `stehen ${items.length} Termine`} an${
                data.openCount
                  ? ` · ${data.openCount} Ergebnis${data.openCount === 1 ? "" : "se"} offen`
                  : ""
              }.`}
        </p>
      </header>

      {saved && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Ergebnis gespeichert.
          {data.openCount > 0 ? ` Noch ${data.openCount} offen.` : " Alles erledigt."}
        </p>
      )}

      {/* 0. Chats the bot handed over – only when needed */}
      {data.handovers.length > 0 && (
        <Card className="border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30">
          <SectionTitle count={data.handovers.length}>Braucht euch</SectionTitle>
          <p className="-mt-1 mb-3 text-sm text-ink-soft">
            Der Bot hat diese Chats an euch übergeben. Sie bleiben hier, bis ihr im Chat antwortet,
            den Bot wieder einschaltet oder sie als erledigt markiert (z. B. nach einem Anruf).
          </p>
          <ul className="space-y-2">
            {data.handovers.map((h) => (
              <li key={h.id} className="flex items-center gap-2 rounded-lg bg-surface pr-3">
                <Link
                  href={`/leads/${h.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-3 hover:bg-muted"
                >
                  <Initials name={h.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{h.name}</span>
                    <span className="block truncate text-xs text-ink-soft">
                      {h.botHandoverNote ?? "Übergabe durch den Bot"}
                    </span>
                  </span>
                  {h.botHandoverAt && (
                    <span className="shrink-0 text-xs text-ink-soft">
                      {formatRelative(h.botHandoverAt, now)}
                    </span>
                  )}
                </Link>
                <ActionButton
                  action={resolveHandover.bind(null, h.id)}
                  confirm={`Übergabe für ${h.name} als erledigt markieren? Der Bot bleibt in diesem Chat aus.`}
                >
                  Erledigt
                </ActionButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 1. Open outcomes – only when needed */}
      {data.openCount > 0 && (
        <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
          <SectionTitle
            count={data.openCount}
            action={
              data.openCount > data.openOutcomes.length ? (
                <MoreLink href="/consultations">Alle anzeigen</MoreLink>
              ) : undefined
            }
          >
            Ergebnis eintragen
          </SectionTitle>
          <p className="-mt-1 mb-3 text-sm text-ink-soft">
            Diese Beratungen haben stattgefunden – bitte kurz eintragen, wie sie gelaufen sind.
          </p>
          <ul className="space-y-2">
            {data.openOutcomes.map((c) => (
              <li key={c.id} className="rounded-lg border border-line bg-surface">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                    <span className="font-semibold">{c.lead.name}</span>
                    <span className="text-sm text-ink-soft tabular-nums">
                      {consultationDate.format(c.startsAt)} Uhr
                    </span>
                    {data.isAdmin && (
                      <span className="text-sm text-ink-soft">{c.tattooer.user.name}</span>
                    )}
                    <span className="ml-auto rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-paper group-open:bg-muted group-open:text-ink">
                      <span className="group-open:hidden">Ergebnis eintragen</span>
                      <span className="hidden group-open:inline">Schließen</span>
                    </span>
                  </summary>
                  <div className="border-t border-line p-3">
                    <OutcomePanel c={c} now={now} returnTo="/" sessionsInline />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 2. Today */}
      <Card>
        <SectionTitle
          count={items.length}
          action={<MoreLink href="/calendar?view=day">Kalender</MoreLink>}
        >
          Heute
        </SectionTitle>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">
            Keine Beratungen oder Tattoo-Termine heute.
          </p>
        ) : (
          <ol className="relative space-y-1">
            {items.map((i) => {
              const past = Boolean(i.end && i.end <= now);
              const isCurrent = i.id === currentId;
              const isNext = i.id === nextId;
              return (
                <li key={i.id}>
                  <Link
                    href={`/leads/${i.leadId}`}
                    className={cn(
                      "grid grid-cols-[3.75rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60",
                      past && "opacity-55",
                      isCurrent &&
                        "bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-900",
                    )}
                  >
                    <span className="text-right tabular-nums">
                      <span className="block font-semibold">{i.start ? time(i.start) : "—"}</span>
                      <span className="block text-xs text-ink-soft">
                        {i.end ? time(i.end) : "ganztägig"}
                      </span>
                    </span>
                    <span className="min-w-0 border-l-2 border-line pl-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{i.leadName}</span>
                        <Badge tone={i.kind === "TATTOO" ? "violet" : "blue"}>
                          {i.kind === "TATTOO" ? "Tattoo" : "Beratung"}
                        </Badge>
                        {i.mode === "PHONE" && (
                          <Badge tone="amber">{CONSULTATION_MODE_LABELS.PHONE}</Badge>
                        )}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">
                        {data.isAdmin
                          ? i.tattooerName
                          : i.mode === "PHONE" && i.phone
                            ? i.phone
                            : ""}
                        {data.isAdmin && i.mode === "PHONE" && i.phone ? ` · ${i.phone}` : ""}
                      </span>
                    </span>
                    <span className="text-xs font-semibold">
                      {isCurrent ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Jetzt</span>
                      ) : isNext ? (
                        <span className="text-ink">Als Nächstes</span>
                      ) : past ? (
                        <span className="font-normal text-ink-soft">vorbei</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* 3. This week */}
      <Card>
        <SectionTitle action={<MoreLink href="/calendar?view=week">Woche ansehen</MoreLink>}>
          Diese Woche
        </SectionTitle>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-3xl font-semibold tabular-nums">{data.week.consultations}</p>
            <p className="text-sm text-ink-soft">Beratungen</p>
          </div>
          <div className="rounded-lg bg-muted/60 p-3">
            <p className="text-3xl font-semibold tabular-nums">{data.week.tattoos}</p>
            <p className="text-sm text-ink-soft">Tattoo-Termine</p>
          </div>
        </div>
        <ol className="grid grid-cols-7 gap-1.5" aria-label="Termine pro Tag">
          {data.week.days.map((d) => {
            const isToday = d.date === data.week.today;
            const isPast = d.date < data.week.today;
            const busy = d.consultations + d.tattoos > 0;
            const label = new Date(`${d.date}T12:00:00Z`);
            return (
              <li key={d.date}>
                <Link
                  href={`/calendar?view=day&date=${d.date}`}
                  title={`${d.consultations} Beratungen, ${d.tattoos} Tattoo-Termine`}
                  className={cn(
                    "block rounded-lg border px-1 py-2 text-center transition-colors hover:bg-muted/60",
                    isToday ? "border-ink" : busy ? "border-line bg-muted/50" : "border-line",
                  )}
                >
                  {/* Past days: only the date is dimmed, the appointments stay recognisable */}
                  <span className={cn(isPast && !isToday && "opacity-55")}>
                    <span
                      className={cn("block text-xs", isToday ? "font-semibold" : "text-ink-soft")}
                    >
                      {shortDay.format(label)}
                    </span>
                    <span className="block text-[11px] text-ink-soft tabular-nums">
                      {dayNum.format(label)}
                    </span>
                  </span>
                  <span className="mt-1.5 flex flex-col items-center gap-1">
                    <CountPill count={d.consultations} tone="consultation" dim={isPast} />
                    <CountPill count={d.tattoos} tone="tattoo" dim={isPast} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-ink-soft">
          Pro Tag: oben Beratungen (blau), darunter Tattoo-Termine (lila).
        </p>
      </Card>

      {/* 4. Latest WhatsApp contacts */}
      <Card>
        <SectionTitle action={<MoreLink href="/leads">Alle Leads</MoreLink>}>
          Letzte WhatsApp-Kontakte
        </SectionTitle>
        {data.contacts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-soft">
            Der Bot hat noch mit niemandem gechattet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {data.contacts.map((l) => {
              const m = l.messages[0];
              return (
                <li key={l.id}>
                  <Link
                    href={`/leads/${l.id}#chat`}
                    className="flex gap-3 rounded-lg px-1 py-3 hover:bg-muted/60"
                  >
                    <Initials name={l.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{l.name}</span>
                        <LeadStatusBadge status={l.status} />
                        {!l.botEnabled && <Badge tone="violet">Bot aus</Badge>}
                        {m && (
                          <span className="ml-auto text-xs text-ink-soft">
                            {formatRelative(m.sentAt, now)}
                          </span>
                        )}
                      </span>
                      {m && (
                        <span className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                          <span
                            className={cn(
                              "font-medium",
                              m.direction === "INBOUND" ? "text-ink" : "",
                            )}
                          >
                            {senderLabel(m)}:
                          </span>{" "}
                          {m.body ?? `[${m.templateName ?? "Nachricht"}]`}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
