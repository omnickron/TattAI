/**
 * Lead funnel and revenue report (pure, no I/O).
 *
 * Attribution: everything is assigned to the period in which the LEAD came in
 * (cohort view) – consultations, tattoo bookings and revenue of those leads,
 * whenever they happen. This answers "what did the leads of this campaign/period bring?".
 * Per tattooer, a lead counts with ITS OWN consultations and tattoos only (e.g. consultation
 * and tattoo with Alex, a later walk-in tattoo with Kim → each gets their own revenue).
 * Cancelled consultations (reschedules/reassignments) only count if nothing else is left.
 */
import {
  attendanceMissing,
  sessionRevenueCents,
  type RevenueSession,
} from "../outcomes/session-revenue";
import { addDays, DEFAULT_TIME_ZONE, localDateOf, startOfWeek } from "../time";

export interface ReportSession extends RevenueSession {
  date: Date;
  endsAt?: Date | null;
}

export interface ReportConsultation {
  tattooerId: string;
  status: "SCHEDULED" | "HELD" | "NO_SHOW" | "CANCELLED";
  startsAt: Date;
  /** End of the consultation (open outcome only once it is over). */
  endsAt?: Date;
  tattooBooked: boolean | null;
  // Walk-in tattoo without consultation: counts for won/revenue, not as a consultation
  walkIn?: boolean;
  sessions: ReportSession[];
}

export interface ReportLead {
  id: string;
  createdAt: Date;
  campaignId: string | null;
  campaignName: string | null;
  source: "META_LEAD_AD" | "MANUAL";
  consultations: ReportConsultation[];
}

export interface Metrics {
  leads: number;
  booked: number;
  held: number;
  noShow: number;
  /** Leads with a booked tattoo (incl. walk-ins) */
  won: number;
  /** …of which via a consultation (basis of all conversion rates) */
  wonFromConsultation: number;
  /** …of which only as walk-in (no consultation won the tattoo) */
  walkIns: number;
  open: number;
  sessions: number;
  revenueCents: number;
  revenueRealizedCents: number;
  missingAmounts: number;
  /** Tattoo sessions that are over without "erschienen / nicht erschienen" */
  missingAttendance: number;
}

export interface Report {
  totals: Metrics;
  byCampaign: Array<{ key: string; label: string; metrics: Metrics }>;
  byTattooer: Array<{ key: string; metrics: Metrics }>;
  series: Array<{ key: string; label: string; metrics: Metrics }>;
  granularity: "week" | "month";
}

const empty = (): Metrics => ({
  leads: 0,
  booked: 0,
  held: 0,
  noShow: 0,
  won: 0,
  wonFromConsultation: 0,
  walkIns: 0,
  open: 0,
  sessions: 0,
  revenueCents: 0,
  revenueRealizedCents: 0,
  missingAmounts: 0,
  missingAttendance: 0,
});

/**
 * Tattooers a lead counts for: everyone with a non-cancelled consultation or walk-in;
 * if all were cancelled, the one of the latest consultation.
 */
export function tattooersOf(lead: ReportLead): string[] {
  const active = [
    ...new Set(lead.consultations.filter((c) => c.status !== "CANCELLED").map((c) => c.tattooerId)),
  ];
  if (active.length) return active;
  const latest = attributedTattooer(lead);
  return latest ? [latest] : [];
}

/** The lead restricted to one tattooer's consultations. */
function onlyOf(lead: ReportLead, tattooerId: string): ReportLead {
  return { ...lead, consultations: lead.consultations.filter((c) => c.tattooerId === tattooerId) };
}

/** The main tattooer of a lead, or null if it never had a consultation. */
export function attributedTattooer(lead: ReportLead): string | null {
  const held = lead.consultations.filter((c) => c.status === "HELD");
  const pool = held.length ? held : lead.consultations;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0].tattooerId;
}

function addLead(m: Metrics, lead: ReportLead, now: Date) {
  const all = lead.consultations;
  const cs = all.filter((c) => !c.walkIn);
  m.leads++;
  if (cs.length) m.booked++;
  const held = cs.some((c) => c.status === "HELD");
  if (held) m.held++;
  else if (cs.some((c) => c.status === "NO_SHOW")) m.noShow++;
  const viaConsultation = cs.some((c) => c.status === "HELD" && c.tattooBooked === true);
  const viaWalkIn = all.some((c) => c.walkIn && c.tattooBooked === true);
  if (viaConsultation || viaWalkIn) m.won++;
  if (viaConsultation) m.wonFromConsultation++;
  else if (viaWalkIn) m.walkIns++;
  m.open += cs.filter((c) => c.status === "SCHEDULED" && (c.endsAt ?? c.startsAt) <= now).length;
  for (const c of all) {
    if (!(c.status === "HELD" && c.tattooBooked)) continue;
    for (const s of c.sessions) {
      if (s.cancelled) continue;
      m.sessions++;
      const revenue = sessionRevenueCents(s);
      if (revenue === null) m.missingAmounts++;
      if (attendanceMissing({ ...s, endsAt: s.endsAt ?? null }, now)) m.missingAttendance++;
      m.revenueCents += revenue ?? 0;
      if (s.date <= now) m.revenueRealizedCents += revenue ?? 0;
    }
  }
}

export interface ReportOptions {
  now: Date;
  from: string; // local date, inclusive
  to: string; // local date, inclusive
  tattooerId?: string | null;
  timeZone?: string;
}

const monthLabel = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  month: "short",
  year: "2-digit",
});
const dayLabel = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
});

function bucketsFor(from: string, to: string, granularity: "week" | "month") {
  const keys: Array<{ key: string; label: string }> = [];
  if (granularity === "week") {
    for (let d = startOfWeek(from); d <= to; d = addDays(d, 7)) {
      keys.push({ key: d, label: dayLabel.format(new Date(`${d}T12:00:00Z`)) });
    }
  } else {
    let [y, m] = from.split("-").map(Number);
    const [ty, tm] = to.split("-").map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      keys.push({ key, label: monthLabel.format(new Date(`${key}-15T12:00:00Z`)) });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }
  return keys;
}

export function buildReport(leads: ReportLead[], opts: ReportOptions): Report {
  const tz = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const days =
    Math.round(
      (Date.parse(`${opts.to}T00:00:00Z`) - Date.parse(`${opts.from}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const granularity = days <= 120 ? "week" : "month";

  const totals = empty();
  const campaigns = new Map<string, { label: string; metrics: Metrics }>();
  const tattooers = new Map<string, Metrics>();
  const buckets = bucketsFor(opts.from, opts.to, granularity);
  const series = new Map(buckets.map((b) => [b.key, empty()]));

  for (const full of leads) {
    const involved = tattooersOf(full);
    if (opts.tattooerId && !involved.includes(opts.tattooerId)) continue;
    // With a tattooer filter, only that person's part of the lead counts
    const lead = opts.tattooerId ? onlyOf(full, opts.tattooerId) : full;

    addLead(totals, lead, opts.now);

    const ckey = lead.campaignId ?? (lead.source === "MANUAL" ? "manual" : "unknown");
    const clabel =
      lead.campaignName ?? (lead.source === "MANUAL" ? "Manuell angelegt" : "Ohne Kampagne");
    if (!campaigns.has(ckey)) campaigns.set(ckey, { label: clabel, metrics: empty() });
    addLead(campaigns.get(ckey)!.metrics, lead, opts.now);

    for (const t of opts.tattooerId ? [opts.tattooerId] : involved) {
      if (!tattooers.has(t)) tattooers.set(t, empty());
      addLead(tattooers.get(t)!, onlyOf(full, t), opts.now);
    }

    const local = localDateOf(lead.createdAt, tz);
    const bkey = granularity === "week" ? startOfWeek(local) : local.slice(0, 7);
    const bucket = series.get(bkey);
    if (bucket) addLead(bucket, lead, opts.now);
  }

  const byRevenue = (a: Metrics, b: Metrics) =>
    b.revenueCents - a.revenueCents || b.leads - a.leads;
  return {
    totals,
    byCampaign: [...campaigns.entries()]
      .map(([key, v]) => ({ key, label: v.label, metrics: v.metrics }))
      .sort((a, b) => byRevenue(a.metrics, b.metrics)),
    byTattooer: [...tattooers.entries()]
      .map(([key, metrics]) => ({ key, metrics }))
      .sort((a, b) => byRevenue(a.metrics, b.metrics)),
    series: buckets.map((b) => ({ ...b, metrics: series.get(b.key)! })),
    granularity,
  };
}

/** Share as fraction, or null when the base is 0. */
export function rate(part: number, base: number): number | null {
  return base > 0 ? part / base : null;
}
